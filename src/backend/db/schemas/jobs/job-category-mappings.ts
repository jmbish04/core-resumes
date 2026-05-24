/**
 * @file Schema for job category mappings — M:M link between snapshots and categories.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { jobCategories } from "./job-categories";
import { jobSnapshots } from "./job-snapshots";

export const JOB_CATEGORY_MAPPINGS_TABLE_DESCRIPTION =
  "Many-to-many link between a job snapshot and the categories AI assigned to it.";

export const JOB_CATEGORY_MAPPINGS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  job_category_id: "Foreign key to the job_categories table.",
  job_snapshot_id: "Foreign key to the job_snapshots table.",
  ai_rationale: "AI-generated reasoning for assigning this category.",
};

export const jobCategoryMappings = sqliteTable(
  "job_category_mappings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobCategoryId: integer("job_category_id")
      .notNull()
      .references(() => jobCategories.id, { onDelete: "cascade" }),
    jobSnapshotId: integer("job_snapshot_id")
      .notNull()
      .references(() => jobSnapshots.id, { onDelete: "cascade" }),
    aiRationale: text("ai_rationale"),
  },
  (table) => ({
    categoryIdx: index("job_category_mappings_category_id_idx").on(table.jobCategoryId),
    snapshotIdx: index("job_category_mappings_snapshot_id_idx").on(table.jobSnapshotId),
  }),
);

export const insertJobCategoryMappingSchema = createInsertSchema(jobCategoryMappings);
export const selectJobCategoryMappingSchema = createSelectSchema(jobCategoryMappings);
export type JobCategoryMapping = typeof jobCategoryMappings.$inferSelect;
export type NewJobCategoryMapping = typeof jobCategoryMappings.$inferInsert;
