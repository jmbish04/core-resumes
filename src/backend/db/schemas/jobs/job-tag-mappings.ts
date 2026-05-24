/**
 * @file Schema for job tag mappings — M:M link between snapshots and tags.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { jobSnapshots } from "./job-snapshots";
import { jobTags } from "./job-tags";

export const JOB_TAG_MAPPINGS_TABLE_DESCRIPTION =
  "Many-to-many link between a job snapshot and the tags AI assigned to it.";

export const JOB_TAG_MAPPINGS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  job_tag_id: "Foreign key to the job_tags table.",
  job_snapshot_id: "Foreign key to the job_snapshots table.",
  ai_rationale: "AI-generated reasoning for assigning this tag.",
};

export const jobTagMappings = sqliteTable("job_tag_mappings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobTagId: integer("job_tag_id")
    .notNull()
    .references(() => jobTags.id, { onDelete: "cascade" }),
  jobSnapshotId: integer("job_snapshot_id")
    .notNull()
    .references(() => jobSnapshots.id, { onDelete: "cascade" }),
  aiRationale: text("ai_rationale"),
});

export const insertJobTagMappingSchema = createInsertSchema(jobTagMappings);
export const selectJobTagMappingSchema = createSelectSchema(jobTagMappings);
export type JobTagMapping = typeof jobTagMappings.$inferSelect;
export type NewJobTagMapping = typeof jobTagMappings.$inferInsert;
