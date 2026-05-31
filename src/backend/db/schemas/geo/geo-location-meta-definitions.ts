import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

export const GEO_LOCATION_META_DEFINITIONS_TABLE_DESCRIPTION =
  "Registry of metric types that can be attached to geo_locations via geo_location_mappings (EAV pattern). " +
  "Examples: cost_of_living_index, tech_hub_tier, remote_discount_factor.";

export const GEO_LOCATION_META_DEFINITIONS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Autoincrement integer primary key.",
  key: "Unique machine-readable key (e.g., 'cost_of_living_index', 'tech_hub_tier').",
  label: "Human-readable label for display (e.g., 'Cost of Living Index').",
  description: "Detailed description of what this metric represents.",
  value_type: "Data type hint: 'number', 'string', or 'json'.",
  created_at: "Unix timestamp (seconds) when the definition was created.",
  updated_at: "Unix timestamp (seconds) of last modification.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const geoLocationMetaDefinitions = sqliteTable(
  "geo_location_meta_definitions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    valueType: text("value_type", {
      enum: ["number", "string", "json"],
    })
      .notNull()
      .default("number"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    keyUniq: uniqueIndex("geo_meta_defs_key_uniq_idx").on(table.key),
  }),
);

export const insertGeoLocationMetaDefinitionSchema = createInsertSchema(geoLocationMetaDefinitions);
export const selectGeoLocationMetaDefinitionSchema = createSelectSchema(geoLocationMetaDefinitions);
export type GeoLocationMetaDefinition = typeof geoLocationMetaDefinitions.$inferSelect;
export type NewGeoLocationMetaDefinition = typeof geoLocationMetaDefinitions.$inferInsert;
