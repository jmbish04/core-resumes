import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

export const GEO_LOCATIONS_TABLE_DESCRIPTION =
  "Single source of truth for all geographic locations — metros, countries, micro-hubs, and neighborhoods. " +
  "Referenced via FK from roles.geo_id and joined to geo_location_mappings for EAV metrics.";

export const GEO_LOCATIONS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Autoincrement integer primary key.",
  type: "Location type discriminator: 'metro', 'country', 'micro_hub', 'neighborhood'.",
  name: "Canonical display name (e.g., 'San Francisco, CA', 'United States').",
  country: "ISO 3166-1 alpha-2 country code (e.g., 'US', 'GB').",
  region: "State, province, or administrative region (e.g., 'CA', 'England').",
  city: "City name (e.g., 'San Francisco').",
  metro: "Normalized metro area string for matching (unique for metros). Same as name for metro-type records.",
  lat: "Latitude coordinate (WGS84).",
  lng: "Longitude coordinate (WGS84).",
  parent_id: "Self-referential FK for hierarchy: micro_hub/neighborhood → parent metro.",
  is_active: "Soft-delete flag. 1 = active, 0 = deactivated.",
  created_at: "Unix timestamp (seconds) when the record was created.",
  updated_at: "Unix timestamp (seconds) of last modification.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const geoLocations = sqliteTable(
  "geo_locations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", {
      enum: ["metro", "country", "micro_hub", "neighborhood"],
    }).notNull(),
    name: text("name").notNull(),
    country: text("country"),
    region: text("region"),
    city: text("city"),
    metro: text("metro"),
    lat: real("lat"),
    lng: real("lng"),
    parentId: integer("parent_id"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    typeIdx: index("geo_locations_type_idx").on(table.type),
    countryIdx: index("geo_locations_country_idx").on(table.country),
    metroIdx: uniqueIndex("geo_locations_metro_uniq_idx").on(table.metro),
    parentIdx: index("geo_locations_parent_id_idx").on(table.parentId),
    nameTypeIdx: index("geo_locations_name_type_idx").on(table.name, table.type),
  }),
);

export const insertGeoLocationSchema = createInsertSchema(geoLocations);
export const selectGeoLocationSchema = createSelectSchema(geoLocations);
export type GeoLocation = typeof geoLocations.$inferSelect;
export type NewGeoLocation = typeof geoLocations.$inferInsert;
