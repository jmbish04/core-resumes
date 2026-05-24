/**
 * @file Schema for job skill snapshots — per-skill AI match scoring.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { jobSnapshots } from "./job-snapshots";

export const JOB_SKILL_SNAPSHOTS_TABLE_DESCRIPTION =
  "Normalized preferred skills from a job posting, each with an AI match score (1–10).";

export const JOB_SKILL_SNAPSHOTS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  snapshot_id: "Foreign key to the parent job_snapshots row.",
  skill: "Skill text extracted from the job posting.",
  match_score: "AI match score (1–10).",
  match_rationale: "AI-generated explanation.",
};

export const jobSkillSnapshots = sqliteTable("job_skill_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  snapshotId: integer("snapshot_id")
    .notNull()
    .references(() => jobSnapshots.id, { onDelete: "cascade" }),
  skill: text("skill").notNull(),
  matchScore: integer("match_score"),
  matchRationale: text("match_rationale"),
});

export const insertJobSkillSnapshotSchema = createInsertSchema(jobSkillSnapshots);
export const selectJobSkillSnapshotSchema = createSelectSchema(jobSkillSnapshots);
export type JobSkillSnapshot = typeof jobSkillSnapshots.$inferSelect;
export type NewJobSkillSnapshot = typeof jobSkillSnapshots.$inferInsert;
