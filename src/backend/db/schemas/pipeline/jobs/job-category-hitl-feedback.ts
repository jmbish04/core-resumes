/**
 * @file Schema for job category HITL feedback — human signals on AI category assignments.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { jobCategoryMappings } from "./job-category-mappings";

export const JOB_CATEGORY_HITL_FEEDBACK_TABLE_DESCRIPTION =
  "Human-in-the-loop feedback on AI category assignments. Signals (up/down/added) help calibrate future category predictions.";

export const JOB_CATEGORY_HITL_FEEDBACK_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  category_mapping_id: "Foreign key to the job_category_mappings row being rated.",
  signal: "Feedback signal: up (agree), down (disagree), or added (user added this category).",
  user_rationale: "Optional text rationale for the feedback.",
  created_at: "Unix timestamp (seconds) of when feedback was given.",
};

export const jobCategoryHitlFeedback = sqliteTable("job_category_hitl_feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  categoryMappingId: integer("category_mapping_id")
    .notNull()
    .references(() => jobCategoryMappings.id, { onDelete: "cascade" }),
  signal: text("signal", { enum: ["up", "down", "added"] }).notNull(),
  userRationale: text("user_rationale"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertJobCategoryHitlFeedbackSchema = createInsertSchema(jobCategoryHitlFeedback);
export const selectJobCategoryHitlFeedbackSchema = createSelectSchema(jobCategoryHitlFeedback);
export type JobCategoryHitlFeedback = typeof jobCategoryHitlFeedback.$inferSelect;
export type NewJobCategoryHitlFeedback = typeof jobCategoryHitlFeedback.$inferInsert;
