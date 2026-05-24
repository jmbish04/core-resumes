/**
 * @file Schema for api_companies — data aggregated from github.com/Feashliaa/job-board-aggregator
 */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation
// ---------------------------------------------------------------------------

export const API_COMPANIES_TABLE_DESCRIPTION =
  "Companies synced from the upstream job-board-aggregator repository. Tracks ATS board tokens across different systems like Greenhouse, Lever, etc.";

export const API_COMPANIES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  name: "Company name if known (null by default, populated later).",
  job_board_token: "The unique token used by the ATS system for the company.",
  system: "The ATS system used (e.g. greenhouse, lever).",
  source: "The source JSON file in the aggregator repo.",
  timestamp_added: "When this company was first discovered.",
  timestamp_inactive: "When this company was last detected as removed from the upstream list.",
  is_active: "True if the company was present in the last upstream sync.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const apiCompanies = sqliteTable(
  "api_companies",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name"),
    jobBoardToken: text("job_board_token").notNull(),
    system: text("system").notNull(),
    source: text("source").notNull(),
    timestampAdded: integer("timestamp_added", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    timestampInactive: integer("timestamp_inactive", { mode: "timestamp" }),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => ({
    tokenSystemIdx: index("api_companies_token_system_idx").on(table.jobBoardToken, table.system),
    activeIdx: index("api_companies_active_idx").on(table.isActive),
  }),
);

export const insertApiCompanySchema = createInsertSchema(apiCompanies);
export const selectApiCompanySchema = createSelectSchema(apiCompanies);
export type ApiCompany = typeof apiCompanies.$inferSelect;
export type NewApiCompany = typeof apiCompanies.$inferInsert;
