import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

/**
 * Resume bullets — verified career accomplishments used by the AI agent
 * as "Historical Performance Truths" when drafting resumes, cover letters,
 * and other job-application content.
 *
 * Supports soft-delete via `isActive` + `timeDeleted`, and full revision
 * tracking via `replacedBy` (FK to the newer bullet) + `timeRevised`.
 */
export const resumeBullets = sqliteTable(
  "resume_bullets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),

    /** The actual bullet text — a single, self-contained accomplishment. */
    content: text("content").notNull(),

    /** High-level classification: Strategic, Technical, Impact, Collaboration. */
    category: text("category", {
      enum: ["Strategic", "Technical", "Impact", "Collaboration"],
    }).notNull(),

    /** Quantifiable outcome extracted from the bullet, e.g. "$16M" or "70%". */
    impactMetric: text("impact_metric"),

    /** Comma-separated tags for filtering, e.g. "AI, SQL, Leadership". */
    tags: text("tags"),

    /** Internal context notes visible only to the agent, never to employers. */
    notes: text("notes"),

    /** Soft-delete flag. Agent only sees bullets where is_active = true. */
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),

    /** Tracks how often the agent selects this bullet during drafting. */
    usageCount: integer("usage_count").notNull().default(0),

    // ── Revision tracking ──────────────────────────────────────────────

    /**
     * FK pointing to the bullet that replaced this one.
     * null = this is the current version (or was manually deactivated).
     * non-null = this bullet was edited and a new version was created.
     */
    replacedBy: integer("replaced_by"),

    /** Timestamp when this bullet was revised (replaced by a newer version). */
    timeRevised: integer("time_revised", { mode: "timestamp" }),

    /** Timestamp when this bullet was soft-deleted (deactivated by the user). */
    timeDeleted: integer("time_deleted", { mode: "timestamp" }),

    // ── Standard timestamps ────────────────────────────────────────────

    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),

    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    activeIdx: index("resume_bullets_active_idx").on(table.isActive),
    categoryIdx: index("resume_bullets_category_idx").on(table.category),
    replacedByIdx: index("resume_bullets_replaced_by_idx").on(table.replacedBy),
  }),
);

// ── Column documentation for the docs frontend ───────────────────────────

export const RESUME_BULLETS_TABLE_DESCRIPTION =
  "Verified career accomplishments ('Historical Performance Truths') injected into the AI agent's system prompt during resume and cover-letter drafting. Supports soft-delete and full revision history.";

export const RESUME_BULLETS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  content: "The accomplishment bullet text. Must be self-contained and truthful.",
  category: "Classification: Strategic, Technical, Impact, or Collaboration.",
  impact_metric: "Quantifiable outcome (e.g. '$16M savings', '70% reduction').",
  tags: "Comma-separated tags for filtering and agent context.",
  notes: "Internal notes for the agent — never exposed to employers.",
  is_active: "Soft-delete flag. Only active bullets are injected into drafts.",
  usage_count: "Number of times the agent has selected this bullet.",
  replaced_by: "FK to the newer bullet that replaced this one (revision chain).",
  time_revised: "Timestamp when this bullet was replaced by a newer version.",
  time_deleted: "Timestamp when this bullet was soft-deleted by the user.",
  created_at: "Row creation timestamp.",
  updated_at: "Last modification timestamp.",
};

// ── Zod schemas & TypeScript types ────────────────────────────────────────

export const insertResumeBulletSchema = createInsertSchema(resumeBullets);
export const selectResumeBulletSchema = createSelectSchema(resumeBullets);
export type ResumeBullet = typeof resumeBullets.$inferSelect;
export type NewResumeBullet = typeof resumeBullets.$inferInsert;
