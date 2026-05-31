/**
 * @file Schema for job postings — the parent entity for Greenhouse-scraped jobs.
 *
 * Each row represents a unique job discovered on a Greenhouse board.
 * A job can have multiple snapshots (re-analyses over time) but the
 * job_site_id is always unique within the system.
 */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `jobs_postings` table for the documentation UI. */
export const JOBS_POSTINGS_TABLE_DESCRIPTION =
  "Job postings discovered by the scanner pipeline (Greenhouse, Ashby, Lever, etc.). Each row is a unique job identified by its ATS job_site_id. Contains triage results, discovery recommendation scoring, and favorite flags.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const JOBS_POSTINGS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  job_site_id: "Greenhouse's unique job ID (from the API response). Unique across all boards.",
  job_title: "Title of the job posting as scraped from Greenhouse.",
  company: "Company name (derived from the board token or posting metadata).",
  date_first_seen: "Unix timestamp (seconds) of when the scanner first discovered this posting.",
  triage_passed:
    "Whether the AI triage decided to include this job for deep analysis. 1 = passed, 0 = excluded.",
  triage_reason: "AI-generated reasoning for the triage include/exclude decision.",
  analysis_executed:
    "Whether deep analysis has been completed for at least one snapshot. 1 = yes, 0 = pending.",
  is_favorite: "Whether the user has starred this job for quick access. 1 = starred.",
  location: "Location string extracted from the job posting or ATS API (e.g. 'San Francisco, CA', 'Remote').",
  is_recommended:
    "Whether this job passed the keyword + location heuristic scoring. 1 = recommended for review, 0 = unscored/rejected.",
  recommendation_score:
    "Heuristic match score (0–100) based on title/location/description keyword matching against the applicant profile.",
  recommendation_reason:
    "Human-readable explanation of why this job was recommended (e.g. 'Title matches: Software Engineer, Location: Remote').",
  source_api_company_id:
    "Foreign key to api_companies.id linking this job back to its discovery source company.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const jobsPostings = sqliteTable(
  "jobs_postings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobSiteId: text("job_site_id").notNull().unique(),
    jobTitle: text("job_title").notNull(),
    company: text("company").notNull(),
    dateFirstSeen: integer("date_first_seen", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    triagePassed: integer("triage_passed", { mode: "boolean" }).default(false),
    triageReason: text("triage_reason"),
    analysisExecuted: integer("analysis_executed", { mode: "boolean" }).default(false),
    isFavorite: integer("is_favorite", { mode: "boolean" }).default(false),
    location: text("location"),
    isRecommended: integer("is_recommended", { mode: "boolean" }).default(false),
    recommendationScore: integer("recommendation_score"),
    recommendationReason: text("recommendation_reason"),
    sourceApiCompanyId: integer("source_api_company_id"),
  },
  (table) => ({
    companyIdx: index("jobs_postings_company_idx").on(table.company),
    triageIdx: index("jobs_postings_triage_passed_idx").on(table.triagePassed),
    favoriteIdx: index("jobs_postings_is_favorite_idx").on(table.isFavorite),
    recommendedIdx: index("jobs_postings_is_recommended_idx").on(table.isRecommended),
  }),
);

export const insertJobPostingSchema = createInsertSchema(jobsPostings);
export const selectJobPostingSchema = createSelectSchema(jobsPostings);
export type JobPosting = typeof jobsPostings.$inferSelect;
export type NewJobPosting = typeof jobsPostings.$inferInsert;
