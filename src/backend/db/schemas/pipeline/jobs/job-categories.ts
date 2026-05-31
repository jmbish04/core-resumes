/**
 * @file Schema for job categories — AI-assigned taxonomy of job types.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const JOB_CATEGORIES_TABLE_DESCRIPTION =
  "Taxonomy of job categories (e.g. Engineering, Sales, Legal Ops). Seeded initially, grows dynamically as AI discovers new ones.";

export const JOB_CATEGORIES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  name: "Category name, unique across all categories.",
  description: "Human-readable description of the category.",
  is_active: "Whether this category is active in prompts and filters. 1 = active.",
  created_at: "Unix timestamp (seconds) of creation.",
};

export const jobCategories = sqliteTable("job_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertJobCategorySchema = createInsertSchema(jobCategories);
export const selectJobCategorySchema = createSelectSchema(jobCategories);
export type JobCategory = typeof jobCategories.$inferSelect;
export type NewJobCategory = typeof jobCategories.$inferInsert;
