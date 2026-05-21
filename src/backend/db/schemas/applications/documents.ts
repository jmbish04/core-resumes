import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { roles } from "./roles";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `documents` table for the documentation UI. */
export const DOCUMENTS_TABLE_DESCRIPTION =
  "Google Docs (resumes, cover letters, notes) created per role. Each row stores the Google Doc ID for template-based generation.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const DOCUMENTS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated at creation.",
  gdoc_id:
    "Google Doc ID used to construct preview/edit URLs (docs.google.com/document/d/{gdoc_id}).",
  role_id: "Foreign key to the parent role. Cascades on delete.",
  type: "Document category. One of: resume, cover_letter, notes, email_reply, other.",
  version: "Monotonically increasing version number, starting at 1.",
  name: "Human-readable document name (e.g., 'Resume v2 — Acme Corp').",
  created_at: "Unix timestamp (seconds) of when the document record was created.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    gdocId: text("gdoc_id").notNull(),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["resume", "cover_letter", "notes", "email_reply", "other"],
    }).notNull(),
    version: integer("version").notNull().default(1),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    roleIdx: index("documents_role_id_idx").on(table.roleId),
  }),
);

export const insertDocumentSchema = createInsertSchema(documents);
export const selectDocumentSchema = createSelectSchema(documents);
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
