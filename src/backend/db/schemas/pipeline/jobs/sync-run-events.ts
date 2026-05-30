/**
 * @file Schema for sync_run_events — granular progress events from GitHub Action syncs.
 *
 * Every `POST /api/pipeline/api-companies/sync-progress` call persists a row here,
 * enabling full historical reconstruction of sync run timelines, steppers, and charts.
 *
 * Typical volume: 15-30 rows per sync run.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { apiCompanySyncStats } from "./api-company-sync-stats";

// ---------------------------------------------------------------------------
// Table & column documentation
// ---------------------------------------------------------------------------

export const SYNC_RUN_EVENTS_TABLE_DESCRIPTION =
  "Granular progress events from GitHub Action sync runs, enabling historical timeline reconstruction and real-time charting.";

export const SYNC_RUN_EVENTS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  sync_stats_id: "FK → api_company_sync_stats.id. Nullable for in-progress runs before the stats row is created.",
  event_type: "Event classification: step_start, step_complete, progress, metric, error, completed, failed.",
  step_number: "Which workflow step this event belongs to (1–5). Null for run-level events.",
  status: "Mirrors the sync_progress status field from the GitHub Action (e.g. initializing, processing, saving_db, completed, failed).",
  message: "Human-readable log line describing what happened.",
  current: "Progress numerator (e.g. 42 of 300 files processed).",
  total: "Progress denominator (e.g. 300 total files).",
  metadata: "Arbitrary JSON payload for rich event data (e.g. { matchesFound: 42, chunksProcessed: 30 }).",
  created_at: "When this event was received by the worker.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const syncRunEvents = sqliteTable("sync_run_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  syncStatsId: integer("sync_stats_id").references(() => apiCompanySyncStats.id),
  eventType: text("event_type").notNull(),
  stepNumber: integer("step_number"),
  status: text("status").notNull(),
  message: text("message"),
  current: integer("current"),
  total: integer("total"),
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertSyncRunEventSchema = createInsertSchema(syncRunEvents);
export const selectSyncRunEventSchema = createSelectSchema(syncRunEvents);
export type SyncRunEvent = typeof syncRunEvents.$inferSelect;
export type NewSyncRunEvent = typeof syncRunEvents.$inferInsert;
