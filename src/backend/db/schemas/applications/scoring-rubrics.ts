import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Rubric type enum — one per analysis dimension
// ---------------------------------------------------------------------------

export const SCORING_RUBRIC_TYPES = ["location", "compensation", "combined"] as const;

export type ScoringRubricType = (typeof SCORING_RUBRIC_TYPES)[number];

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `scoring_rubrics` table for the documentation UI. */
export const SCORING_RUBRICS_TABLE_DESCRIPTION =
  "Configurable scoring rubric criteria used by AI to rate roles across dimensions " +
  "(location, compensation, combined). Each row represents a single criteria band " +
  "with a score range. Supports soft-delete via is_active flag.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const SCORING_RUBRICS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  type: "Rubric dimension: location, compensation, or combined.",
  criteria: "Human-readable description of the scoring scenario (e.g. 'Full remote / WFH').",
  score_range_min: "Minimum score for this criteria band (0–100).",
  score_range_max: "Maximum score for this criteria band (0–100).",
  sort_order: "Display ordering within the type group. Lower values appear first.",
  is_active: "Soft-delete flag. 1 = active, 0 = deleted.",
  created_at: "Row creation timestamp.",
  updated_at: "Last modification timestamp.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const scoringRubrics = sqliteTable(
  "scoring_rubrics",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", {
      enum: SCORING_RUBRIC_TYPES,
    }).notNull(),
    criteria: text("criteria").notNull(),
    scoreRangeMin: integer("score_range_min").notNull(),
    scoreRangeMax: integer("score_range_max").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    typeIdx: index("scoring_rubrics_type_idx").on(table.type),
    activeIdx: index("scoring_rubrics_active_idx").on(table.isActive),
  }),
);

// ── Zod schemas & TypeScript types ────────────────────────────────────────

export const insertScoringRubricSchema = createInsertSchema(scoringRubrics);
export const selectScoringRubricSchema = createSelectSchema(scoringRubrics);
export type ScoringRubric = typeof scoringRubrics.$inferSelect;
export type NewScoringRubric = typeof scoringRubrics.$inferInsert;
