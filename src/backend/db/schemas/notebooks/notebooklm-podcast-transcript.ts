import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { roles } from "../applications/roles";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `notebooklm_podcast_transcript` table for the documentation UI. */
export const NOTEBOOKLM_PODCAST_TRANSCRIPT_TABLE_DESCRIPTION =
  "Line-by-line speaker-attributed transcript of NotebookLM-generated podcast audio, with microsecond timestamps for ordering and potential playback highlighting.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const NOTEBOOKLM_PODCAST_TRANSCRIPT_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key for each transcript line.",
  role_id: "Foreign key to the role this podcast transcript belongs to.",
  notebooklm_msg_id:
    "D1 identifier linking to the message/prompt that initiated the podcast creation in NotebookLM.",
  podcast_id: "Foreign key to the role_podcasts entry this transcript was generated from.",
  line_order: "Sequential line number (0-indexed) for deterministic ordering of transcript lines.",
  speaker_name: "Name of the speaker for this transcript segment (e.g., 'Host', 'Guest').",
  speaker_usec_start:
    "Microsecond timestamp marking when the speaker started this segment. Used for ordering and playback sync.",
  speaker_usec_stop: "Microsecond timestamp marking when the speaker stopped this segment.",
  speaker_message: "The verbatim text of what the speaker said during this segment.",
  created_at: "Unix timestamp (seconds) of when this transcript line was inserted.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const notebooklmPodcastTranscript = sqliteTable(
  "notebooklm_podcast_transcript",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    notebooklmMsgId: text("notebooklm_msg_id"),
    podcastId: text("podcast_id"),
    lineOrder: integer("line_order").notNull(),
    speakerName: text("speaker_name").notNull(),
    speakerUsecStart: integer("speaker_usec_start"),
    speakerUsecStop: integer("speaker_usec_stop"),
    speakerMessage: text("speaker_message").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    roleIdx: index("nlm_podcast_transcript_role_id_idx").on(table.roleId),
    podcastIdx: index("nlm_podcast_transcript_podcast_id_idx").on(table.podcastId),
    orderIdx: index("nlm_podcast_transcript_order_idx").on(table.podcastId, table.lineOrder),
  }),
);

export const insertNotebooklmPodcastTranscriptSchema = createInsertSchema(
  notebooklmPodcastTranscript,
);
export const selectNotebooklmPodcastTranscriptSchema = createSelectSchema(
  notebooklmPodcastTranscript,
);
export type NotebooklmPodcastTranscript = typeof notebooklmPodcastTranscript.$inferSelect;
export type NewNotebooklmPodcastTranscript = typeof notebooklmPodcastTranscript.$inferInsert;
