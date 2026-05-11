import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `statuses` table for the documentation UI. */
export const STATUSES_TABLE_DESCRIPTION =
  "Relational status definition table. Each row defines an application lifecycle status with its display metadata, grouping, sort order, and whether a status transition prompt should request notes from the user.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const STATUSES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Unique slug identifier for the status (e.g. 'preparing', 'negotiating'). Used as FK value in roles.status.",
  name: "Human-readable display label for the status.",
  description: "Full definition of what this status means in the application lifecycle.",
  group: "Classification group: 'active' (in-progress), 'terminal' (final state), or 'system' (internal-only, hidden from UI).",
  sort_order: "Integer used to order statuses in the stepper and dropdown. Lower numbers appear first.",
  is_active: "Whether this status is visible in the frontend dropdown and stepper. System statuses like processing_error are set to false.",
  requires_notes_prompt: "When true, transitioning to this status opens a TipTap rich-text notes modal in the frontend.",
  created_at: "Unix timestamp (seconds) of when this status definition was created.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const statuses = sqliteTable("statuses", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  group: text("group", {
    enum: ["active", "terminal", "system"],
  })
    .notNull()
    .default("active"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  requiresNotesPrompt: integer("requires_notes_prompt", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const insertStatusSchema = createInsertSchema(statuses);
export const selectStatusSchema = createSelectSchema(statuses);
export type StatusRow = typeof statuses.$inferSelect;
export type NewStatus = typeof statuses.$inferInsert;
