import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { marketSalarySnapshots } from "./salary-stats";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `market_salary_insights` table for the documentation UI. */
export const MARKET_SALARY_INSIGHTS_TABLE_DESCRIPTION =
  "Stores broad, AI-generated salary trend insights computed from the latest market statistics snapshots.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const MARKET_SALARY_INSIGHTS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Autoincrementing primary key.",
  snapshot_id: "Foreign key referencing the parent market_salary_snapshots.id.",
  insight_text: "AI-generated markdown report of broad market salary trends.",
  metadata: "JSON-serialized metadata containing model details, prompt tokens, and parameters.",
  created_at: "Timestamp when the insight report was generated.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const marketSalaryInsights = sqliteTable("market_salary_insights", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  snapshotId: integer("snapshot_id")
    .notNull()
    .references(() => marketSalarySnapshots.id, { onDelete: "cascade" }),
  insightText: text("insight_text").notNull(),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Schemas and Types
// ---------------------------------------------------------------------------

export const insertMarketSalaryInsightSchema = createInsertSchema(marketSalaryInsights);
export const selectMarketSalaryInsightSchema = createSelectSchema(marketSalaryInsights);
export type MarketSalaryInsight = typeof marketSalaryInsights.$inferSelect;
export type NewMarketSalaryInsight = typeof marketSalaryInsights.$inferInsert;

// ---------------------------------------------------------------------------
// Market Sandbox Runs (Stores raw Sandbox Python executions)
// ---------------------------------------------------------------------------

export const MARKET_SANDBOX_RUNS_TABLE_DESCRIPTION =
  "Stores raw Python execution metadata, scripts, outputs, and status from the secure Sandbox container runs.";

export const MARKET_SANDBOX_RUNS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Autoincrementing primary key.",
  snapshot_id: "Optional reference to the parent market_salary_snapshots.id.",
  role_id: "Optional reference to the roles.id this run was triggered for.",
  script_type: "Type of script executed (e.g. broad_trends, role_compensation, custom_qa).",
  python_script: "The full Python code executed inside the Sandbox.",
  raw_output: "JSON-serialized raw output of the python script.",
  status: "Execution status: success or failed.",
  error_message: "Error trace if the execution failed.",
  created_at: "Timestamp when the execution occurred.",
};

export const marketSandboxRuns = sqliteTable("market_sandbox_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  snapshotId: integer("snapshot_id").references(() => marketSalarySnapshots.id, { onDelete: "cascade" }),
  roleId: text("role_id"), // Not explicitly foreign-keyed to prevent breaking on soft deletes or un-synced roles, but mapped conceptually
  scriptType: text("script_type").notNull(), // broad_trends | role_compensation | custom_qa
  pythonScript: text("python_script").notNull(),
  rawOutput: text("raw_output", { mode: "json" }).$type<Record<string, unknown>>(),
  status: text("status").notNull(), // success | failed
  errorMessage: text("error_message"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertMarketSandboxRunSchema = createInsertSchema(marketSandboxRuns);
export const selectMarketSandboxRunSchema = createSelectSchema(marketSandboxRuns);
export type MarketSandboxRun = typeof marketSandboxRuns.$inferSelect;
export type NewMarketSandboxRun = typeof marketSandboxRuns.$inferInsert;
