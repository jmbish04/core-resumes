import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { roles } from "./roles";

// ---------------------------------------------------------------------------
// Insight type enum — one per analysis dimension
// ---------------------------------------------------------------------------

export const ROLE_INSIGHT_TYPES = ["location", "compensation", "combined"] as const;

export type RoleInsightType = (typeof ROLE_INSIGHT_TYPES)[number];

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `role_insights` table for the documentation UI. */
export const ROLE_INSIGHTS_TABLE_DESCRIPTION =
  "Versioned analysis insights for roles across dimensions (location, compensation, combined). " +
  "Each row captures one analysis run with input hashing for change detection, AI-generated scores, " +
  "raw API responses, and a snapshot of the config at analysis time.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const ROLE_INSIGHTS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key.",
  role_id: "Foreign key to the parent role. Cascades on delete.",
  version: "Auto-incremented version per role per type.",
  type: "Insight dimension: location, compensation, or combined.",
  input_hash:
    "SHA-256 hash of the input fields for this type. Used for change detection — if a new analysis matches any prior hash, the existing result is returned.",
  score: "AI-generated score (0–100) for this dimension.",
  rationale: "AI-generated summary rationale (always visible on frontend).",
  raw_api_response:
    "Raw external API response (e.g. ORS matrix, geocode). JSON blob, collapsible in UI.",
  analysis_payload:
    "Structured analysis result (e.g. commute table, compensation breakdown). JSON blob.",
  config_snapshot:
    "Snapshot of compensation_baseline or scoring rubrics config at analysis time. JSON blob.",
  created_at: "Row creation timestamp.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const roleInsights = sqliteTable(
  "role_insights",
  {
    id: text("id").primaryKey(),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    type: text("type", {
      enum: ROLE_INSIGHT_TYPES,
    }).notNull(),
    inputHash: text("input_hash").notNull(),
    score: integer("score").notNull(),
    rationale: text("rationale").notNull(),
    rawApiResponse: text("raw_api_response", { mode: "json" }).$type<Record<string, unknown>>(),
    analysisPayload: text("analysis_payload", { mode: "json" }).$type<Record<string, unknown>>(),
    configSnapshot: text("config_snapshot", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    roleTypeIdx: index("role_insights_role_type_idx").on(table.roleId, table.type),
    hashIdx: index("role_insights_hash_idx").on(table.inputHash),
  }),
);

// ── Zod schemas & TypeScript types ────────────────────────────────────────

export const insertRoleInsightSchema = createInsertSchema(roleInsights);
export const selectRoleInsightSchema = createSelectSchema(roleInsights);
export type RoleInsight = typeof roleInsights.$inferSelect;
export type NewRoleInsight = typeof roleInsights.$inferInsert;
