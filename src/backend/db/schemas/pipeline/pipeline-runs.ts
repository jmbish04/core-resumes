/**
 * @file Schema for `pipeline_runs` — the cross-pipeline run-status index.
 *
 * Every pipeline (freelance scan, greenhouse board scan, salary refresh,
 * discovery analyzer, company sync, …) writes a terminal row here via the
 * `runPipeline()` wrapper (`src/backend/lib/observability/run-pipeline.ts`).
 *
 * This is the single normalized table the observability tools query for
 * "which pipelines are running / failing / stale". The pre-existing
 * per-domain tables (`session_runs`, `freelance_scan_runs`,
 * `api_company_sync_stats`) remain as detail layers — this is the index on
 * top of them, not a replacement.
 */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `pipeline_runs` table for the documentation UI. */
export const PIPELINE_RUNS_TABLE_DESCRIPTION =
  "Cross-pipeline run-status index. One row per pipeline execution (freelance-scan, greenhouse-scan, salary, discovery, …), written via the runPipeline() wrapper with a guaranteed terminal status — even on failure. Backs the observability health/error tooling.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const PIPELINE_RUNS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  run_id: "UUID primary key — correlates this run with its log timeline via the run_id stamped on every LogEvent.",
  pipeline:
    "Pipeline identifier — e.g. 'freelance-scan', 'greenhouse-scan', 'salary', 'discovery', 'company-sync'.",
  trigger: "What initiated this run — 'cron', 'manual', 'agent', or 'api'.",
  status: "Run status — 'running', 'completed', or 'failed'. A finally{} block guarantees a terminal value.",
  started_at: "Unix timestamp of when this run started.",
  finished_at: "Unix timestamp of when this run reached a terminal status (null while running).",
  duration_ms: "Total wall-clock duration in milliseconds (null while running).",
  attempted: "Number of units the run attempted to process (boards, listings, jobs, …).",
  succeeded: "Number of units that succeeded.",
  failed: "Number of units that failed.",
  error_summary:
    "JSON: ranked error_type buckets with counts and a sample message (e.g. { TIMEOUT: { count, sample } }).",
  source_breakdown:
    "JSON: per-source outcome breakdown (e.g. per board token, per platform) for drill-down.",
  metadata: "JSON: free-form run metadata (query params, config, version, …).",
};

// ---------------------------------------------------------------------------
// Shared value types (also referenced by the observability service)
// ---------------------------------------------------------------------------

export type PipelineRunStatus = "running" | "completed" | "failed";
export type PipelineRunTrigger = "cron" | "manual" | "agent" | "api";

/** Normalized error classification used in `error_summary` and LogEvent. */
export type PipelineErrorType =
  | "D1_OVERLOAD"
  | "TIMEOUT"
  | "DEST_UNAVAILABLE"
  | "PARSE_ERROR"
  | "AUTH"
  | "UPSTREAM_4XX"
  | "UPSTREAM_5XX"
  | "UNKNOWN";

export interface PipelineErrorSummary {
  [errorType: string]: { count: number; sample: string };
}

export interface PipelineSourceBreakdown {
  [source: string]: { attempted: number; succeeded: number; failed: number };
}

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const pipelineRuns = sqliteTable(
  "pipeline_runs",
  {
    runId: text("run_id").primaryKey(),
    pipeline: text("pipeline").notNull(),
    trigger: text("trigger", {
      enum: ["cron", "manual", "agent", "api"],
    }).notNull(),
    status: text("status", {
      enum: ["running", "completed", "failed"],
    }).notNull(),
    startedAt: integer("started_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    finishedAt: integer("finished_at", { mode: "timestamp" }),
    durationMs: integer("duration_ms"),
    attempted: integer("attempted").notNull().default(0),
    succeeded: integer("succeeded").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    errorSummary: text("error_summary", { mode: "json" }).$type<PipelineErrorSummary>(),
    sourceBreakdown: text("source_breakdown", { mode: "json" }).$type<PipelineSourceBreakdown>(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  },
  (table) => ({
    pipelineIdx: index("pipeline_runs_pipeline_idx").on(table.pipeline),
    statusIdx: index("pipeline_runs_status_idx").on(table.status),
    startedAtIdx: index("pipeline_runs_started_at_idx").on(table.startedAt),
  }),
);

export const insertPipelineRunSchema = createInsertSchema(pipelineRuns);
export const selectPipelineRunSchema = createSelectSchema(pipelineRuns);
export type PipelineRun = typeof pipelineRuns.$inferSelect;
export type NewPipelineRun = typeof pipelineRuns.$inferInsert;
