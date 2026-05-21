import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { roleBullets } from "./role-bullets";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `role_bullet_analyses` table for the documentation UI. */
export const ROLE_BULLET_ANALYSES_TABLE_DESCRIPTION =
  "Versioned AI scoring for individual role bullets. Each re-analysis creates a new row with " +
  "an incremented revision_number, providing a full audit trail of how bullet scores evolve " +
  "across analysis runs and agent-driven re-scoring conversations.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const ROLE_BULLET_ANALYSES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  bullet_id: "Foreign key to the role_bullets row being scored. Cascades on delete.",
  revision_number:
    "Monotonically increasing revision counter per bullet. 1 = first score, 2 = first re-score, etc.",
  ai_score: "Alignment score (0–100). 75–100 = Strong, 40–74 = Moderate, 0–39 = Gap.",
  ai_rationale:
    "Evidence-based explanation of the score, citing NotebookLM career evidence and resume bullets.",
  created_at: "Timestamp when this scoring revision was created.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const roleBulletAnalyses = sqliteTable(
  "role_bullet_analyses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bulletId: integer("bullet_id")
      .notNull()
      .references(() => roleBullets.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull().default(1),
    aiScore: integer("ai_score").notNull(),
    aiRationale: text("ai_rationale").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    bulletIdx: index("role_bullet_analyses_bullet_id_idx").on(table.bulletId),
    revisionIdx: index("role_bullet_analyses_revision_idx").on(
      table.bulletId,
      table.revisionNumber,
    ),
  }),
);

// ── Zod schemas & TypeScript types ────────────────────────────────────────

export const insertRoleBulletAnalysisSchema = createInsertSchema(roleBulletAnalyses);
export const selectRoleBulletAnalysisSchema = createSelectSchema(roleBulletAnalyses);
export type RoleBulletAnalysis = typeof roleBulletAnalyses.$inferSelect;
export type NewRoleBulletAnalysis = typeof roleBulletAnalyses.$inferInsert;
