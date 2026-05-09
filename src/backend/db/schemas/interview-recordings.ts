import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { interviewNotes } from "./interview-notes";
import { roles } from "./roles";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `interview_recordings` table for the documentation UI. */
export const INTERVIEW_RECORDINGS_TABLE_DESCRIPTION =
  "Audio recordings uploaded from iPhone (m4a) per role. Stored in R2 and transcribed via Workers AI Whisper. Optionally linked to an interview note.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const INTERVIEW_RECORDINGS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated at creation.",
  role_id: "Foreign key to the parent role. Cascades on delete.",
  r2_key: "R2 object key for the stored audio file.",
  original_filename: "Original filename from the upload (e.g., 'Interview_Recording.m4a').",
  duration_seconds: "Audio duration in seconds (nullable, extracted if available).",
  transcription: "Raw Whisper transcription text. Null until processing completes.",
  transcription_status: "Processing lifecycle: pending → processing → complete / failed.",
  note_id: "Optional foreign key to an interview note when transcription is merged into notes.",
  created_at: "Unix timestamp (seconds) of when the recording was uploaded.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const interviewRecordings = sqliteTable(
  "interview_recordings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    durationSeconds: integer("duration_seconds"),
    transcription: text("transcription"),
    transcriptionStatus: text("transcription_status", {
      enum: ["pending", "processing", "complete", "failed"],
    })
      .notNull()
      .default("pending"),
    noteId: text("note_id").references(() => interviewNotes.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    roleIdx: index("interview_recordings_role_id_idx").on(table.roleId),
    statusIdx: index("interview_recordings_status_idx").on(table.transcriptionStatus),
  }),
);

export const insertInterviewRecordingSchema = createInsertSchema(interviewRecordings);
export const selectInterviewRecordingSchema = createSelectSchema(interviewRecordings);
export type InterviewRecording = typeof interviewRecordings.$inferSelect;
export type NewInterviewRecording = typeof interviewRecordings.$inferInsert;
