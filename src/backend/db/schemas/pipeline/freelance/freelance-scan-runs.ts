/**
 * @file Schema for freelance scan runs — audit log of scraping executions.
 *
 * Each row represents a single run of the freelance scanner, tracking
 * how many listings were found, created, or updated, along with errors
 * and execution metadata.
 */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `freelance_scan_runs` table for the documentation UI. */
export const FREELANCE_SCAN_RUNS_TABLE_DESCRIPTION =
  "Audit log of freelance scanner executions. Tracks listings discovered, deduplication stats, errors, and trigger source for each scan run.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const FREELANCE_SCAN_RUNS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key.",
  platform: "Target platform — 'upwork', 'freelancer', or 'both'.",
  search_query: "Search query string used for this scan run.",
  search_filters: "JSON object of applied search filters (category, budget range, etc.).",
  status: "Run status — 'running', 'completed', or 'failed'.",
  listings_found: "Total number of listings returned by the platform API.",
  listings_new: "Number of listings that were newly inserted into the database.",
  listings_updated: "Number of existing listings that were updated with new data.",
  error_message: "Error message if the run failed.",
  duration_ms: "Total wall-clock duration of the scan in milliseconds.",
  triggered_by: "What initiated this run — 'cron', 'manual', or 'agent'.",
  created_at: "Unix timestamp of when this run started.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const freelanceScanRuns = sqliteTable(
  "freelance_scan_runs",
  {
    id: text("id").primaryKey(),
    platform: text("platform", {
      enum: ["upwork", "freelancer", "both"],
    }).notNull(),
    searchQuery: text("search_query"),
    searchFilters: text("search_filters", { mode: "json" }).$type<Record<string, unknown>>(),
    status: text("status", {
      enum: ["running", "completed", "failed"],
    }).notNull(),
    listingsFound: integer("listings_found").default(0),
    listingsNew: integer("listings_new").default(0),
    listingsUpdated: integer("listings_updated").default(0),
    errorMessage: text("error_message"),
    durationMs: integer("duration_ms"),
    triggeredBy: text("triggered_by", {
      enum: ["cron", "manual", "agent"],
    }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    platformIdx: index("freelance_scan_runs_platform_idx").on(table.platform),
    statusIdx: index("freelance_scan_runs_status_idx").on(table.status),
    createdAtIdx: index("freelance_scan_runs_created_at_idx").on(table.createdAt),
  }),
);

export const insertFreelanceScanRunSchema = createInsertSchema(freelanceScanRuns);
export const selectFreelanceScanRunSchema = createSelectSchema(freelanceScanRuns);
export type FreelanceScanRun = typeof freelanceScanRuns.$inferSelect;
export type NewFreelanceScanRun = typeof freelanceScanRuns.$inferInsert;
