// src/backend/db/schemas/role-resume-bullets-map.ts
import { sqliteTable, integer, unique } from 'drizzle-orm/sqlite-core';
import { roleResumeBullets } from './role-resume-bullets';
// Assuming roleBullets exists, imported from its schema
import { roleBullets } from './role-bullets'; 

export const roleResumeBulletsMap = sqliteTable('role_resume_bullets_map', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  resumeBulletId: integer('resume_bullet_id').notNull().references(() => roleResumeBullets.id, { onDelete: 'cascade' }),
  roleBulletId: integer('role_bullet_id').notNull().references(() => roleBullets.id, { onDelete: 'cascade' }),
}, (table) => ({
  unq: unique().on(table.resumeBulletId, table.roleBulletId)
}));
