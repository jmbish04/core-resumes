import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const SALARY_AGENT_QUERIES_TABLE_DESCRIPTION =
  "Audit log of all SQL queries executed by the SalaryAgent's SQL tool.";

export const SALARY_AGENT_QUERIES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  role_id: "Optional role ID associated with the query execution context.",
  mode: "Agent mode during execution (e.g. 'A', 'B', 'C').",
  sql: "The raw SQL query string executed.",
  rows_returned: "Number of rows returned (capped at RETURN_ROW_LIMIT).",
  duration_ms: "Execution duration in milliseconds.",
  created_at: "ISO-8601 timestamp of query execution.",
};

export const salaryAgentQueries = sqliteTable(
  "salary_agent_queries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roleId: text("role_id"),
    mode: text("mode").notNull(),
    sql: text("sql").notNull(),
    rowsReturned: integer("rows_returned").notNull(),
    durationMs: integer("duration_ms").notNull(),
    createdAt: text("created_at").notNull(),
  }
);

export const insertSalaryAgentQuerySchema = createInsertSchema(salaryAgentQueries);
export const selectSalaryAgentQuerySchema = createSelectSchema(salaryAgentQueries);
export type SalaryAgentQuery = typeof salaryAgentQueries.$inferSelect;
export type NewSalaryAgentQuery = typeof salaryAgentQueries.$inferInsert;
