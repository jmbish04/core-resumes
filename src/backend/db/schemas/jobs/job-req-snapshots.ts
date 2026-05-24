/**
 * @file Schema for job requirement snapshots — per-bullet AI match scoring.
 *
 * Each row represents a single requirement extracted from a job posting,
 * paired with an AI-generated match score and rationale against the candidate.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { jobSnapshots } from "./job-snapshots";

// ---------------------------------------------------------------------------
// Table & column documentation
// ---------------------------------------------------------------------------

export const JOB_REQ_SNAPSHOTS_TABLE_DESCRIPTION =
  "Normalized requirements extracted from a job posting, each with an AI match score (1–10) assessing candidate alignment.";

export const JOB_REQ_SNAPSHOTS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  snapshot_id: "Foreign key to the parent job_snapshots row.",
  requirement: "Verbatim requirement text extracted from the job posting.",
  match_score: "AI match score (1–10) assessing how well the candidate meets this requirement.",
  match_rationale: "AI-generated explanation for the match score.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const jobReqSnapshots = sqliteTable("job_req_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  snapshotId: integer("snapshot_id")
    .notNull()
    .references(() => jobSnapshots.id, { onDelete: "cascade" }),
  requirement: text("requirement").notNull(),
  matchScore: integer("match_score"),
  matchRationale: text("match_rationale"),
});

export const insertJobReqSnapshotSchema = createInsertSchema(jobReqSnapshots);
export const selectJobReqSnapshotSchema = createSelectSchema(jobReqSnapshots);
export type JobReqSnapshot = typeof jobReqSnapshots.$inferSelect;
export type NewJobReqSnapshot = typeof jobReqSnapshots.$inferInsert;
