/**
 * @file Schema for job tag HITL feedback — human signals on AI tag assignments.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { jobTagMappings } from "./job-tag-mappings";

export const JOB_TAG_HITL_FEEDBACK_TABLE_DESCRIPTION =
  "Human-in-the-loop feedback on AI tag assignments. Signals help calibrate future tag predictions.";

export const JOB_TAG_HITL_FEEDBACK_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  tag_mapping_id: "Foreign key to the job_tag_mappings row being rated.",
  signal: "Feedback signal: up (agree), down (disagree), or added (user added this tag).",
  user_rationale: "Optional text rationale for the feedback.",
  created_at: "Unix timestamp (seconds) of when feedback was given.",
};

export const jobTagHitlFeedback = sqliteTable("job_tag_hitl_feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tagMappingId: integer("tag_mapping_id")
    .notNull()
    .references(() => jobTagMappings.id, { onDelete: "cascade" }),
  signal: text("signal", { enum: ["up", "down", "added"] }).notNull(),
  userRationale: text("user_rationale"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertJobTagHitlFeedbackSchema = createInsertSchema(jobTagHitlFeedback);
export const selectJobTagHitlFeedbackSchema = createSelectSchema(jobTagHitlFeedback);
export type JobTagHitlFeedback = typeof jobTagHitlFeedback.$inferSelect;
export type NewJobTagHitlFeedback = typeof jobTagHitlFeedback.$inferInsert;
