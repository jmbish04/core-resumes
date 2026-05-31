import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { geoLocations } from "../geo/geo-locations";

export const COST_OF_LIVING_INDEX_TABLE_DESCRIPTION =
  "Cost of Living indices per metropolitan area, used for cross-market salary normalization. " +
  "Linked to the canonical geo_locations record via geo_id.";

export const COST_OF_LIVING_INDEX_COLUMN_DESCRIPTIONS: Record<string, string> = {
  metro: "Normalized metropolitan area name (e.g., 'San Francisco, CA') (Primary Key, human-readable mirror).",
  geo_id: "FK to geo_locations.id (the canonical metro record). Authoritative join key.",
  col_index: "Cost of living index multiplier (e.g., 1.34).",
  source: "Data source (e.g., 'BLS').",
  as_of: "Date string for the index baseline.",
};

export const costOfLivingIndex = sqliteTable(
  "cost_of_living_index",
  {
    metro: text("metro").primaryKey(),
    geoId: integer("geo_id").references(() => geoLocations.id),
    colIndex: real("col_index").notNull(),
    source: text("source").notNull(),
    asOf: text("as_of").notNull(),
  },
  (table) => ({
    geoIdx: index("cost_of_living_index_geo_id_idx").on(table.geoId),
  })
);

export const insertCostOfLivingIndexSchema = createInsertSchema(costOfLivingIndex);
export const selectCostOfLivingIndexSchema = createSelectSchema(costOfLivingIndex);
export type CostOfLivingIndex = typeof costOfLivingIndex.$inferSelect;
export type NewCostOfLivingIndex = typeof costOfLivingIndex.$inferInsert;
