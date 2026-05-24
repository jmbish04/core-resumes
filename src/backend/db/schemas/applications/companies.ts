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

export const insertCompanySchema = createInsertSchema(companies);
export const selectCompanySchema = createSelectSchema(companies);
export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
