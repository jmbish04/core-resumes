import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { interviewRecordings } from "./interview-recordings";
import { rolePodcasts } from "./role-podcasts";
import { roles } from "./roles";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `transcription_jobs` table for the documentation UI. */
export const TRANSCRIPTION_JOBS_TABLE_DESCRIPTION =
  "Tracks the full lifecycle of audio transcription jobs. Mirrors the TranscriptionAgent Durable Object state and persists beyond Agent resets for historical observability.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const TRANSCRIPTION_JOBS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated at creation.",
  recording_id:
    "Foreign key to the parent interview recording. Null when the job transcribes a NotebookLM role podcast.",
  podcast_id:
    "Foreign key to the parent role_podcasts row. Null when the job transcribes an interview recording.",
  role_id: "Foreign key to the parent role. Cascades on delete.",
  status: "Job lifecycle: pending → chunking → transcribing → complete / error.",
  phase: "Human-readable phase label for UI display (e.g., 'Transcribing chunk 3/12').",
  progress: "Completion percentage 0–100.",
  total_chunks: "Total number of audio chunks created by FFmpeg.",
  completed_chunks: "Number of chunks whose Whisper transcription is complete.",
  full_text: "Accumulated transcription text from all completed chunks.",
  error: "Error message if the job failed.",
  r2_key: "R2 object key for the original uploaded audio file.",
  created_at: "Unix timestamp (seconds) of when the job was created.",
  updated_at: "Unix timestamp (seconds) of the last status update.",
  completed_at: "Unix timestamp (seconds) of when the job completed (null if in progress).",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const transcriptionJobs = sqliteTable(
  "transcription_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    recordingId: text("recording_id").references(() => interviewRecordings.id, {
      onDelete: "cascade",
    }),
    podcastId: text("podcast_id").references(() => rolePodcasts.id, { onDelete: "cascade" }),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["pending", "chunking", "transcribing", "complete", "error"],
    })
      .notNull()
      .default("pending"),
    phase: text("phase"),
    progress: integer("progress").notNull().default(0),
    totalChunks: integer("total_chunks"),
    completedChunks: integer("completed_chunks").notNull().default(0),
    fullText: text("full_text"),
    error: text("error"),
    r2Key: text("r2_key").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
  (table) => ({
    recordingIdx: index("transcription_jobs_recording_id_idx").on(table.recordingId),
    podcastIdx: index("transcription_jobs_podcast_id_idx").on(table.podcastId),
    roleIdx: index("transcription_jobs_role_id_idx").on(table.roleId),
    statusIdx: index("transcription_jobs_status_idx").on(table.status),
  }),
);

export const insertTranscriptionJobSchema = createInsertSchema(transcriptionJobs);
export const selectTranscriptionJobSchema = createSelectSchema(transcriptionJobs);
export type TranscriptionJob = typeof transcriptionJobs.$inferSelect;
export type NewTranscriptionJob = typeof transcriptionJobs.$inferInsert;
