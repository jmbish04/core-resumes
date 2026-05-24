/**
 * @file Schema for board template analyses — per-company CSS and structural patterns.
 *
 * When the AI first encounters a new company's Greenhouse board, it can
 * analyze the posting template and store structural selectors and salary
 * markers to improve subsequent parsing accuracy.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `board_template_analyses` table for the documentation UI. */
export const BOARD_TEMPLATE_ANALYSES_TABLE_DESCRIPTION =
  "AI-generated structural analysis of a company's Greenhouse posting template. Stores CSS selectors, salary markers, and notes to improve future parsing for that company.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const BOARD_TEMPLATE_ANALYSES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  company: "Company name or board token this template analysis applies to.",
  css_selectors: "JSON object mapping section names to CSS selectors for content extraction.",
  salary_markers: "JSON array of regex patterns or text markers indicating salary sections.",
  structural_notes:
    "Free-text AI notes about the template structure, edge cases, and boilerplate patterns.",
  created_at: "Unix timestamp (seconds) of when the analysis was recorded.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const boardTemplateAnalyses = sqliteTable("board_template_analyses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  company: text("company").notNull(),
  cssSelectors: text("css_selectors", { mode: "json" }).$type<Record<string, string>>(),
  salaryMarkers: text("salary_markers", { mode: "json" }).$type<string[]>(),
  structuralNotes: text("structural_notes"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertBoardTemplateAnalysisSchema = createInsertSchema(boardTemplateAnalyses);
export const selectBoardTemplateAnalysisSchema = createSelectSchema(boardTemplateAnalyses);
export type BoardTemplateAnalysis = typeof boardTemplateAnalyses.$inferSelect;
export type NewBoardTemplateAnalysis = typeof boardTemplateAnalyses.$inferInsert;
