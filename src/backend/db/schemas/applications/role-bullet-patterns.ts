// src/backend/db/schemas/role-bullet-patterns.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

import { roleBullets } from "./role-bullets";
import { roles } from "./roles";

export const roleBulletPatterns = sqliteTable("role_bullet_patterns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roleId: text("role_id")
    .notNull()
    .references(() => roles.id, { onDelete: "cascade" }),
  observation: text("observation").notNull(),
  recommendation: text("recommendation").notNull(),
  insight: text("insight").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

export const roleBulletPatternMap = sqliteTable("role_bullet_pattern_map", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  patternId: integer("pattern_id")
    .notNull()
    .references(() => roleBulletPatterns.id, { onDelete: "cascade" }),
  roleBulletId: integer("role_bullet_id")
    .notNull()
    .references(() => roleBullets.id, { onDelete: "cascade" }),
});
