import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const SALARY_FINDINGS_TABLE_DESCRIPTION =
  "Durable storage for salary benchmark battery outputs and agent aggregate findings.";

export const SALARY_FINDINGS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  role_id: "Optional role ID for single-role findings.",
  mode: "Agent operational mode: 'A' (single-role), 'B' (aggregate), 'C' (chat).",
  finding: "Structured JSON payload of the finding/insight.",
  created_at: "ISO-8601 timestamp of when the finding was generated.",
};

export const salaryFindings = sqliteTable(
  "salary_findings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roleId: text("role_id"),
    mode: text("mode").notNull(),
    finding: text("finding", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => ({
    roleIdIdx: index("salary_findings_role_id_idx").on(table.roleId),
    modeIdx: index("salary_findings_mode_idx").on(table.mode),
  })
);

export const insertSalaryFindingSchema = createInsertSchema(salaryFindings);
export const selectSalaryFindingSchema = createSelectSchema(salaryFindings);
export type SalaryFinding = typeof salaryFindings.$inferSelect;
export type NewSalaryFinding = typeof salaryFindings.$inferInsert;
