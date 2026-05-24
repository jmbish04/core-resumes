/**
 * @file Schema for job notebook consultations — NotebookLM Q&A during analysis.
 *
 * Each row stores a single question-answer exchange with NotebookLM
 * during the deep analysis of a job posting. Questions are generated
 * by AI from the job requirements, and answers ground the analysis
 * in verified career evidence.
 */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { jobSnapshots } from "./job-snapshots";

export const JOB_NOTEBOOK_CONSULTATIONS_TABLE_DESCRIPTION =
  "NotebookLM question-answer exchanges generated during job analysis. Each row captures a targeted career-evidence query and the knowledge base response.";

export const JOB_NOTEBOOK_CONSULTATIONS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  snapshot_id: "Foreign key to the parent job_snapshots row.",
  question: "AI-generated question targeting a specific job requirement.",
  answer: "NotebookLM response with cited career evidence.",
  references_json: "JSON array of source references from NotebookLM.",
  turn_number: "Sequence number of this Q&A within the consultation session.",
  conversation_id: "NotebookLM conversation ID for correlation.",
  created_at: "Unix timestamp (seconds) of when this Q&A was recorded.",
};

export const jobNotebookConsultations = sqliteTable(
  "job_notebook_consultations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => jobSnapshots.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    answer: text("answer"),
    referencesJson: text("references_json", { mode: "json" }).$type<string[]>(),
    turnNumber: integer("turn_number").notNull().default(1),
    conversationId: text("conversation_id"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    snapshotIdx: index("notebook_consultations_snapshot_id_idx").on(table.snapshotId),
  }),
);

export const insertJobNotebookConsultationSchema = createInsertSchema(jobNotebookConsultations);
export const selectJobNotebookConsultationSchema = createSelectSchema(jobNotebookConsultations);
export type JobNotebookConsultation = typeof jobNotebookConsultations.$inferSelect;
export type NewJobNotebookConsultation = typeof jobNotebookConsultations.$inferInsert;
