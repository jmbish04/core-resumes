import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { roles } from "./roles";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `role_podcasts` table for the documentation UI. */
export const ROLE_PODCASTS_TABLE_DESCRIPTION =
  "Tracks NotebookLM-generated podcast assets for a role, including source indexing, artifact polling, audio storage, transcription, and Google Drive links.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const ROLE_PODCASTS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key for a single role podcast workflow attempt.",
  role_id: "Foreign key to the role this NotebookLM podcast was generated for.",
  notebooklm_source_id: "NotebookLM source ID for the uploaded role markdown file.",
  notebooklm_source_filename:
    "Filename used when uploading the role markdown source to NotebookLM.",
  notebooklm_chat_conversation_id:
    "NotebookLM chat conversation ID for the podcast creation prompt.",
  notebooklm_chat_response:
    "NotebookLM chat acknowledgement returned after asking it to start podcast generation.",
  notebooklm_artifact_id_baseline:
    "JSON array of audio artifact IDs that existed before the podcast prompt was sent.",
  notebooklm_artifact_id: "NotebookLM audio artifact ID resolved after polling for a new artifact.",
  r2_audio_key: "R2_AUDIO_BUCKET key for the downloaded podcast audio file.",
  drive_audio_file_id: "Google Drive file ID for the uploaded podcast audio file.",
  drive_asset_file_ids: "JSON map of raw role asset type to uploaded Google Drive file ID.",
  drive_transcript_doc_id: "Google Docs document ID for the podcast transcript.",
  transcription_job_id: "Transcription job ID used to process the downloaded podcast audio.",
  transcript_text: "Full text transcription of the podcast audio.",
  status:
    "Podcast lifecycle status: queued, uploading_assets, indexing_source, awaiting_artifact, downloading, transcribing, complete, failed.",
  step_errors: "JSON array of workflow step errors for observability and retry decisions.",
  check_count: "Number of NotebookLM artifact polling checks performed.",
  last_checked_at: "Unix timestamp (seconds) of the most recent NotebookLM artifact poll.",
  workflow_instance_id: "Cloudflare Workflows instance ID created for this podcast pipeline.",
  created_at: "Unix timestamp (seconds) of when the podcast workflow row was created.",
  updated_at: "Unix timestamp (seconds) of the last modification.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const rolePodcasts = sqliteTable(
  "role_podcasts",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    notebooklmSourceId: text("notebooklm_source_id"),
    notebooklmSourceFilename: text("notebooklm_source_filename").notNull(),
    notebooklmChatConversationId: text("notebooklm_chat_conversation_id"),
    notebooklmChatResponse: text("notebooklm_chat_response"),
    notebooklmArtifactIdBaseline: text("notebooklm_artifact_id_baseline", { mode: "json" })
      .$type<string[]>()
      .default([]),
    notebooklmArtifactId: text("notebooklm_artifact_id"),
    r2AudioKey: text("r2_audio_key"),
    driveAudioFileId: text("drive_audio_file_id"),
    driveAssetFileIds: text("drive_asset_file_ids", { mode: "json" })
      .$type<Record<string, string>>()
      .default({}),
    driveTranscriptDocId: text("drive_transcript_doc_id"),
    transcriptionJobId: text("transcription_job_id"),
    transcriptText: text("transcript_text"),
    status: text("status", {
      enum: [
        "queued",
        "uploading_assets",
        "indexing_source",
        "awaiting_artifact",
        "downloading",
        "transcribing",
        "complete",
        "failed",
      ],
    })
      .notNull()
      .default("queued"),
    stepErrors: text("step_errors", { mode: "json" })
      .$type<Array<{ step: string; message: string; at: string }>>()
      .default([]),
    checkCount: integer("check_count").notNull().default(0),
    lastCheckedAt: integer("last_checked_at", { mode: "timestamp" }),
    workflowInstanceId: text("workflow_instance_id"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    roleIdx: index("role_podcasts_role_id_idx").on(table.roleId),
    statusIdx: index("role_podcasts_status_idx").on(table.status),
    artifactIdx: index("role_podcasts_notebooklm_artifact_id_idx").on(table.notebooklmArtifactId),
  }),
);

export const insertRolePodcastSchema = createInsertSchema(rolePodcasts);
export const selectRolePodcastSchema = createSelectSchema(rolePodcasts);
export type RolePodcast = typeof rolePodcasts.$inferSelect;
export type NewRolePodcast = typeof rolePodcasts.$inferInsert;
