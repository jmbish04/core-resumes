/**
 * @file Schema for job responsibility snapshots — per-responsibility AI match scoring.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { jobSnapshots } from "./job-snapshots";

export const JOB_RESPONSIBILITY_SNAPSHOTS_TABLE_DESCRIPTION =
  "Normalized responsibilities from a job posting's 'What You'll Do' section, each with an AI match score (1–10).";

export const JOB_RESPONSIBILITY_SNAPSHOTS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  snapshot_id: "Foreign key to the parent job_snapshots row.",
  responsibility: "Responsibility text extracted from the job posting.",
  match_score: "AI match score (1–10).",
  match_rationale: "AI-generated explanation.",
};

export const jobResponsibilitySnapshots = sqliteTable("job_responsibility_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  snapshotId: integer("snapshot_id")
    .notNull()
    .references(() => jobSnapshots.id, { onDelete: "cascade" }),
  responsibility: text("responsibility").notNull(),
  matchScore: integer("match_score"),
  matchRationale: text("match_rationale"),
});

export const insertJobResponsibilitySnapshotSchema = createInsertSchema(jobResponsibilitySnapshots);
export const selectJobResponsibilitySnapshotSchema = createSelectSchema(jobResponsibilitySnapshots);
export type JobResponsibilitySnapshot = typeof jobResponsibilitySnapshots.$inferSelect;
export type NewJobResponsibilitySnapshot = typeof jobResponsibilitySnapshots.$inferInsert;
