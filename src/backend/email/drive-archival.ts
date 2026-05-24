/**
 * @fileoverview Google Drive email archival utilities.
 *
 * Creates a folder hierarchy for email artifacts within a role's Drive folder:
 * {role.drive_folder_id}/
 * emails/
 * {sanitized_subject}/
 * {subject}_{date}.pdf          ← Browser Rendering PDF of the email
 * {subject}_{date}_{att.name}   ← each attachment
 *
 * All operations are independent — a Drive failure never blocks email processing.
 */

import { eq } from "drizzle-orm";

import { GoogleDriveClient } from "@/backend/ai/tools/google/drive";
import { getDb } from "@/backend/db";
import { emailAttachments, emails } from "@/backend/db/schema";
import { getCloudflareAccountId, getCloudflareApiToken } from "@/backend/utils/secrets";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArchiveResult {
  driveFolderId: string | null;
  drivePdfFileId: string | null;
  attachmentDriveIds: Array<{ attachmentId: string; driveFileId: string }>;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Archive an email's body and attachments to the role's Google Drive folder.
 *
 * @param env - Worker environment
 * @param emailId - The email to archive
 * @param roleDriveFolderId - The role's root Google Drive folder ID
 * @param parsedAttachments - Raw attachment data from postal-mime (Phase 3 enhancement: pass from handler)
 */
export async function archiveEmailToDrive(
  env: Env,
  emailId: string,
  roleDriveFolderId: string,
  parsedAttachments?: Array<{
    filename?: string;
    mimeType?: string;
    content: Uint8Array;
  }>,
): Promise<ArchiveResult> {
  const result: ArchiveResult = {
    driveFolderId: null,
    drivePdfFileId: null,
    attachmentDriveIds: [],
    errors: [],
  };

  const db = getDb(env);
  const [email] = await db.select().from(emails).where(eq(emails.id, emailId)).limit(1);
  if (!email) {
    result.errors.push(`Email not found: ${emailId}`);
    return result;
  }

  const drive = new GoogleDriveClient(env);

  // ── 1. Create emails/ subfolder ────────────────────────────────────────
  let emailsFolderId: string;
  try {
    // Check if emails/ folder already exists
    const existingFolders = await drive.listFilesInFolder(roleDriveFolderId);
    const emailsFolder = existingFolders.find((f) => f.name === "emails");

    if (emailsFolder) {
      emailsFolderId = emailsFolder.id;
    } else {
      const created = await drive.createFolder("emails", roleDriveFolderId);
      emailsFolderId = created.id;
    }
  } catch (err) {
    result.errors.push(`Failed to create emails/ folder: ${err}`);
    return result;
  }

  // ── 2. Create subject-specific subfolder ───────────────────────────────
  const sanitizedSubject = sanitizeFolderName(email.subject);
  let subjectFolderId: string;
  try {
    const created = await drive.createFolder(sanitizedSubject, emailsFolderId);
    subjectFolderId = created.id;
    result.driveFolderId = subjectFolderId;
  } catch (err) {
    result.errors.push(`Failed to create subject folder: ${err}`);
    return result;
  }

  // Update email record with the Drive folder
  await db.update(emails).set({ driveFolderId: subjectFolderId }).where(eq(emails.id, emailId));

  // ── 3. Render email body as PDF via Browser Rendering ──────────────────
  try {
    const pdfBytes = await renderEmailPdf(env, email);
    if (pdfBytes) {
      const dateStr = formatDate(email.receivedAt);
      const pdfName = `${sanitizedSubject}_${dateStr}.pdf`;
      const uploaded = await drive.uploadFile(
        pdfName,
        subjectFolderId,
        pdfBytes,
        "application/pdf",
      );
      result.drivePdfFileId = uploaded.id;

      await db.update(emails).set({ drivePdfFileId: uploaded.id }).where(eq(emails.id, emailId));
    }
  } catch (err) {
    result.errors.push(`PDF rendering/upload failed (non-fatal): ${err}`);
  }

  // ── 4. Upload attachments ──────────────────────────────────────────────
  if (parsedAttachments?.length) {
    const dbAttachments = await db
      .select()
      .from(emailAttachments)
      .where(eq(emailAttachments.emailId, emailId));

    for (let i = 0; i < parsedAttachments.length; i++) {
      const att = parsedAttachments[i];
      const dbAtt = dbAttachments[i]; // Aligned by order

      try {
        const dateStr = formatDate(email.receivedAt);
        const filename = att.filename || `attachment_${i + 1}`;
        const driveName = `${sanitizedSubject}_${dateStr}_${filename}`;
        const mimeType = att.mimeType || "application/octet-stream";

        const uploaded = await drive.uploadFile(driveName, subjectFolderId, att.content, mimeType);

        result.attachmentDriveIds.push({
          attachmentId: dbAtt?.id ?? `unknown_${i}`,
          driveFileId: uploaded.id,
        });

        // Update the DB record
        if (dbAtt) {
          await db
            .update(emailAttachments)
            .set({ driveFileId: uploaded.id, driveFolderId: subjectFolderId })
            .where(eq(emailAttachments.id, dbAtt.id));
        }
      } catch (err) {
        result.errors.push(`Attachment upload failed for "${att.filename}": ${err}`);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Browser Rendering → PDF
// ---------------------------------------------------------------------------

/**
 * Use Cloudflare Browser Rendering API to convert email HTML to an Outlook-styled PDF.
 */
async function renderEmailPdf(env: Env, email: any): Promise<Uint8Array | null> {
  const { subject, body, receivedAt, from, to } = email;

  // Wrap the email body in an Outlook-styled HTML document
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    /* Microsoft Outlook Print Style */
    body { 
      font-family: "Calibri", "Segoe UI", "Arial", sans-serif; 
      margin: 0; 
      padding: 0; 
      color: #000; 
      font-size: 11pt; 
      line-height: 1.4; 
    }
    .outlook-header { 
      border-bottom: 1px solid #000; 
      padding-bottom: 15px; 
      margin-bottom: 20px; 
    }
    .header-row { 
      display: flex; 
      margin-bottom: 4px; 
    }
    .header-label { 
      font-weight: bold; 
      width: 80px; 
      flex-shrink: 0; 
    }
    .header-value { 
      flex-grow: 1; 
    }
    .email-body { 
      margin-top: 15px; 
    }
    pre { 
      white-space: pre-wrap; 
      word-wrap: break-word; 
      font-family: inherit; 
    }
    blockquote { 
      border-left: 2px solid #0000FF; 
      margin-left: 0; 
      padding-left: 10px; 
      color: #333; 
    }
    /* Ensure images break correctly across pages */
    .email-body img { 
      max-width: 100%; 
      height: auto; 
    }
    /* Fix table layouts */
    table {
      border-collapse: collapse;
      max-width: 100%;
    }
  </style>
</head>
<body>
  <div class="outlook-header">
    ${from ? `<div class="header-row"><div class="header-label">From:</div><div class="header-value">${escapeHtml(String(from))}</div></div>` : ""}
    ${receivedAt ? `<div class="header-row"><div class="header-label">Sent:</div><div class="header-value">${formatDateOutlook(receivedAt)}</div></div>` : ""}
    ${to ? `<div class="header-row"><div class="header-label">To:</div><div class="header-value">${escapeHtml(String(to))}</div></div>` : ""}
    <div class="header-row"><div class="header-label">Subject:</div><div class="header-value">${escapeHtml(subject || "")}</div></div>
  </div>
  <div class="email-body">
    ${body?.includes("<") ? body : `<pre>${escapeHtml(body || "")}</pre>`}
  </div>
</body>
</html>`;

  try {
    const accountId = await getCloudflareAccountId(env);
    const apiToken = await getCloudflareApiToken(env);

    if (!accountId || !apiToken) {
      console.warn(
        "[email-drive] Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_WRANGLER_API_TOKEN — skipping PDF render",
      );
      return null;
    }

    // Call Cloudflare Browser Rendering Public REST API
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/pdf`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          html,
          pdfOptions: {
            format: "Letter",
            printBackground: true,
            displayHeaderFooter: true,
            // Include dynamic placeholders such as current date or title
            headerTemplate: `<div style="width: 100%; font-size: 10px; padding: 10px 30px; text-align: left; font-family: 'Calibri', sans-serif;"><span class="title"></span></div>`,
            footerTemplate: `<div style="width: 100%; font-size: 10px; padding: 10px 30px; text-align: center; font-family: 'Calibri', sans-serif; color: #666; border-top: 1px solid #ddd;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
            margin: {
              top: "1in",
              bottom: "1in",
              left: "1in",
              right: "1in",
            },
            timeout: 45000,
          },
          gotoOptions: {
            waitUntil: "networkidle2",
          },
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[email-drive] PDF render failed: ${response.status} - ${errorText}`);
      return null;
    }

    return new Uint8Array(await response.arrayBuffer());
  } catch (err) {
    console.error("[email-drive] PDF render error:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sanitizeFolderName(name: string): string {
  if (!name) return "No Subject";
  return name
    .replace(/^(Re:|Fwd?:|FW:)\s*/gi, "")
    .replace(/[/\\:*?"<>|]/g, "_")
    .trim()
    .slice(0, 100);
}

function formatDate(date: Date): string {
  if (!date || isNaN(new Date(date).getTime())) return "unknown_date";
  return new Date(date).toISOString().split("T")[0];
}

function formatDateOutlook(dateVal: Date | string): string {
  if (!dateVal) return "";
  const dateObj = new Date(dateVal);
  if (isNaN(dateObj.getTime())) return String(dateVal);

  return dateObj.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function escapeHtml(text: string): string {
  if (!text) return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
