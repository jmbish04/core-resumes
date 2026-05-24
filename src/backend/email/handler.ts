/**
 * @fileoverview Inbound email handler for the Career Orchestrator.
 *
 * Every inbound email is:
 *  1. Parsed with postal-mime and unconditionally stored in D1
 *  2. Decomposed into individual email_parties records (FROM/TO/CC/BCC)
 *  3. Checked against ALLOWED_EMAILS — only emails involving an allowed
 *     address trigger AI classification, role matching, and workflows
 *  4. If a forwarded thread is detected, each sub-message is extracted
 *     and stored as a separate email record linked via parent_email_id
 *
 * Called from `_worker.ts` via the Worker `email()` handler.
 */

import { desc, eq, inArray } from "drizzle-orm";
import PostalMime, { type Address } from "postal-mime";

import { enqueueOrchestratorTask } from "../ai/agents/orchestrator";
import { classifyEmailStatus, matchEmailToRole } from "../ai/tasks";
import { getDb } from "../db";
import {
  emailAttachments,
  emailParties,
  emails,
  messages,
  roles,
  threads,
  type Role,
} from "../db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleInboundEmail(
  message: ForwardableEmailMessage,
  env: Env,
  ctx: ExecutionContext,
) {
  const [parseStream, rawStream] = message.raw.tee();
  const [parsed, rawContent] = await Promise.all([
    PostalMime.parse(parseStream, { attachmentEncoding: "base64" }),
    new Response(rawStream).text(),
  ]);

  const db = getDb(env);
  const emailId = crypto.randomUUID();
  const subject = parsed.subject?.trim() || "(no subject)";
  const body = parsed.text?.trim() || stripHtml(parsed.html?.trim() || "");
  const sender = formatAddress(parsed.from, message.from);
  const senderDomain = extractDomain(sender);
  const messageId = parsed.messageId || message.headers.get("message-id") || undefined;
  const inReplyTo = parsed.headers?.find((h) => h.key === "in-reply-to")?.value || undefined;

  // ── 1. Insert email record unconditionally ──────────────────────────────
  await db.insert(emails).values({
    id: emailId,
    subject,
    body,
    sender,
    senderDomain,
    messageId,
    inReplyTo,
    rawContent,
    processedStatus: "pending",
  });

  // ── 2. Extract and insert all email parties ─────────────────────────────
  const allowedEmails = getAllowedEmails(env);
  const parties = extractParties(parsed, message);
  let hasSelf = false;

  for (const party of parties) {
    const isSelf = allowedEmails.has(party.address.toLowerCase());
    if (isSelf) hasSelf = true;

    await db.insert(emailParties).values({
      id: crypto.randomUUID(),
      emailId,
      type: party.type,
      name: party.name || null,
      address: party.address,
      domain: extractDomain(party.address),
      isSelf,
    });
  }

  // ── 3. Store attachment records (files uploaded to Drive in Phase 3) ─────
  const attachments = parsed.attachments ?? [];
  for (const att of attachments) {
    const content = att.content instanceof Uint8Array ? att.content : new Uint8Array(0);
    await db.insert(emailAttachments).values({
      id: crypto.randomUUID(),
      emailId,
      name: att.filename || "unnamed",
      mimeType: att.mimeType || "application/octet-stream",
      sizeBytes: content.byteLength || null,
    });
  }

  // ── 4. Allowed-email gate ───────────────────────────────────────────────
  // Every email is stored, but only trigger actions if an allowed email
  // address appears in the parties list.
  if (!hasSelf) {
    const { Logger } = await import("@/backend/lib/logger");
    const logger = new Logger(env);
    await logger.info(`[email] No allowed email in parties — stored as pending (${emailId})`);
    return;
  }

  // ── 5. Thread decomposition for forwarded messages ──────────────────────
  ctx.waitUntil(decomposeThreadIfForwarded(env, emailId, subject, body));

  // ── 6. Role matching ───────────────────────────────────────────────────
  const activeRoles = await db
    .select()
    .from(roles)
    .where(inArray(roles.status, ["preparing", "applied", "interviewing"]));

  let matchResult;
  try {
    matchResult = await matchEmailToRole(
      env,
      messageId || emailId,
      subject,
      body,
      senderDomain,
      activeRoles,
    );
  } catch (error) {
    const { Logger } = await import("@/backend/lib/logger");
    const logger = new Logger(env);
    await logger.error("Email role matching failed", { error: String(error) });
    matchResult = {
      messageId: messageId || emailId,
      roleId: null,
      aiRationale: "AI inference failed.",
      aiConfidence: 0,
    };
  }

  // Persist the AI's reasoning regardless of whether it found a match
  await db
    .update(emails)
    .set({
      aiRoleMatchConfidence: matchResult.aiConfidence,
      aiRoleMatchRationale: matchResult.aiRationale,
    })
    .where(eq(emails.id, emailId));

  if (matchResult.roleId) {
    const matchedRole = activeRoles.find((r) => r.id === matchResult.roleId);
    if (matchedRole) {
      await associateEmailWithRole(env, ctx, emailId, matchedRole, subject, sender);
      return;
    }
  }

  // ── 7. No match — hold for manual association ──────────────────────────
  await db.update(emails).set({ processedStatus: "unmatched" }).where(eq(emails.id, emailId));
  ctx.waitUntil(sendUnmatchedReply(env, message, emailId, activeRoles));
}

// ---------------------------------------------------------------------------
// Email association + workflow trigger
// ---------------------------------------------------------------------------

/**
 * Associate an email with a role and trigger the full email processing
 * workflow. This function is called both from the handler (auto-match) and
 * from the API (manual re-association). Every call re-triggers the workflow
 * so that corrections to wrong auto-matches re-process with correct context.
 */
export async function associateEmailWithRole(
  env: Env,
  ctx: ExecutionContext | null,
  emailId: string,
  role: Role,
  subject: string,
  sender: string,
) {
  const db = getDb(env);
  const [thread] = await ensureRoleThread(env, role);
  const content = [
    `📧 Inbound email matched to ${role.companyName} / ${role.jobTitle}.`,
    `From: ${sender}`,
    `Subject: ${subject}`,
  ].join("\n");

  await db
    .update(emails)
    .set({ roleId: role.id, processedStatus: "associated" })
    .where(eq(emails.id, emailId));

  await db.insert(messages).values({
    id: crypto.randomUUID(),
    threadId: thread.id,
    roleId: role.id,
    author: "system",
    content,
    metadata: { emailId, source: "email_handler" },
  });

  // --- AI-powered status inference ---
  const emailRecord = await db.select().from(emails).where(eq(emails.id, emailId)).limit(1);
  const emailBody = emailRecord[0]?.body ?? "";

  try {
    const inference = await classifyEmailStatus(env, subject, emailBody, role.status);

    // Persist classification on the email record
    await db
      .update(emails)
      .set({ classificationJson: inference as Record<string, unknown> })
      .where(eq(emails.id, emailId));

    if (
      inference.suggestedStatus &&
      inference.confidence > 0.7 &&
      inference.suggestedStatus !== role.status
    ) {
      const { RoleStatusService } = await import("../services/role-status-service");
      await RoleStatusService.transition(env, role.id, inference.suggestedStatus, {
        trigger: "email_inference",
        notes: inference.reasoning,
        metadata: { emailId, confidence: inference.confidence },
      });

      await db.insert(messages).values({
        id: crypto.randomUUID(),
        threadId: thread.id,
        roleId: role.id,
        author: "system",
        content: `🤖 Status auto-updated: ${role.status} → ${inference.suggestedStatus} (confidence: ${(inference.confidence * 100).toFixed(0)}%)\n${inference.reasoning}`,
        metadata: { source: "email_status_inference", emailId, inference },
      });
    } else if (inference.suggestedStatus && inference.confidence > 0.4) {
      // Log low-confidence suggestion without auto-updating
      await db.insert(messages).values({
        id: crypto.randomUUID(),
        threadId: thread.id,
        roleId: role.id,
        author: "system",
        content: `🤖 Status suggestion (low confidence): ${inference.suggestedStatus} (${(inference.confidence * 100).toFixed(0)}%)\n${inference.reasoning}`,
        metadata: { source: "email_status_inference", emailId, inference },
      });
    }
  } catch (err) {
    const { Logger } = await import("@/backend/lib/logger");
    const logger = new Logger(env);
    await logger.error("Email status inference failed (non-fatal)", { error: String(err) });
  }

  // --- Drive archival (non-blocking) ---
  if (role.driveFolderId) {
    try {
      const { archiveEmailToDrive } = await import("./drive-archival");
      // Fire and forget — Drive failures are non-fatal
      archiveEmailToDrive(env, emailId, role.driveFolderId).catch(async (err) => {
        const { Logger } = await import("@/backend/lib/logger");
        const logger = new Logger(env);
        await logger.error("Email Drive archival failed (non-fatal)", { error: String(err) });
      });
    } catch (err) {
      const { Logger } = await import("@/backend/lib/logger");
      const logger = new Logger(env);
      await logger.error("Drive archival import failed (non-fatal)", { error: String(err) });
    }
  }

  // Enqueue draft reply workflow
  await enqueueOrchestratorTask(env, role.id, {
    type: "email_draft",
    roleId: role.id,
    payload: { emailId },
  });
}

// ---------------------------------------------------------------------------
// Allowed emails list
// ---------------------------------------------------------------------------

function getAllowedEmails(env: Env): Set<string> {
  const raw = (env as unknown as Record<string, unknown>).ALLOWED_EMAILS;
  if (!raw) return new Set();

  // wrangler vars array → string[] at runtime
  const list = Array.isArray(raw) ? raw : [raw];
  return new Set(list.map((e) => e.trim().toLowerCase()).filter(Boolean));
}

// ---------------------------------------------------------------------------
// Party extraction
// ---------------------------------------------------------------------------

type PartyRecord = {
  type: "from" | "to" | "cc" | "bcc";
  name: string | undefined;
  address: string;
};

function extractParties(
  parsed: Awaited<ReturnType<typeof PostalMime.parse>>,
  message: ForwardableEmailMessage,
): PartyRecord[] {
  const result: PartyRecord[] = [];

  // FROM
  if (parsed.from) {
    const fromAddresses = flattenAddress(parsed.from);
    for (const addr of fromAddresses) {
      result.push({ type: "from", name: addr.name, address: addr.address });
    }
  } else if (message.from) {
    result.push({ type: "from", name: undefined, address: message.from });
  }

  // TO
  if (parsed.to) {
    for (const recipient of Array.isArray(parsed.to) ? parsed.to : [parsed.to]) {
      for (const addr of flattenAddress(recipient)) {
        result.push({ type: "to", name: addr.name, address: addr.address });
      }
    }
  }

  // CC
  if (parsed.cc) {
    for (const recipient of Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc]) {
      for (const addr of flattenAddress(recipient)) {
        result.push({ type: "cc", name: addr.name, address: addr.address });
      }
    }
  }

  // BCC
  if (parsed.bcc) {
    for (const recipient of Array.isArray(parsed.bcc) ? parsed.bcc : [parsed.bcc]) {
      for (const addr of flattenAddress(recipient)) {
        result.push({ type: "bcc", name: addr.name, address: addr.address });
      }
    }
  }

  return result;
}

function flattenAddress(address: Address): Array<{ name?: string; address: string }> {
  if (Array.isArray(address.group)) {
    return address.group
      .filter((item) => !!item.address)
      .map((item) => ({ name: item.name, address: item.address }));
  }
  if (address.address) {
    return [{ name: address.name, address: address.address }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Thread decomposition
// ---------------------------------------------------------------------------

/**
 * Detect forwarded email threads and decompose them into individual D1
 * records. Each sub-message gets its own `emails` row with `parent_email_id`
 * pointing to the main email.
 *
 * Heuristics:
 * - Subject starts with "Fwd:" or "FW:"
 * - Body contains "---------- Forwarded message ---------"
 * - Body contains "From: ... Sent: ..." patterns
 */
async function decomposeThreadIfForwarded(
  env: Env,
  parentEmailId: string,
  _subject: string,
  body: string,
): Promise<void> {
  // Common forwarded message delimiters
  const FORWARD_DELIMITERS = [
    /---------- Forwarded message ---------/gi,
    /-----Original Message-----/gi,
    /From:.*?(?:Sent|Date):.*?(?:To|Subject):/gis,
  ];

  let hasForwardedContent = false;
  for (const regex of FORWARD_DELIMITERS) {
    if (regex.test(body)) {
      hasForwardedContent = true;
      break;
    }
  }

  if (!hasForwardedContent) return;

  // Split on the most common delimiter pattern
  const segments = body.split(
    /(?=---------- Forwarded message ---------)|(?=-----Original Message-----)|(?=On (?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),? .*? wrote:)/gi,
  );

  // Skip the first segment (it's the wrapper message already stored as the parent)
  if (segments.length <= 1) return;

  const db = getDb(env);
  const allowedEmails = getAllowedEmails(env);

  for (let i = 1; i < segments.length; i++) {
    const segment = segments[i].trim();
    if (segment.length < 20) continue; // skip tiny fragments

    // Try to extract metadata from the forwarded header
    const fromMatch = segment.match(/From:\s*(.+?)(?:\n|<br)/i);
    const subjectMatch = segment.match(/Subject:\s*(.+?)(?:\n|<br)/i);

    const subSender = fromMatch?.[1]?.trim() || "unknown";
    const subSubject = subjectMatch?.[1]?.trim() || "(forwarded message)";
    const subDomain = extractDomain(subSender);

    // Strip the header block from the body
    const bodyStart = segment.search(/\n\n|\r\n\r\n/);
    const subBody = bodyStart > 0 ? segment.slice(bodyStart).trim() : segment;

    const subEmailId = crypto.randomUUID();

    await db.insert(emails).values({
      id: subEmailId,
      parentEmailId,
      subject: subSubject,
      body: subBody,
      sender: subSender,
      senderDomain: subDomain,
      rawContent: segment,
      processedStatus: "pending",
    });

    // Extract parties from the forwarded header
    const subParties: PartyRecord[] = [];
    if (fromMatch?.[1]) {
      const addr = extractEmailAddress(fromMatch[1]);
      if (addr) subParties.push({ type: "from", name: undefined, address: addr });
    }

    const toMatch = segment.match(/To:\s*(.+?)(?:\n|<br)/i);
    if (toMatch?.[1]) {
      const addr = extractEmailAddress(toMatch[1]);
      if (addr) subParties.push({ type: "to", name: undefined, address: addr });
    }

    for (const party of subParties) {
      await db.insert(emailParties).values({
        id: crypto.randomUUID(),
        emailId: subEmailId,
        type: party.type,
        name: party.name || null,
        address: party.address,
        domain: extractDomain(party.address),
        isSelf: allowedEmails.has(party.address.toLowerCase()),
      });
    }
  }
}

function extractEmailAddress(text: string): string | undefined {
  const match = text.match(/<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/);
  return match?.[1]?.toLowerCase();
}

// ---------------------------------------------------------------------------
// Thread management
// ---------------------------------------------------------------------------

async function ensureRoleThread(env: Env, role: Role) {
  const db = getDb(env);
  const existing = await db
    .select()
    .from(threads)
    .where(eq(threads.roleId, role.id))
    .orderBy(desc(threads.createdAt))
    .limit(1);

  if (existing.length > 0) return existing;

  return db
    .insert(threads)
    .values({
      id: crypto.randomUUID(),
      title: `${role.companyName} / ${role.jobTitle}`,
      roleId: role.id,
    })
    .returning();
}

// ---------------------------------------------------------------------------
// Unmatched reply
// ---------------------------------------------------------------------------

async function sendUnmatchedReply(
  env: Env,
  message: ForwardableEmailMessage,
  emailId: string,
  activeRoles: Role[],
) {
  const roleList =
    activeRoles.length > 0
      ? activeRoles
          .map((role) => `- ${role.companyName} / ${role.jobTitle} (${role.status})`)
          .join("\n")
      : "- No applied or interviewing roles are currently tracked.";
  const link = associationLink(message.to, emailId);
  const text = [
    "I could not confidently match this email to an active application.",
    "",
    "Open this link to associate it with a role:",
    link,
    "",
    "Active roles:",
    roleList,
  ].join("\n");

  await env.EMAIL_OUT.send({
    from: message.to,
    to: message.from,
    subject: "Action needed: associate this recruiting email",
    text,
  });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function extractDomain(addr: string): string {
  const m = addr.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  return (m?.[1] || "").toLowerCase();
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatAddress(address: Address | undefined, fallback: string) {
  if (!address) return fallback;
  if (Array.isArray(address.group)) {
    return address.group.map((item) => formatMailbox(item.name, item.address)).join(", ");
  }
  return formatMailbox(address.name, address.address);
}

function formatMailbox(name: string | undefined, address: string | undefined) {
  if (!address) return name || "unknown";
  return name ? `${name} <${address}>` : address;
}

function associationLink(to: string, emailId: string) {
  const [, domain] = to.split("@");
  if (!domain) return `/email-associate/${emailId}`;
  return `https://${domain}/email-associate/${emailId}`;
}
