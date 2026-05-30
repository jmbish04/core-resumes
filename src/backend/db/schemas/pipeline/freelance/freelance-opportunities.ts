/**
 * @file Schema for freelance opportunities — scraped listings from Upwork & Freelancer.
 *
 * Each row represents a unique freelance gig identified by its platform-specific
 * job/project ID. Contains client metadata, budget info, and deduplication hashing.
 */

import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `freelance_opportunities` table for the documentation UI. */
export const FREELANCE_OPPORTUNITIES_TABLE_DESCRIPTION =
  "Freelance job listings scraped from Upwork and Freelancer. Each row is a unique opportunity identified by its platform_job_id. Contains budget, client reputation, and lifecycle metadata.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const FREELANCE_OPPORTUNITIES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  platform: "Source platform — 'upwork' or 'freelancer'.",
  platform_job_id: "Unique job/project ID from the source platform. Globally unique.",
  url: "Direct URL to the listing for applying or bidding.",
  title: "Job title as listed on the platform.",
  description: "Full job description text.",
  skills_json: "JSON array of skill tags required for this listing.",
  budget_type: "Budget structure — 'fixed' or 'hourly'.",
  budget_min: "Minimum budget amount (in budget_currency).",
  budget_max: "Maximum budget amount (in budget_currency).",
  budget_currency: "ISO 4217 currency code for the budget. Defaults to USD.",
  experience_level: "Required experience level (e.g. 'Entry', 'Intermediate', 'Expert').",
  project_length: "Expected project duration (e.g. '1-3 months').",
  hours_per_week: "Expected weekly hours commitment (e.g. '10-30').",
  client_location: "Client's self-reported location string.",
  client_country_code: "ISO 3166-1 alpha-2 country code for the client.",
  client_spent: "Total amount the client has spent on the platform (string, platform-formatted).",
  client_score: "Client's feedback rating, 0.0–5.0 scale.",
  client_hires: "Total number of hires the client has made on the platform.",
  client_feedback_count: "Number of feedback reviews left for the client.",
  client_member_since: "Date string for when the client joined the platform.",
  client_verified: "Whether the client's payment method is verified. 1 = yes.",
  proposals_count: "Number of proposals/bids already submitted (platform-formatted string).",
  is_premium: "Whether this is a premium/featured listing. 1 = yes.",
  is_urgent: "Whether the listing is marked urgent (Freelancer only). 1 = yes.",
  is_nda: "Whether the listing requires an NDA (Freelancer only). 1 = yes.",
  category_name: "Platform-specific category or subcategory name.",
  bid_avg: "Average bid amount (Freelancer only).",
  bid_deadline: "Unix timestamp of the bidding deadline (Freelancer only).",
  published_at: "Unix timestamp of when the listing was originally published on the platform.",
  first_seen_at: "Unix timestamp of when the scanner first discovered this listing.",
  last_seen_at: "Unix timestamp of the most recent scan that confirmed the listing is still live.",
  is_active: "Whether the listing is considered active. 0 = delisted or expired.",
  content_hash: "SHA-256 hash of the listing content for change detection.",
  raw_api_response: "Full JSON payload from the platform API for debugging and reprocessing.",
  created_at: "Unix timestamp of when this row was created.",
  updated_at: "Unix timestamp of the last update to this row.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const freelanceOpportunities = sqliteTable(
  "freelance_opportunities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    platform: text("platform", { enum: ["upwork", "freelancer"] }).notNull(),
    platformJobId: text("platform_job_id").notNull().unique(),
    url: text("url").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    skillsJson: text("skills_json", { mode: "json" }).$type<string[]>(),
    budgetType: text("budget_type", { enum: ["fixed", "hourly"] }),
    budgetMin: real("budget_min"),
    budgetMax: real("budget_max"),
    budgetCurrency: text("budget_currency").default("USD"),
    experienceLevel: text("experience_level"),
    projectLength: text("project_length"),
    hoursPerWeek: text("hours_per_week"),
    clientLocation: text("client_location"),
    clientCountryCode: text("client_country_code"),
    clientSpent: text("client_spent"),
    clientScore: real("client_score"),
    clientHires: integer("client_hires"),
    clientFeedbackCount: integer("client_feedback_count"),
    clientMemberSince: text("client_member_since"),
    clientVerified: integer("client_verified", { mode: "boolean" }).default(false),
    proposalsCount: text("proposals_count"),
    isPremium: integer("is_premium", { mode: "boolean" }).default(false),
    isUrgent: integer("is_urgent", { mode: "boolean" }).default(false),
    isNda: integer("is_nda", { mode: "boolean" }).default(false),
    categoryName: text("category_name"),
    bidAvg: real("bid_avg"),
    bidDeadline: integer("bid_deadline", { mode: "timestamp" }),
    publishedAt: integer("published_at", { mode: "timestamp" }).notNull(),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    contentHash: text("content_hash"),
    rawApiResponse: text("raw_api_response", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    platformActiveIdx: index("freelance_opportunities_platform_active_idx").on(
      table.platform,
      table.isActive,
    ),
    publishedAtIdx: index("freelance_opportunities_published_at_idx").on(table.publishedAt),
    contentHashIdx: index("freelance_opportunities_content_hash_idx").on(table.contentHash),
    isActiveIdx: index("freelance_opportunities_is_active_idx").on(table.isActive),
  }),
);

export const insertFreelanceOpportunitySchema = createInsertSchema(freelanceOpportunities);
export const selectFreelanceOpportunitySchema = createSelectSchema(freelanceOpportunities);
export type FreelanceOpportunity = typeof freelanceOpportunities.$inferSelect;
export type NewFreelanceOpportunity = typeof freelanceOpportunities.$inferInsert;
