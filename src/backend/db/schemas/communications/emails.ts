import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { roles } from "./roles";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `emails` table for the documentation UI. */
export const EMAILS_TABLE_DESCRIPTION =
  "Inbound recruiting emails captured by the Worker email handler. Each email is matched to a role or left for manual association.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const EMAILS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated at creation.",
  role_id:
    "Optional foreign key to the associated role. Set null on role deletion to preserve email history.",
  message_id:
    "MIME Message-ID header for deduplication and thread linking (e.g., '<abc123@mail.gmail.com>').",
  subject: "Email subject line.",
  body: "Parsed email body text (HTML stripped).",
  sender: "Sender email address.",
  sender_domain:
    "Domain extracted from sender address (e.g., 'greenhouse.io'). Used for domain-based role matching.",
  raw_content: "Full raw email content (headers + body) for re-processing or debugging.",
  in_reply_to:
    "MIME In-Reply-To header for thread linking. References the Message-ID of the email this is a reply to.",
  parent_email_id:
    "Self-referencing FK for decomposed thread messages. Points to the parent email when a forwarded thread is split into individual records.",
  drive_folder_id:
    "Google Drive folder ID for this email's artifacts (PDF render + attachments). Path: {role.drive_folder_id}/emails/{subject}/",
  drive_pdf_file_id:
    "Google Drive file ID for the Browser Rendering PDF capture of the email body.",
  classification_json:
    "Full AI classification output including intent, confidence, company/person extraction, and suggested next action.",
  draft_reply: "AI-generated draft reply text, shown alongside the email in the UI.",
  ai_role_match_confidence: "AI confidence score (integer) representing how strongly this email maps to the associated role.",
  ai_role_match_rationale: "AI reasoning for why it associated (or failed to associate) the email with a role.",
  processed_status:
    "Email lifecycle status. One of: pending, associated, unmatched, responded, ignored, action_taken.",
  received_at: "Unix timestamp (seconds) of when the email was received by the Worker.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const emails = sqliteTable(
  "emails",
  {
    id: text("id").primaryKey(),
    roleId: text("role_id").references(() => roles.id, { onDelete: "set null" }),
    messageId: text("message_id"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    sender: text("sender").notNull(),
    senderDomain: text("sender_domain"),
    rawContent: text("raw_content").notNull(),
    inReplyTo: text("in_reply_to"),
    parentEmailId: text("parent_email_id"),
    driveFolderId: text("drive_folder_id"),
    drivePdfFileId: text("drive_pdf_file_id"),
    classificationJson: text("classification_json", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    draftReply: text("draft_reply"),
    aiRoleMatchConfidence: integer("ai_role_match_confidence"),
    aiRoleMatchRationale: text("ai_role_match_rationale"),
    processedStatus: text("processed_status", {
      enum: ["pending", "associated", "unmatched", "responded", "ignored", "action_taken"],
    })
      .notNull()
      .default("pending"),
    receivedAt: integer("received_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    processedStatusIdx: index("emails_processed_status_idx").on(table.processedStatus),
    roleIdIdx: index("emails_role_id_idx").on(table.roleId),
    senderDomainIdx: index("emails_sender_domain_idx").on(table.senderDomain),
    messageIdIdx: index("emails_message_id_idx").on(table.messageId),
  }),
);

export const insertEmailSchema = createInsertSchema(emails);
export const selectEmailSchema = createSelectSchema(emails);
export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;
