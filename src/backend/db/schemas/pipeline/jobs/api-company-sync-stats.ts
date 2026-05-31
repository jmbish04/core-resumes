/**
 * @file Schema for api_company_sync_stats — tracking the daily github actions sync.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation
// ---------------------------------------------------------------------------

export const API_COMPANY_SYNC_STATS_TABLE_DESCRIPTION =
  "Tracks the execution statistics of the daily job-board-aggregator sync process.";

export const API_COMPANY_SYNC_STATS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  run_timestamp: "When the sync run started.",
  files_processed: "Number of JSON files processed from the aggregator repo.",
  companies_added: "Number of new companies added to api_companies.",
  companies_deactivated:
    "Number of companies marked inactive because they were removed from upstream.",
  companies_reactivated: "Number of companies marked active because they returned to upstream.",
  status: "Status of the sync (e.g. success, failed).",
  error: "Error message if the sync failed.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const apiCompanySyncStats = sqliteTable("api_company_sync_stats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runTimestamp: integer("run_timestamp", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  filesProcessed: integer("files_processed").notNull().default(0),
  companiesAdded: integer("companies_added").notNull().default(0),
  companiesDeactivated: integer("companies_deactivated").notNull().default(0),
  companiesReactivated: integer("companies_reactivated").notNull().default(0),
  status: text("status").notNull(),
  error: text("error"),
});

export const insertApiCompanySyncStatsSchema = createInsertSchema(apiCompanySyncStats);
export const selectApiCompanySyncStatsSchema = createSelectSchema(apiCompanySyncStats);
export type ApiCompanySyncStats = typeof apiCompanySyncStats.$inferSelect;
export type NewApiCompanySyncStats = typeof apiCompanySyncStats.$inferInsert;
