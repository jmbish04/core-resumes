import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { roles } from "./roles";
import { threads } from "./threads";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `messages` table for the documentation UI. */
export const MESSAGES_TABLE_DESCRIPTION =
  "Individual messages within threads. Authors can be user, agent (Colby), or system. Supports metadata for linking to emails.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const MESSAGES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated at creation.",
  thread_id: "Foreign key to the parent thread. Cascades on delete.",
  role_id:
    "Optional foreign key to associate the message with a specific role. Cascades on delete.",
  author: "Message author. One of: user, agent, system.",
  content: "The message body text (plain text or markdown).",
  parts:
    "JSON array of UIMessage parts for rich content rendering (text, reasoning, tool calls, sources). Used by assistant-ui.",
  format:
    "Serialization format identifier for the parts column. Currently 'ai-sdk/v6'. Null for legacy plain-text messages.",
  metadata: "Flexible JSON blob for linking to related entities (e.g., email_id, task_id).",
  timestamp: "Unix timestamp (seconds) of when the message was created.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    roleId: text("role_id").references(() => roles.id, { onDelete: "cascade" }),
    author: text("author", { enum: ["user", "agent", "system"] }).notNull(),
    content: text("content").notNull(),
    parts: text("parts", { mode: "json" }).$type<unknown[]>(),
    format: text("format"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    timestamp: integer("timestamp", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    threadIdx: index("messages_thread_id_idx").on(table.threadId),
  }),
);

export const insertMessageSchema = createInsertSchema(messages);
export const selectMessageSchema = createSelectSchema(messages);
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
