/**
 * @file Schema for job snapshots — point-in-time AI analysis of a job posting.
 *
 * Each snapshot captures a full analysis: structured assessment JSON,
 * match scores, verdict, salary extraction, benefits parsing, historic
 * comparison, negotiation strategy, and R2 archive keys for markdown/PDF.
 * A job can have multiple snapshots when it is reprocessed with HITL feedback.
 */

import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

import { jobsPostings } from "./jobs-postings";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `job_snapshots` table for the documentation UI. */
export const JOB_SNAPSHOTS_TABLE_DESCRIPTION =
  "Point-in-time AI analysis snapshots for a Greenhouse job posting. Contains the full structured assessment, match scores, salary/benefits extraction, R2 archive references, and reprocess tracking.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const JOB_SNAPSHOTS_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  job_id: "Foreign key to the parent jobs_postings row.",
  snapshot_timestamp: "Unix timestamp (seconds) of when this snapshot was created.",
  vectorize_id: "UUID matching the vector ID in the greenhouse-jobs Vectorize index.",
  session_uuid: "UUID of the pipeline session run that created this snapshot.",
  raw_assessment_json: "Complete JSON blob of the AI assessment response, preserved verbatim.",
  match_score: "Overall match score (0–100) from the AI assessment.",
  match_rationale: "AI-generated reasoning behind the match score.",
  verdict: "High-level assessment verdict: High, Medium, or Low.",
  verdict_rationale: "AI-generated reasoning behind the verdict.",
  builder_alignment:
    "Score (0–100) assessing alignment with builder/0-to-1 product work preferences.",
  jd_trap_detected:
    "Whether the AI detected common JD traps (inflated requirements, bait-and-switch). 1 = trap detected.",
  job_summary: "AI-generated concise summary of the job posting.",
  extracted_salary_raw: "Verbatim salary text extracted from the job posting.",
  salary_min: "Lower bound of the annual salary range (integer, no currency symbol).",
  salary_max: "Upper bound of the annual salary range (integer, no currency symbol).",
  salary_currency: "ISO 4217 currency code for salary figures (e.g. USD, GBP).",
  extracted_benefits_raw: "Verbatim benefits text extracted from the job posting.",
  benefits_medical: "Summary of medical/health benefits.",
  benefits_equity: "Summary of equity/stock benefits.",
  benefits_retirement: "Summary of retirement (401k, pension) benefits.",
  benefits_pto: "Summary of PTO/vacation benefits.",
  benefits_bonus: "Summary of bonus structure.",
  benefits_other_json: "JSON array of other benefits not captured by specific columns.",
  historic_comparison: "AI analysis comparing this role against the candidate's career history.",
  historic_salary_analysis:
    "AI analysis comparing the salary against the candidate's historic compensation.",
  historic_benefits_analysis:
    "AI analysis comparing benefits against the candidate's historic packages.",
  negotiation_strategy: "AI-generated negotiation strategy and leverage points.",
  extracted_location: "Location string extracted from the job posting.",
  experience_level:
    "Experience level extracted from the job posting (e.g. 'Senior', 'Staff', '5+ years').",
  is_manual_reprocess:
    "Whether this snapshot was created from a manual HITL reprocess request. 1 = reprocessed.",
  reprocess_rationale: "Human rationale provided when triggering a manual reprocess.",
  archive_md_key: "R2 object key for the archived markdown rendering of the job posting.",
  archive_pdf_key: "R2 object key for the archived PDF rendering of the job posting.",
  archive_html_key: "R2 object key for the archived raw HTML of the job posting.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const jobSnapshots = sqliteTable(
  "job_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    jobId: integer("job_id")
      .notNull()
      .references(() => jobsPostings.id, { onDelete: "cascade" }),
    snapshotTimestamp: integer("snapshot_timestamp", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    vectorizeId: text("vectorize_id"),
    sessionUuid: text("session_uuid"),

    // Full AI response blob
    rawAssessmentJson: text("raw_assessment_json"),

    // Fielded assessment columns
    matchScore: integer("match_score"),
    matchRationale: text("match_rationale"),
    verdict: text("verdict", { enum: ["High", "Medium", "Low"] }),
    verdictRationale: text("verdict_rationale"),
    builderAlignment: integer("builder_alignment"),
    jdTrapDetected: integer("jd_trap_detected", { mode: "boolean" }).default(false),
    jobSummary: text("job_summary"),

    // Salary (structured)
    extractedSalaryRaw: text("extracted_salary_raw"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: text("salary_currency"),

    // Benefits (fielded)
    extractedBenefitsRaw: text("extracted_benefits_raw"),
    benefitsMedical: text("benefits_medical"),
    benefitsEquity: text("benefits_equity"),
    benefitsRetirement: text("benefits_retirement"),
    benefitsPto: text("benefits_pto"),
    benefitsBonus: text("benefits_bonus"),
    benefitsOtherJson: text("benefits_other_json", { mode: "json" }).$type<string[]>(),

    // Historic & negotiation analysis
    historicComparison: text("historic_comparison"),
    historicSalaryAnalysis: text("historic_salary_analysis"),
    historicBenefitsAnalysis: text("historic_benefits_analysis"),
    negotiationStrategy: text("negotiation_strategy"),

    // Raw extraction
    extractedLocation: text("extracted_location"),
    experienceLevel: text("experience_level"),

    // HITL reprocess tracking
    isManualReprocess: integer("is_manual_reprocess", { mode: "boolean" }).default(false),
    reprocessRationale: text("reprocess_rationale"),

    // R2 archive keys
    archiveMdKey: text("archive_md_key"),
    archivePdfKey: text("archive_pdf_key"),
    archiveHtmlKey: text("archive_html_key"),
  },
  (table) => ({
    jobIdx: index("job_snapshots_job_id_idx").on(table.jobId),
    sessionIdx: index("job_snapshots_session_uuid_idx").on(table.sessionUuid),
    verdictIdx: index("job_snapshots_verdict_idx").on(table.verdict),
    scoreIdx: index("job_snapshots_match_score_idx").on(table.matchScore),
  }),
);

export const insertJobSnapshotSchema = createInsertSchema(jobSnapshots);
export const selectJobSnapshotSchema = createSelectSchema(jobSnapshots);
export type JobSnapshot = typeof jobSnapshots.$inferSelect;
export type NewJobSnapshot = typeof jobSnapshots.$inferInsert;
