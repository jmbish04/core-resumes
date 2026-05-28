import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `roles` table for the documentation UI. */
export const ROLES_TABLE_DESCRIPTION =
  "Tracks job applications through a lifecycle workflow: preparing → applied → interviewing → offer / rejected / withdrawn / archived.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const ROLES_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "UUID primary key, generated at creation.",
  company_id: "Optional UUID referencing the companies table.",
  company_name: "Name of the hiring company.",
  job_title: "Title of the position being applied for.",
  job_url: "URL of the original job posting, used for intake scraping.",
  salary_min: "Lower bound of the salary range (nullable if not disclosed).",
  salary_max: "Upper bound of the salary range (nullable if not disclosed).",
  salary_currency: "ISO 4217 currency code for salary figures. Defaults to USD.",
  years_experience_min:
    "Minimum years of experience required (e.g., '5+' → 5). Nullable if not mentioned.",
  years_experience_max:
    "Maximum years of experience range (e.g., '3-5 years' → 5). Nullable if not mentioned.",
  about_company:
    "Company introduction / About Us section extracted from the job posting. Stored verbatim.",
  about_role_narrative:
    "Free-text role narrative paragraphs that appear before bullet points in the job posting.",
  other_content: "Catch-all field for any content the scraping extraction failed to categorize.",
  status:
    "Application lifecycle status. One of: preparing, applied, interviewing, offer, rejected, withdrawn, archived.",
  drive_folder_id: "Google Drive folder ID containing this role's generated documents.",
  job_posting_pdf_url: "R2-served URL to the PDF snapshot of the original job posting.",
  metadata:
    "Flexible JSON blob for scraped job description, extracted skills, and other unstructured data.",
  role_instructions:
    "Role-specific AI instructions that override or supplement global agent_rules.",
  source:
    "Where this role originated. One of: manual (user-created), greenhouse_scan (scanned from Greenhouse), email (ingested from inbound email), freelance_upwork (promoted from Upwork opportunity), freelance_freelancer (promoted from Freelancer.com opportunity).",
  source_snapshot_id:
    "If source is greenhouse_scan, references the job_snapshot row that seeded this role. Null for manual or email sources.",
  metro: "Normalized metropolitan area string for salary benchmarking (e.g., 'San Francisco, CA'). Nullable, populated at ingest or backfilled.",
  created_at: "Unix timestamp (seconds) of when the role was created.",
  updated_at: "Unix timestamp (seconds) of the last modification.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const roles = sqliteTable(
  "roles",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id"),
    companyName: text("company_name").notNull(),
    jobTitle: text("job_title").notNull(),
    jobUrl: text("job_url"),
    jobPostingPdfUrl: text("job_posting_pdf_url"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: text("salary_currency").default("USD"),
    yearsExperienceMin: integer("years_experience_min"),
    yearsExperienceMax: integer("years_experience_max"),
    aboutCompany: text("about_company"),
    aboutRoleNarrative: text("about_role_narrative"),
    otherContent: text("other_content"),
    status: text("status", {
      enum: [
        "preparing",
        "processing_error",
        "posting_expired",
        "applied",
        "interviewing",
        "offer",
        "negotiating",
        "accepted",
        "rejected",
        "withdrawn",
        "archived",
      ],
    })
      .notNull()
      .default("preparing"),
    driveFolderId: text("drive_folder_id"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    roleInstructions: text("role_instructions"),
    source: text("source", {
      enum: ["manual", "greenhouse_scan", "email", "freelance_upwork", "freelance_freelancer"],
    })
      .notNull()
      .default("manual"),
    sourceSnapshotId: integer("source_snapshot_id"),
    metro: text("metro"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    statusIdx: index("roles_status_idx").on(table.status),
    sourceIdx: index("roles_source_idx").on(table.source),
    metroIdx: index("roles_metro_idx").on(table.metro),
  }),
);

export const insertRoleSchema = createInsertSchema(roles);
export const selectRoleSchema = createSelectSchema(roles);
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;

/** Discriminated union for the `source` column on `roles`. */
export type RoleSource = "manual" | "greenhouse_scan" | "email" | "freelance_upwork" | "freelance_freelancer";
