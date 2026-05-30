/**
 * @file Schema for saved job lists — user-created collections of job snapshots.
 *
 * Lists enable organizing jobs into named groups (e.g., "Top Picks",
 * "Applied", "Following Up").
 */

import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

export const JOB_SAVED_LISTS_TABLE_DESCRIPTION =
  "User-defined job list containers (e.g. 'Top Picks', 'Applied'). Jobs are linked via job_saved_list_items.";

export const JOB_SAVED_LISTS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  name: "List name, unique across all lists.",
  description: "Optional description of the list's purpose.",
  created_at: "Unix timestamp (seconds) of creation.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const jobSavedLists = sqliteTable("job_saved_lists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  description: text("description"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertJobSavedListSchema = createInsertSchema(jobSavedLists);
export const selectJobSavedListSchema = createSelectSchema(jobSavedLists);
export type JobSavedList = typeof jobSavedLists.$inferSelect;
export type NewJobSavedList = typeof jobSavedLists.$inferInsert;
