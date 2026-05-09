import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { roles } from "./roles";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `career_memory` table for the documentation UI. */
export const CAREER_MEMORY_TABLE_DESCRIPTION =
  "Persistent semantic memory of all NotebookLM interactions, agent consultations, and user-provided career facts. Each row is paired with a Vectorize vector (same UUID) for semantic recall. Supports soft-delete and revision tracking.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const CAREER_MEMORY_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key — the SAME UUID used as the Vectorize vector ID.",
  query: "The question or prompt that was sent (to NotebookLM, agent, or user input).",
  answer: "The response received (from NotebookLM, agent reasoning, or user input).",
  source: "Origin of this memory: notebooklm, user_input, draft_review, comment_response.",
  agent: "Which agent created this memory: orchestrator, notebooklm, manual.",
  category:
    "Functional category for grouping: career_fact, role_analysis, resume_draft, cover_letter, interview_prep, comment_feedback, general.",
  role_id: "Optional FK to roles.id — links this memory to a specific job role.",
  references: "JSON array of NotebookLM source citations (if applicable).",
  metadata: "JSON blob for tags, confidence score, follow-up status, and other context.",
  is_active: "1 = active, 0 = soft-deleted. Soft-deleted entries are removed from Vectorize.",
  replaced_by_id: "FK to career_memory.id — points to the revised version of this memory.",
  created_at: "ISO 8601 timestamp of when this memory was created.",
  deleted_at: "ISO 8601 timestamp of when this memory was soft-deleted (null if active).",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const careerMemory = sqliteTable(
  "career_memory",
  {
    id: text("id").primaryKey(),
    query: text("query").notNull(),
    answer: text("answer").notNull(),
    source: text("source", {
      enum: ["notebooklm", "user_input", "draft_review", "comment_response"],
    }).notNull(),
    agent: text("agent", {
      enum: ["orchestrator", "notebooklm", "manual"],
    }).notNull(),
    category: text("category", {
      enum: [
        "career_fact",
        "role_analysis",
        "resume_draft",
        "cover_letter",
        "interview_prep",
        "comment_feedback",
        "general",
      ],
    }).notNull(),
    roleId: text("role_id").references(() => roles.id, { onDelete: "set null" }),
    references: text("references", { mode: "json" }).$type<unknown[]>(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    replacedById: text("replaced_by_id"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    deletedAt: text("deleted_at"),
  },
  (table) => ({
    roleIdx: index("career_memory_role_id_idx").on(table.roleId),
    categoryIdx: index("career_memory_category_idx").on(table.category),
    activeIdx: index("career_memory_active_idx").on(table.isActive),
    sourceIdx: index("career_memory_source_idx").on(table.source),
  }),
);

export const insertCareerMemorySchema = createInsertSchema(careerMemory);
export const selectCareerMemorySchema = createSelectSchema(careerMemory);
export type CareerMemoryRow = typeof careerMemory.$inferSelect;
export type NewCareerMemory = typeof careerMemory.$inferInsert;
