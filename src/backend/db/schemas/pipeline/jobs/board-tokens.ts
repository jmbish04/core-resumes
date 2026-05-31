/**
 * @file Schema for board tokens — Greenhouse company board identifiers.
 *
 * Each token corresponds to a company's public Greenhouse job board
 * (e.g. "cloudflare" → boards-api.greenhouse.io/v1/boards/cloudflare/jobs).
 * Tokens can be toggled active/inactive to control which boards the
 * pipeline scans. Also stores company metadata used for email routing
 * and pipeline configuration.
 */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `board_tokens` table for the documentation UI. */
export const BOARD_TOKENS_TABLE_DESCRIPTION =
  "Greenhouse company board identifiers that the job scanner pipeline uses to discover postings. Each token maps to a public Greenhouse API endpoint. Also stores company metadata for email routing and pipeline configuration.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const BOARD_TOKENS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  token: "Greenhouse board slug (e.g. 'cloudflare', 'vercel'). Unique across all rows.",
  company_name:
    "Display name of the company (e.g. 'Cloudflare'). Used in pipeline dashboards and reports.",
  company_url:
    "Company website URL (e.g. 'https://cloudflare.com'). Used for branding and context.",
  email_domain:
    "Company email domain (e.g. 'cloudflare.com'). Used to route incoming emails to matching roles.",
  is_active:
    "Whether the scanner should include this board in pipeline runs. 1 = active, 0 = disabled.",
  created_at: "Unix timestamp (seconds) of when the token was registered.",
  updated_at: "Unix timestamp (seconds) of the last modification.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const boardTokens = sqliteTable(
  "board_tokens",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    token: text("token").notNull().unique(),
    companyName: text("company_name"),
    companyUrl: text("company_url"),
    emailDomain: text("email_domain"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    activeIdx: index("board_tokens_is_active_idx").on(table.isActive),
    emailDomainIdx: index("board_tokens_email_domain_idx").on(table.emailDomain),
  }),
);

export const insertBoardTokenSchema = createInsertSchema(boardTokens);
export const selectBoardTokenSchema = createSelectSchema(boardTokens);
export type BoardToken = typeof boardTokens.$inferSelect;
export type NewBoardToken = typeof boardTokens.$inferInsert;
