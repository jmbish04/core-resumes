/**
 * @file Schema for job tags — freeform taxonomy for job attributes.
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const JOB_TAGS_TABLE_DESCRIPTION =
  "Freeform tags for tracking job attributes (e.g. Remote, AI-Heavy, Visa Sponsor). Seeded initially, grows dynamically.";

export const JOB_TAGS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  name: "Tag name, unique across all tags.",
  description: "Human-readable description of the tag.",
  is_active: "Whether this tag is active in prompts and filters.",
  created_at: "Unix timestamp (seconds) of creation.",
};

export const jobTags = sqliteTable("job_tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertJobTagSchema = createInsertSchema(jobTags);
export const selectJobTagSchema = createSelectSchema(jobTags);
export type JobTag = typeof jobTags.$inferSelect;
export type NewJobTag = typeof jobTags.$inferInsert;
