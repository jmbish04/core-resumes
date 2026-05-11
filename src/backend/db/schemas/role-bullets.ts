import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { roles } from "./roles";

// ---------------------------------------------------------------------------
// Bullet type enum — matches JobPosting extraction field names
// ---------------------------------------------------------------------------

export const ROLE_BULLET_TYPES = [
  "REQUIRED_QUALIFICATION",
  "PREFERRED_QUALIFICATION",
  "KEY_RESPONSIBILITY",
  "EDUCATION_REQUIREMENT",
  "REQUIRED_SKILL",
  "PREFERRED_SKILL",
  "BENEFIT",
] as const;

export type RoleBulletType = (typeof ROLE_BULLET_TYPES)[number];

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `role_bullets` table for the documentation UI. */
export const ROLE_BULLETS_TABLE_DESCRIPTION =
  "Individual bullet items extracted from a job posting, organized by type (required qualification, preferred qualification, key responsibility, etc.). " +
  "Content is user-editable via CRUD on the intake form. AI scoring lives in the separate role_bullet_analyses table.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const ROLE_BULLETS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  role_id: "Foreign key to the parent role. Cascades on delete.",
  type: "Bullet category enum: REQUIRED_QUALIFICATION, PREFERRED_QUALIFICATION, KEY_RESPONSIBILITY, EDUCATION_REQUIREMENT, REQUIRED_SKILL, PREFERRED_SKILL, BENEFIT.",
  content: "The bullet text — extracted from the posting or manually entered by the user.",
  sort_order: "Display ordering within the type group. Lower values appear first.",
  created_at: "Row creation timestamp.",
  updated_at: "Last modification timestamp.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const roleBullets = sqliteTable(
  "role_bullets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ROLE_BULLET_TYPES,
    }).notNull(),
    content: text("content").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    roleIdx: index("role_bullets_role_id_idx").on(table.roleId),
    typeIdx: index("role_bullets_type_idx").on(table.type),
  }),
);

// ── Zod schemas & TypeScript types ────────────────────────────────────────

export const insertRoleBulletSchema = createInsertSchema(roleBullets);
export const selectRoleBulletSchema = createSelectSchema(roleBullets);
export type RoleBullet = typeof roleBullets.$inferSelect;
export type NewRoleBullet = typeof roleBullets.$inferInsert;
