import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `market_salary_snapshots` table for the documentation UI. */
export const MARKET_SALARY_SNAPSHOTS_TABLE_DESCRIPTION =
  "Tracks each ingestion run of the job-board-aggregator market salary stats sync, including files processed and success status.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const MARKET_SALARY_SNAPSHOTS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Autoincrementing primary key.",
  run_timestamp: "Timestamp when the aggregation script ran.",
  status: "Inundation status: success or failed.",
  error: "Error trace if status is failed.",
  metadata: "JSON-serialized metadata containing job counts and files processed.",
};

/** Human-readable description of the `market_salary_stats` table. */
export const MARKET_SALARY_STATS_TABLE_DESCRIPTION =
  "Stores processed and aggregated market salary percentiles (Remote, Local Market, Top Hubs, National) for configured tech job roles.";

/** Per-column descriptions. */
export const MARKET_SALARY_STATS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Autoincrementing primary key.",
  snapshot_id: "Foreign key referencing the parent market_salary_snapshots.id.",
  role_type: "Target job title category matching config keywords (e.g. software engineer).",
  metric_key: "Categorical group key: remote, local_market, top_hubs, national.",
  metric_label: "Display label for UI, e.g., 'San Francisco Bay Area'.",
  p25: "25th percentile salary in USD.",
  median: "Median (50th percentile) salary in USD.",
  p75: "75th percentile salary in USD.",
  sample_size: "Sample size (number of job listings aggregated).",
  created_at: "Timestamp when this statistical row was saved.",
};

/** Human-readable description of the `market_company_salaries` table. */
export const MARKET_COMPANY_SALARIES_TABLE_DESCRIPTION =
  "Stores granular company-specific and title-specific H1B/LC salary percentiles imported from salary_lookup.json.";

/** Per-column descriptions. */
export const MARKET_COMPANY_SALARIES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Autoincrementing primary key.",
  snapshot_id: "Foreign key referencing the parent market_salary_snapshots.id.",
  company_name: "Canonical company name in lowercase, e.g. cloudflare, inc.",
  job_title: "Job title in lowercase, e.g. systems engineer.",
  seniority: "Calculated seniority category: entry, mid, senior.",
  p25: "25th percentile base salary in USD.",
  median: "Median base salary in USD.",
  p75: "75th percentile base salary in USD.",
  sample_size: "Sample size of certified H1B applications for this role.",
  created_at: "Timestamp when this lookup row was saved.",
};

// ---------------------------------------------------------------------------
// Table definitions
// ---------------------------------------------------------------------------

export const marketSalarySnapshots = sqliteTable("market_salary_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runTimestamp: integer("run_timestamp", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  status: text("status").notNull(), // success | failed
  error: text("error"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
});

export const marketSalaryStats = sqliteTable(
  "market_salary_stats",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => marketSalarySnapshots.id, { onDelete: "cascade" }),
    roleType: text("role_type").notNull(), // matching config target_roles keywords
    metricKey: text("metric_key").notNull(), // remote | local_market | top_hubs | national
    metricLabel: text("metric_label").notNull(), // "San Francisco Bay Area", "Remote", etc.
    p25: integer("p25").notNull(),
    median: integer("median").notNull(),
    p75: integer("p75").notNull(),
    sampleSize: integer("sample_size").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    snapshotIdx: index("market_salary_stats_snapshot_idx").on(table.snapshotId),
    roleIdx: index("market_salary_stats_role_idx").on(table.roleType),
    metricIdx: index("market_salary_stats_metric_idx").on(table.metricKey),
  }),
);

export const marketCompanySalaries = sqliteTable(
  "market_company_salaries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => marketSalarySnapshots.id, { onDelete: "cascade" }),
    companyName: text("company_name").notNull(),
    jobTitle: text("job_title").notNull(),
    seniority: text("seniority").notNull(), // entry | mid | senior
    p25: integer("p25").notNull(),
    median: integer("median").notNull(),
    p75: integer("p75").notNull(),
    sampleSize: integer("sample_size").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    snapshotIdx: index("market_company_salaries_snapshot_idx").on(table.snapshotId),
    companyIdx: index("market_company_salaries_company_idx").on(table.companyName),
    titleIdx: index("market_company_salaries_title_idx").on(table.jobTitle),
  }),
);

// ---------------------------------------------------------------------------
// Schemas and Types
// ---------------------------------------------------------------------------

export const insertMarketSalarySnapshotSchema = createInsertSchema(marketSalarySnapshots);
export const selectMarketSalarySnapshotSchema = createSelectSchema(marketSalarySnapshots);
export type MarketSalarySnapshot = typeof marketSalarySnapshots.$inferSelect;
export type NewMarketSalarySnapshot = typeof marketSalarySnapshots.$inferInsert;

export const insertMarketSalaryStatsSchema = createInsertSchema(marketSalaryStats);
export const selectMarketSalaryStatsSchema = createSelectSchema(marketSalaryStats);
export type MarketSalaryStats = typeof marketSalaryStats.$inferSelect;
export type NewMarketSalaryStats = typeof marketSalaryStats.$inferInsert;

export const insertMarketCompanySalariesSchema = createInsertSchema(marketCompanySalaries);
export const selectMarketCompanySalariesSchema = createSelectSchema(marketCompanySalaries);
export type MarketCompanySalaries = typeof marketCompanySalaries.$inferSelect;
export type NewMarketCompanySalaries = typeof marketCompanySalaries.$inferInsert;
