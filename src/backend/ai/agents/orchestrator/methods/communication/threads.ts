import { eq } from "drizzle-orm";

import type { EmailClassification } from "@/ai/tasks/types";

import { classifyEmailStatus, draftEmailReply } from "@/ai/tasks";
import { getDb } from "@/db";
import { emails, roles } from "@/db/schema";

import type { OrchestratorAgent } from "../../index";

export async function handleReplyToThread(agent: OrchestratorAgent, roleId: string, text: string) {
  const thread = await agent.ensureThread(roleId);
  return agent.addMessage(thread.id, roleId, "agent", text);
}

/**
 * Full email processing workflow triggered by the orchestrator.
 *
 * Steps:
 *  1. Look up the email record
 *  2. If no classification exists, run AI classification
 *  3. Generate a draft reply based on the classification intent
 *  4. Persist draft and classification back to the email record
 *  5. Log a message in the role's thread
 */
export async function handleDraftEmailReply(agent: OrchestratorAgent, env: Env, emailId: string) {
  const db = getDb(env);
  const [email] = await db.select().from(emails).where(eq(emails.id, emailId)).limit(1);

  if (!email) {
    throw new Error(`Email not found: ${emailId}`);
  }

  // ── 1. Classification ─────────────────────────────────────────────────
  let classification: EmailClassification;

  if (email.classificationJson) {
    // Use existing classification
    classification = email.classificationJson as unknown as EmailClassification;
  } else {
    // Run full AI classification
    classification = await classifyEmailStatus(
      env,
      email.subject,
      email.body,
      email.roleId
        ? ((await db.select().from(roles).where(eq(roles.id, email.roleId)).limit(1))[0]?.status ??
            "applied")
        : "applied",
    );

    // Persist classification
    await db
      .update(emails)
      .set({ classificationJson: classification as Record<string, unknown> })
      .where(eq(emails.id, emailId));
  }

  // ── 2. Draft reply ────────────────────────────────────────────────────
  let roleContext: { companyName: string; jobTitle: string } | undefined;

  if (email.roleId) {
    const [role] = await db.select().from(roles).where(eq(roles.id, email.roleId)).limit(1);
    if (role) {
      roleContext = { companyName: role.companyName, jobTitle: role.jobTitle };
    }
  }

  const draftResult = await draftEmailReply(
    env,
    email.subject,
    email.body,
    classification,
    roleContext,
  );

  // Persist draft reply
  if (draftResult.primaryDraft) {
    const fullDraft =
      draftResult.alternatives.length > 0
        ? [draftResult.primaryDraft, "---", ...draftResult.alternatives].join("\n\n")
        : draftResult.primaryDraft;

    await db.update(emails).set({ draftReply: fullDraft }).where(eq(emails.id, emailId));
  }

  // ── 3. Log in the role thread ─────────────────────────────────────────
  if (email.roleId) {
    const thread = await agent.ensureThread(email.roleId);

    const intentLabel = classification.intent.replace(/_/g, " ");
    const actionLabel = classification.nextAction.replace(/_/g, " ");
    const parts = [
      `📧 **Email processed** — Intent: *${intentLabel}* (${(classification.confidence * 100).toFixed(0)}%)`,
      classification.senderPersonName
        ? `From: ${classification.senderPersonName}`
        : `From: ${email.sender}`,
      `Action: ${actionLabel}`,
    ];

    if (draftResult.primaryDraft) {
      parts.push("", "📝 Draft reply generated and saved on the email record.");
    }

    if (classification.availabilityOptions?.length) {
      parts.push("", `🗓️ Interview time options: ${classification.availabilityOptions.join(", ")}`);
    }

    await agent.addMessage(thread.id, email.roleId, "agent", parts.join("\n"), {
      emailId,
      intent: classification.intent,
      nextAction: classification.nextAction,
      source: "email_draft_workflow",
    });
  }

  return {
    classification,
    draft: draftResult,
    emailId,
  };
}
