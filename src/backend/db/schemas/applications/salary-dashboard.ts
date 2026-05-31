import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `salary_dashboard_views` table for the documentation UI. */
export const SALARY_DASHBOARD_VIEWS_TABLE_DESCRIPTION =
  "Stores named saved-view presets for the Salary Intelligence Dashboard, including serialized filter states.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const SALARY_DASHBOARD_VIEWS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Autoincrementing primary key.",
  name: "User-defined view label displayed in the dropdown (e.g. 'SF Senior Engineers').",
  filters: "JSON-serialized filter state: roleTypes, metricKeys, seniority, companies, dateRange.",
  is_default: "Whether this view auto-loads on page open (0 = false, 1 = true). Only one view should be default.",
  created_at: "Timestamp when this view was created.",
  updated_at: "Timestamp when this view was last updated.",
};

/** Human-readable description of the `salary_pinned_roles` table for the documentation UI. */
export const SALARY_PINNED_ROLES_TABLE_DESCRIPTION =
  "Stores roles the user has pinned for cross-comparison on the Salary Intelligence Dashboard.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const SALARY_PINNED_ROLES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Autoincrementing primary key.",
  role_id: "Foreign key referencing the roles.id being pinned.",
  role_title: "Cached job title from the role for display without a join.",
  company_name: "Cached company name from the role for display without a join.",
  salary_min: "Cached salary minimum from the role.",
  salary_max: "Cached salary maximum from the role.",
  pinned_at: "Timestamp when the role was pinned.",
};

// ---------------------------------------------------------------------------
// Table definitions
// ---------------------------------------------------------------------------

export const salaryDashboardViews = sqliteTable("salary_dashboard_views", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  filters: text("filters", { mode: "json" })
    .notNull()
    .$type<{
      roleTypes?: string[];
      metricKeys?: string[];
      seniority?: string[];
      companies?: string[];
      dateRange?: { from?: string; to?: string };
    }>(),
  isDefault: integer("is_default").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const salaryPinnedRoles = sqliteTable(
  "salary_pinned_roles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roleId: text("role_id").notNull(),
    roleTitle: text("role_title").notNull(),
    companyName: text("company_name").notNull(),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    pinnedAt: integer("pinned_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    roleIdx: index("salary_pinned_roles_role_idx").on(table.roleId),
  }),
);

// ---------------------------------------------------------------------------
// Schemas and Types
// ---------------------------------------------------------------------------

export const insertSalaryDashboardViewSchema = createInsertSchema(salaryDashboardViews);
export const selectSalaryDashboardViewSchema = createSelectSchema(salaryDashboardViews);
export type SalaryDashboardView = typeof salaryDashboardViews.$inferSelect;
export type NewSalaryDashboardView = typeof salaryDashboardViews.$inferInsert;

export const insertSalaryPinnedRoleSchema = createInsertSchema(salaryPinnedRoles);
export const selectSalaryPinnedRoleSchema = createSelectSchema(salaryPinnedRoles);
export type SalaryPinnedRole = typeof salaryPinnedRoles.$inferSelect;
export type NewSalaryPinnedRole = typeof salaryPinnedRoles.$inferInsert;
