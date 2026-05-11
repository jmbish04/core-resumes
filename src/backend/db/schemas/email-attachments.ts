import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { emails } from "./emails";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `email_attachments` table for the documentation UI. */
export const EMAIL_ATTACHMENTS_TABLE_DESCRIPTION =
  "Tracks attachments from inbound emails. Files are uploaded to the role's Google Drive folder and optionally text-extracted for AI analysis.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const EMAIL_ATTACHMENTS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated at creation.",
  email_id: "Foreign key to the parent email record. Cascade-deleted when the email is removed.",
  name: "Original filename of the attachment (e.g., 'offer_letter.pdf').",
  mime_type: "MIME type of the attachment (e.g., 'application/pdf').",
  size_bytes: "File size in bytes. Null if unknown.",
  extracted_text:
    "AI-extracted text content from PDFs/docs. Used for downstream analysis like offer parsing.",
  metadata_json: "Flexible JSON blob for additional attachment metadata.",
  drive_folder_id:
    "Google Drive folder ID where this attachment is stored (role's emails subfolder).",
  drive_file_id: "Google Drive file ID after upload. Null if upload failed or pending.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const emailAttachments = sqliteTable(
  "email_attachments",
  {
    id: text("id").primaryKey(),
    emailId: text("email_id")
      .notNull()
      .references(() => emails.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes"),
    extractedText: text("extracted_text"),
    metadataJson: text("metadata_json", { mode: "json" }).$type<Record<string, unknown>>(),
    driveFolderId: text("drive_folder_id"),
    driveFileId: text("drive_file_id"),
  },
  (table) => ({
    emailIdIdx: index("email_attachments_email_id_idx").on(table.emailId),
  }),
);

export const insertEmailAttachmentSchema = createInsertSchema(emailAttachments);
export const selectEmailAttachmentSchema = createSelectSchema(emailAttachments);
export type EmailAttachment = typeof emailAttachments.$inferSelect;
export type NewEmailAttachment = typeof emailAttachments.$inferInsert;
