import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { roleAnalyses } from "./role-analyses";
import { ROLE_BULLET_TYPES } from "./role-bullets";
import { roles } from "./roles";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `role_alignment_scores` table for the documentation UI. */
export const ROLE_ALIGNMENT_SCORES_TABLE_DESCRIPTION =
  "Holistic per-type alignment summaries from the Phase 2 role analysis. Each row represents a bullet " +
  "type category (REQUIRED_QUALIFICATION, KEY_RESPONSIBILITY, etc.) scored in context of all individual " +
  "bullet analyses, enabling cross-bullet reasoning ('while bullet X scored low, strengths in Y compensate...').";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const ROLE_ALIGNMENT_SCORES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated at creation.",
  analysis_id: "Foreign key to the parent role_analyses record. Cascades on delete.",
  role_id:
    "Denormalized foreign key to the role for fast queries without joining role_analyses. Cascades on delete.",
  type: "Bullet category enum matching role_bullets.type: REQUIRED_QUALIFICATION, PREFERRED_QUALIFICATION, KEY_RESPONSIBILITY, EDUCATION_REQUIREMENT, REQUIRED_SKILL, PREFERRED_SKILL, BENEFIT.",
  content: "Summary label for this type group (e.g. 'Required Qualifications').",
  score:
    "Holistic alignment score (0–100) for the entire type category, considering bullet interactions.",
  rationale:
    "AI-generated per-type rationale referencing individual bullet scores and career evidence.",
  holistic_rationale:
    "Cross-bullet contextual reasoning — how strengths in some bullets compensate for gaps in others within this type.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const roleAlignmentScores = sqliteTable(
  "role_alignment_scores",
  {
    id: text("id").primaryKey(),
    analysisId: text("analysis_id")
      .notNull()
      .references(() => roleAnalyses.id, { onDelete: "cascade" }),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ROLE_BULLET_TYPES,
    }).notNull(),
    content: text("content").notNull(),
    score: integer("score").notNull(),
    rationale: text("rationale").notNull(),
    holisticRationale: text("holistic_rationale"),
  },
  (table) => ({
    analysisIdx: index("alignment_scores_analysis_id_idx").on(table.analysisId),
    roleIdx: index("alignment_scores_role_id_idx").on(table.roleId),
    typeIdx: index("alignment_scores_type_idx").on(table.type),
  }),
);

export const insertRoleAlignmentScoreSchema = createInsertSchema(roleAlignmentScores);
export const selectRoleAlignmentScoreSchema = createSelectSchema(roleAlignmentScores);
export type RoleAlignmentScore = typeof roleAlignmentScores.$inferSelect;
export type NewRoleAlignmentScore = typeof roleAlignmentScores.$inferInsert;
