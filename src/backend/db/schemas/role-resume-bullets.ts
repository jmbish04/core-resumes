// src/backend/db/schemas/role-resume-bullets.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { roles } from './roles';

export const roleResumeBullets = sqliteTable('role_resume_bullets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roleId: text('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  potentialResumeBullet: text('potential_resume_bullet').notNull(),
  source: text('source', { enum: ['resume_bullets', 'role_resume_bullets', 'agent_generated'] }).notNull(),
  aiRationale: text('ai_rationale').notNull(),
  interviewTip: text('interview_tip'),
  category: text('category').notNull(),
  impact: text('impact'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()).notNull(),
});
