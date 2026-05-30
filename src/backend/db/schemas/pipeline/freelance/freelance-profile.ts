/**
 * @file Schema for freelance profile — key/value config for the freelance pipeline.
 *
 * Simple lookup table storing freelance-related settings such as hourly
 * rates, preferred categories, and platform credential metadata.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `freelance_profile` table for the documentation UI. */
export const FREELANCE_PROFILE_TABLE_DESCRIPTION =
  "Key/value configuration store for the freelance pipeline. Holds settings like hourly rates, preferred categories, and platform metadata.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const FREELANCE_PROFILE_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  key: "Unique configuration key (e.g. 'hourly_rate_min', 'preferred_categories').",
  value: "JSON-encoded configuration value. Type varies per key.",
  updated_at: "Unix timestamp of the last update to this entry.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const freelanceProfile = sqliteTable("freelance_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value", { mode: "json" }).$type<unknown>(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertFreelanceProfileSchema = createInsertSchema(freelanceProfile);
export const selectFreelanceProfileSchema = createSelectSchema(freelanceProfile);
export type FreelanceProfileEntry = typeof freelanceProfile.$inferSelect;
export type NewFreelanceProfileEntry = typeof freelanceProfile.$inferInsert;
