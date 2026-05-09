import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { roles } from "./roles";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `role_logs` table for the documentation UI. */
export const ROLE_LOGS_TABLE_DESCRIPTION =
  "Granular activity log for all events related to a role: agentic actions, user interactions, email processing, document generation, NotebookLM operations, and system events. Each entry is categorized and tagged for frontend filtering and timeline display.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const ROLE_LOGS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key for each log entry.",
  role_id: "Optional FK to roles.id. Null for global events not scoped to a specific role.",
  category: "Event category for grouping and badge coloring: agentic, user_action, email, notebooklm, document, system.",
  action: "Machine-readable action identifier (e.g. 'resume_generated', 'email_received', 'interview_scheduled').",
  message: "Human-readable log message displayed in the frontend timeline.",
  metadata: "JSON blob for structured context: task IDs, document IDs, email subjects, confidence scores, etc.",
  created_at: "Unix timestamp (seconds) of when this event occurred.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const roleLogs = sqliteTable(
  "role_logs",
  {
    id: text("id").primaryKey(),
    roleId: text("role_id").references(() => roles.id, { onDelete: "cascade" }),
    category: text("category", {
      enum: ["agentic", "user_action", "email", "notebooklm", "document", "system"],
    }).notNull(),
    action: text("action").notNull(),
    message: text("message").notNull(),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    roleIdx: index("role_logs_role_idx").on(table.roleId),
    categoryIdx: index("role_logs_category_idx").on(table.category),
    createdIdx: index("role_logs_created_idx").on(table.createdAt),
  }),
);

export const insertRoleLogSchema = createInsertSchema(roleLogs);
export const selectRoleLogSchema = createSelectSchema(roleLogs);
export type RoleLogRow = typeof roleLogs.$inferSelect;
export type NewRoleLog = typeof roleLogs.$inferInsert;
