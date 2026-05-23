import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { roles } from "./roles";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `role_status_log` table for the documentation UI. */
export const ROLE_STATUS_LOG_TABLE_DESCRIPTION =
  "Audit ledger recording every status transition for a role. Provides a complete history of how a role moved through the application lifecycle, including who or what triggered the change, optional rich-text notes, and metadata context.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const ROLE_STATUS_LOG_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key for each log entry.",
  role_id: "FK to roles.id — the role whose status changed.",
  previous_status: "The status before this transition. Null for the initial status assignment.",
  new_status: "The status after this transition.",
  trigger: "What caused the transition: 'user' (manual dropdown), 'agent' (orchestrator action), 'email_inference' (AI email classification), or 'system' (automated pipeline).",
  notes: "Optional rich-text notes (TipTap HTML) provided during the transition. Used for interview notes, offer details, withdrawal reasons, etc.",
  metadata: "JSON blob for extra context: email ID, task ID, confidence score, or other structured data related to the transition.",
  created_at: "Unix timestamp (seconds) of when this transition occurred.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const roleStatusLog = sqliteTable(
  "role_status_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    previousStatus: text("previous_status"),
    newStatus: text("new_status").notNull(),
    trigger: text("trigger", {
      enum: ["user", "agent", "email_inference", "system"],
    })
      .notNull()
      .default("user"),
    notes: text("notes"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    roleIdx: index("role_status_log_role_idx").on(table.roleId),
    statusIdx: index("role_status_log_status_idx").on(table.newStatus),
    createdIdx: index("role_status_log_created_idx").on(table.createdAt),
  }),
);

export const insertRoleStatusLogSchema = createInsertSchema(roleStatusLog);
export const selectRoleStatusLogSchema = createSelectSchema(roleStatusLog);
export type RoleStatusLogRow = typeof roleStatusLog.$inferSelect;
export type NewRoleStatusLog = typeof roleStatusLog.$inferInsert;
