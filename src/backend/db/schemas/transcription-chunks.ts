import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { transcriptionJobs } from "./transcription-jobs";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `transcription_chunks` table for the documentation UI. */
export const TRANSCRIPTION_CHUNKS_TABLE_DESCRIPTION =
  "Per-chunk metadata for audio transcription jobs. Each row represents one ~30-second WAV segment produced by FFmpeg, with its own R2 key, processing status, and individual transcription result.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const TRANSCRIPTION_CHUNKS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated at creation.",
  job_id: "Foreign key to the parent transcription job. Cascades on delete.",
  chunk_index: "Zero-based index of this chunk in the ordered sequence.",
  r2_key: "R2 object key for the chunk WAV file (e.g., 'chunks/{recordingId}/chunk_003.wav').",
  status: "Chunk lifecycle: pending → processing → complete / failed.",
  transcription: "Whisper transcription text for this individual chunk.",
  duration_seconds: "Approximate duration of this chunk in seconds (~30s).",
  created_at: "Unix timestamp (seconds) of when the chunk record was created.",
  completed_at: "Unix timestamp (seconds) of when transcription completed for this chunk.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const transcriptionChunks = sqliteTable(
  "transcription_chunks",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    jobId: text("job_id")
      .notNull()
      .references(() => transcriptionJobs.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    r2Key: text("r2_key").notNull(),
    status: text("status", {
      enum: ["pending", "processing", "complete", "failed"],
    })
      .notNull()
      .default("pending"),
    transcription: text("transcription"),
    durationSeconds: integer("duration_seconds"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    completedAt: integer("completed_at", { mode: "timestamp" }),
  },
  (table) => ({
    jobChunkIdx: index("transcription_chunks_job_chunk_idx").on(table.jobId, table.chunkIndex),
  }),
);

export const insertTranscriptionChunkSchema = createInsertSchema(transcriptionChunks);
export const selectTranscriptionChunkSchema = createSelectSchema(transcriptionChunks);
export type TranscriptionChunk = typeof transcriptionChunks.$inferSelect;
export type NewTranscriptionChunk = typeof transcriptionChunks.$inferInsert;
