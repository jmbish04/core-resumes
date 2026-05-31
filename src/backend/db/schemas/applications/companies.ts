import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `companies` table for the documentation UI. */
export const COMPANIES_TABLE_DESCRIPTION =
  "Stores company metadata, brand colors, and Greenhouse board tokens for document generation and brand-aware resume/cover letter styling.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const COMPANIES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated at creation.",
  name: "Display name of the company (e.g. 'Stripe').",
  url: "Company website URL used for brand color extraction.",
  description: "Brief description of the company.",
  greenhouse_token:
    "Greenhouse Job Board token (e.g. 'stripe' from boards.greenhouse.io/stripe). Auto-populated from job scrape; editable on the company page.",
  color_primary: "Primary brand hex color used for headings, borders, and name styling.",
  color_accent: "Accent brand hex color used for role title and company name styling.",
  logo_url: "Absolute URL to the company logo image, typically hosted on Cloudflare Images.",
  attributes: "Flexible JSON blob for additional company metadata.",
  created_at: "Unix timestamp (seconds) of when the company was created.",
  updated_at: "Unix timestamp (seconds) of the last modification.",
};

export const COMPANY_JOB_BOARD_DEFS_TABLE_DESCRIPTION =
  "Global dictionary of scrape-able surfaces or ATS systems (e.g. Greenhouse, Ashby, Company Career Page).";

export const COMPANY_JOB_BOARD_DEFS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key.",
  name: "Display name of the board type (e.g. 'Greenhouse').",
  description: "Brief description of how this board is processed.",
  is_api: "1 if the board provides a structured API; 0 if it requires HTML scraping.",
  is_rss: "1 if the board provides an RSS feed.",
  is_active: "1 if the board definition is currently supported by the scanner.",
};

export const COMPANY_JOB_BOARD_MAPPING_TABLE_DESCRIPTION =
  "Links a promoted company to a specific job board definition, including its unique endpoint or token.";

export const COMPANY_JOB_BOARD_MAPPING_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key.",
  company_id: "Foreign key to the companies table.",
  board_id: "Foreign key to the company_job_board_defs table.",
  board_identifier: "The specific token (e.g. 'stripe') or URL (e.g. 'https://apple.com/careers') used to scrape this company's jobs.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const companies = sqliteTable(
  "companies",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    url: text("url"),
    description: text("description"),
    greenhouseToken: text("greenhouse_token"),
    colorPrimary: text("color_primary"),
    colorAccent: text("color_accent"),
    logoUrl: text("logo_url"),
    attributes: text("attributes", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    nameIdx: index("companies_name_idx").on(table.name),
    tokenIdx: index("companies_greenhouse_token_idx").on(table.greenhouseToken),
  }),
);

export const companyJobBoardDefs = sqliteTable("company_job_board_defs", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  isApi: integer("is_api", { mode: "boolean" }).default(false),
  isRss: integer("is_rss", { mode: "boolean" }).default(false),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
});

export const companyJobBoardMapping = sqliteTable(
  "company_job_board_mapping",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    boardId: text("board_id")
      .notNull()
      .references(() => companyJobBoardDefs.id, { onDelete: "cascade" }),
    boardIdentifier: text("board_identifier").notNull(),
  },
  (table) => ({
    companyIdx: index("company_job_board_mapping_company_idx").on(table.companyId),
    boardIdx: index("company_job_board_mapping_board_idx").on(table.boardId),
  }),
);

export const insertCompanySchema = createInsertSchema(companies);
export const selectCompanySchema = createSelectSchema(companies);
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

export const insertCompanyJobBoardDefSchema = createInsertSchema(companyJobBoardDefs);
export const selectCompanyJobBoardDefSchema = createSelectSchema(companyJobBoardDefs);
export type CompanyJobBoardDef = typeof companyJobBoardDefs.$inferSelect;
export type NewCompanyJobBoardDef = typeof companyJobBoardDefs.$inferInsert;

export const insertCompanyJobBoardMappingSchema = createInsertSchema(companyJobBoardMapping);
export const selectCompanyJobBoardMappingSchema = createSelectSchema(companyJobBoardMapping);
export type CompanyJobBoardMapping = typeof companyJobBoardMapping.$inferSelect;
export type NewCompanyJobBoardMapping = typeof companyJobBoardMapping.$inferInsert;
