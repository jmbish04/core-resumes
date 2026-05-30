/**
 * @file Schema for saved job list items — links between lists and snapshots.
 *
 * Each item links a job snapshot to a list with an optional position
 * for ordering.
 */

import { index, integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { jobSavedLists } from "./job-saved-lists";
import { jobSnapshots } from "./job-snapshots";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

export const JOB_SAVED_LIST_ITEMS_TABLE_DESCRIPTION =
  "Items within a saved job list. Each item links a job snapshot to a list with an optional position for ordering.";

export const JOB_SAVED_LIST_ITEMS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  list_id: "Foreign key to the parent job_saved_lists row.",
  snapshot_id: "Foreign key to the job_snapshots row.",
  position: "Sort order within the list (lower = higher priority).",
  added_at: "Unix timestamp (seconds) of when the item was added to the list.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const jobSavedListItems = sqliteTable(
  "job_saved_list_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listId: integer("list_id")
      .notNull()
      .references(() => jobSavedLists.id, { onDelete: "cascade" }),
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => jobSnapshots.id, { onDelete: "cascade" }),
    position: integer("position").default(0),
    addedAt: integer("added_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    listIdx: index("saved_list_items_list_id_idx").on(table.listId),
    snapshotIdx: index("saved_list_items_snapshot_id_idx").on(table.snapshotId),
  }),
);

export const insertJobSavedListItemSchema = createInsertSchema(jobSavedListItems);
export const selectJobSavedListItemSchema = createSelectSchema(jobSavedListItems);
export type JobSavedListItem = typeof jobSavedListItems.$inferSelect;
export type NewJobSavedListItem = typeof jobSavedListItems.$inferInsert;
