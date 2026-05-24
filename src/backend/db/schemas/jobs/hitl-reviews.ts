/**
 * @file Schema for HITL reviews — human-in-the-loop feedback on job analyses.
 *
 * Each row captures a human's verdict override, rationale override,
 * or any adjustment to a snapshot's automated assessment. Used to
 * calibrate future pipeline runs.
 */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { jobSnapshots } from "./job-snapshots";

export const HITL_REVIEWS_TABLE_DESCRIPTION =
  "Human-in-the-loop review overrides for job snapshot assessments. Captures verdict adjustments, score corrections, and user rationale for pipeline calibration.";

export const HITL_REVIEWS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  snapshot_id: "Foreign key to the job_snapshots row being reviewed.",
  field: "Name of the assessment field being overridden (e.g. 'verdict', 'match_score').",
  old_value: "Previous value before the override.",
  new_value: "New human-provided value.",
  rationale: "Human rationale for the override.",
  created_at: "Unix timestamp (seconds) of when the review was submitted.",
};

export const hitlReviews = sqliteTable(
  "hitl_reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => jobSnapshots.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    rationale: text("rationale"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    snapshotIdx: index("hitl_reviews_snapshot_id_idx").on(table.snapshotId),
  }),
);

export const insertHitlReviewSchema = createInsertSchema(hitlReviews);
export const selectHitlReviewSchema = createSelectSchema(hitlReviews);
export type HitlReview = typeof hitlReviews.$inferSelect;
export type NewHitlReview = typeof hitlReviews.$inferInsert;
