/**
 * @file Schema for session runs — pipeline execution tracking.
 *
 * Each row represents a single invocation of the greenhouse scanner pipeline.
 * Captures counts of jobs scraped, triaged, analyzed, and any failures.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const SESSION_RUNS_TABLE_DESCRIPTION =
  "Pipeline session runs tracking scrape/triage/analysis counts, failures, cost, and taxonomy growth per execution.";

export const SESSION_RUNS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  session_uuid: "Unique UUID identifying this pipeline execution.",
  timestamp: "Unix timestamp (seconds) of when the session started.",
  total_scraped: "Number of job postings scraped in this session.",
  total_triaged: "Number of jobs that passed the AI triage filter.",
  total_analyzed: "Number of jobs fully analyzed (deep analysis complete).",
  total_failed: "Number of jobs that failed processing.",
  total_cost: "Estimated pipeline cost as a string (e.g. '0.045').",
  taxonomy_categories: "Number of new categories discovered in this session.",
  taxonomy_tags: "Number of new tags discovered in this session.",
};

export const sessionRuns = sqliteTable("session_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionUuid: text("session_uuid").notNull().unique(),
  timestamp: integer("timestamp", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  totalScraped: integer("total_scraped").notNull().default(0),
  totalTriaged: integer("total_triaged").notNull().default(0),
  totalAnalyzed: integer("total_analyzed").notNull().default(0),
  totalFailed: integer("total_failed").notNull().default(0),
  totalCost: text("total_cost").default("0.0"),
  taxonomyCategories: integer("taxonomy_categories").default(0),
  taxonomyTags: integer("taxonomy_tags").default(0),
});

export const insertSessionRunSchema = createInsertSchema(sessionRuns);
export const selectSessionRunSchema = createSelectSchema(sessionRuns);
export type SessionRun = typeof sessionRuns.$inferSelect;
export type NewSessionRun = typeof sessionRuns.$inferInsert;
