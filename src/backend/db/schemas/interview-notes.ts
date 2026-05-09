import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { roles } from "./roles";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `interview_notes` table for the documentation UI. */
export const INTERVIEW_NOTES_TABLE_DESCRIPTION =
  "Rich-text interview notes created per role using PlateJS. Each row stores the full Slate JSON editor state.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const INTERVIEW_NOTES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated at creation.",
  role_id: "Foreign key to the parent role. Cascades on delete.",
  title: "User-defined note title (e.g., 'Phone Screen #1').",
  content: "PlateJS serialized editor value stored as Slate JSON array.",
  created_at: "Unix timestamp (seconds) of when the note was created.",
  updated_at: "Unix timestamp (seconds) of the last save.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const interviewNotes = sqliteTable(
  "interview_notes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New Note"),
    content: text("content", { mode: "json" }).notNull().$type<Record<string, unknown>[]>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    roleIdx: index("interview_notes_role_id_idx").on(table.roleId),
  }),
);

export const insertInterviewNoteSchema = createInsertSchema(interviewNotes);
export const selectInterviewNoteSchema = createSelectSchema(interviewNotes);
export type InterviewNote = typeof interviewNotes.$inferSelect;
export type NewInterviewNote = typeof interviewNotes.$inferInsert;
