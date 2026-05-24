import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { roles } from "../applications/roles";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `mock_interviews` table for the documentation UI. */
export const MOCK_INTERVIEWS_TABLE_DESCRIPTION =
  "AI-generated mock interview transcripts for a role. Each record contains a full Q&A sequence tailored to the specific job description, with interviewer questions, candidate answers leveraging career metrics, and strategic coaching insights.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const MOCK_INTERVIEWS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated at creation.",
  role_id: "Foreign key to the role this interview targets. Cascades on delete.",
  analysis_id:
    "Optional reference to the role_analyses record that informed this interview's strategy.",
  version: "Revision number within a role (1 = first generation, 2 = second, etc.).",
  qa_pairs:
    "JSON array of question/answer/insight objects. Each entry has: interviewer (question text), candidate (answer text), and insight (coaching note explaining why this answer works).",
  generated_at: "Unix timestamp (seconds) of when this interview was generated.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const mockInterviews = sqliteTable(
  "mock_interviews",
  {
    id: text("id").primaryKey(),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    analysisId: text("analysis_id"),
    version: integer("version").notNull().default(1),
    qaPairs: text("qa_pairs", { mode: "json" }).notNull(),
    generatedAt: integer("generated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    roleIdx: index("mock_interviews_role_id_idx").on(table.roleId),
  }),
);

export const insertMockInterviewSchema = createInsertSchema(mockInterviews);
export const selectMockInterviewSchema = createSelectSchema(mockInterviews);
export type MockInterview = typeof mockInterviews.$inferSelect;
export type NewMockInterview = typeof mockInterviews.$inferInsert;
