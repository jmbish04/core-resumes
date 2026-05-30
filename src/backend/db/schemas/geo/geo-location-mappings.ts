import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

export const GEO_LOCATION_MAPPINGS_TABLE_DESCRIPTION =
  "EAV value store linking geo_locations to their metric values (defined by geo_location_meta_definitions). " +
  "One row per location per metric. Replaces the cost_of_living_index table.";

export const GEO_LOCATION_MAPPINGS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Autoincrement integer primary key.",
  geo_id: "FK to geo_locations.id (CASCADE on delete).",
  meta_id: "FK to geo_location_meta_definitions.id (CASCADE on delete).",
  value: "Stringified metric value. Parsed by consumers based on the meta definition's value_type.",
  source: "Data provenance (e.g., 'BLS', 'manual', 'seed').",
  as_of: "ISO 8601 date string indicating when the metric value was valid.",
  created_at: "Unix timestamp (seconds) when the mapping was created.",
  updated_at: "Unix timestamp (seconds) of last modification.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const geoLocationMappings = sqliteTable(
  "geo_location_mappings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    geoId: integer("geo_id").notNull(),
    metaId: integer("meta_id").notNull(),
    value: text("value").notNull(),
    source: text("source"),
    asOf: text("as_of"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    geoMetaUniq: uniqueIndex("geo_mappings_geo_meta_uniq_idx").on(
      table.geoId,
      table.metaId,
    ),
    geoIdx: index("geo_mappings_geo_id_idx").on(table.geoId),
    metaIdx: index("geo_mappings_meta_id_idx").on(table.metaId),
  }),
);

export const insertGeoLocationMappingSchema = createInsertSchema(geoLocationMappings);
export const selectGeoLocationMappingSchema = createSelectSchema(geoLocationMappings);
export type GeoLocationMapping = typeof geoLocationMappings.$inferSelect;
export type NewGeoLocationMapping = typeof geoLocationMappings.$inferInsert;
