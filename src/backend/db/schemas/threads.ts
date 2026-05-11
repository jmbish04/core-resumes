import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { roles } from "./roles";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `threads` table for the documentation UI. */
export const THREADS_TABLE_DESCRIPTION =
  "Conversation threads between the user and Colby, optionally scoped to a specific role for contextual assistance.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const THREADS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated at creation.",
  title: "Thread title. 'Global' for the default thread, or a role-derived label.",
  role_id:
    "Optional foreign key to scope the thread to a specific role. Null for global threads. Cascades on delete.",
  created_at: "Unix timestamp (seconds) of when the thread was created.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const threads = sqliteTable("threads", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  roleId: text("role_id").references(() => roles.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertThreadSchema = createInsertSchema(threads);
export const selectThreadSchema = createSelectSchema(threads);
export type Thread = typeof threads.$inferSelect;
export type NewThread = typeof threads.$inferInsert;
