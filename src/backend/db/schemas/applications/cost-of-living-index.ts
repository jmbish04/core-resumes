import { real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const COST_OF_LIVING_INDEX_TABLE_DESCRIPTION =
  "Cost of Living indices per metropolitan area, used for cross-market salary normalization.";

export const COST_OF_LIVING_INDEX_COLUMN_DESCRIPTIONS: Record<string, string> = {
  metro: "Normalized metropolitan area name (e.g., 'San Francisco, CA') (Primary Key).",
  col_index: "Cost of living index multiplier (e.g., 1.34).",
  source: "Data source (e.g., 'BLS').",
  as_of: "Date string for the index baseline.",
};

export const costOfLivingIndex = sqliteTable(
  "cost_of_living_index",
  {
    metro: text("metro").primaryKey(),
    colIndex: real("col_index").notNull(),
    source: text("source").notNull(),
    asOf: text("as_of").notNull(),
  }
);

export const insertCostOfLivingIndexSchema = createInsertSchema(costOfLivingIndex);
export const selectCostOfLivingIndexSchema = createSelectSchema(costOfLivingIndex);
export type CostOfLivingIndex = typeof costOfLivingIndex.$inferSelect;
export type NewCostOfLivingIndex = typeof costOfLivingIndex.$inferInsert;
