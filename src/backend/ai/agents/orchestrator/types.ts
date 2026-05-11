import { z } from "zod";

import type { ScrapedPage, ScrapeResult } from "@/ai/tools/browser-rendering";

export type OrchestratorTaskType =
  | "resume_review"
  | "cover_letter_draft"
  | "email_draft"
  | "email_workflow"
  | "offer_analysis"
  | "job_extract"
  | "role_analysis"
  | "company_analysis"
  | "insight_location"
  | "insight_compensation"
  | "insight_combined"
  | "role_assets"
  | "email_status_inference"
  | "interview_feedback"
  | "mock_interview"
  | "resume_comment_response";

export type OrchestratorTaskStatus = "pending" | "running" | "complete" | "failed";

export type OrchestratorTask = {
  id: string;
  type: OrchestratorTaskType;
  status: OrchestratorTaskStatus;
  roleId?: string;
  payload?: Record<string, unknown>;
  error?: string;
};

export type OrchestratorState = {
  roleId: string | "global";
  pendingTasks: OrchestratorTask[];
};

export const JobPostingExtractionSchema = z
  .object({
    // ── Core identifiers ────────────────────────────────────────────────────
    companyName: z.string().nullable().optional(),
    jobTitle: z.string().nullable().optional(),
    jobUrl: z.string().url().nullable().optional(),
    companyLogoUrl: z.string().url().nullable().optional().describe("Absolute URL to the company's logo if present in the job posting."),

    // ── Compensation ────────────────────────────────────────────────────────
    salaryMin: z.number().int().nullable().optional(),
    salaryMax: z.number().int().nullable().optional(),
    salaryCurrency: z.string().nullable().optional(),

    // ── Role details ────────────────────────────────────────────────────────
    responsibilities: z
      .array(
        z
          .string()
          .describe(
            "VERBATIM full text of each responsibility bullet from the posting — do NOT summarize or shorten",
          ),
      )
      .nullable()
      .optional(),
    requiredQualifications: z
      .array(
        z
          .string()
          .describe(
            "VERBATIM full text of each required/must-have qualification — do NOT summarize or shorten",
          ),
      )
      .nullable()
      .optional(),
    preferredQualifications: z
      .array(
        z
          .string()
          .describe(
            "VERBATIM full text of each preferred/nice-to-have qualification — do NOT summarize or shorten",
          ),
      )
      .nullable()
      .optional(),
    requiredSkills: z
      .array(
        z
          .string()
          .describe("VERBATIM full text of each required skill — do NOT summarize or shorten"),
      )
      .nullable()
      .optional(),
    preferredSkills: z
      .array(
        z
          .string()
          .describe("VERBATIM full text of each preferred skill — do NOT summarize or shorten"),
      )
      .nullable()
      .optional(),

    // ── Location & work arrangement ─────────────────────────────────────────
    location: z
      .string()
      .nullable()
      .optional()
      .describe("Job location as a single string, e.g. 'San Francisco, CA'"),
    allLocations: z
      .array(z.string())
      .nullable()
      .optional()
      .describe(
        "ALL individual job locations as separate strings. E.g. ['San Francisco, CA', 'New York City, NY']",
      ),
    californiaLocations: z
      .array(z.string())
      .nullable()
      .optional()
      .describe(
        "Only locations in California / SF Bay Area from the job posting. Empty array if none.",
      ),
    workplaceType: z.enum(["remote", "hybrid", "onsite"]).nullable().optional(),
    rtoPolicy: z.string().nullable().optional(),

    // ── Experience & education ──────────────────────────────────────────────
    yearsExperienceMin: z.number().nullable().optional(),
    yearsExperienceMax: z.number().nullable().optional(),
    educationRequirements: z
      .array(
        z
          .string()
          .describe("VERBATIM full text of each education requirement — do NOT summarize or shorten"),
      )
      .nullable()
      .optional(),

    // ── Organization ────────────────────────────────────────────────────────
    department: z.string().nullable().optional(),
    reportingTo: z.string().nullable().optional(),

    // ── Logistics ───────────────────────────────────────────────────────────
    travelRequirements: z.string().nullable().optional(),
    securityClearance: z.string().nullable().optional(),
    visaSponsorship: z.string().nullable().optional(),

    // ── Benefits & extras ───────────────────────────────────────────────────
    benefits: z
      .array(
        z.string().describe("VERBATIM full text of each benefit item — do NOT summarize or shorten"),
      )
      .nullable()
      .optional(),
    additionalNotes: z.string().nullable().optional(),

    // ── Company & role narrative ────────────────────────────────────────────
    aboutCompany: z
      .string()
      .nullable()
      .optional()
      .describe(
        "VERBATIM company introduction / 'About Us' / mission statement section. Copy the ENTIRE section exactly as written, including ALL paragraphs.",
      ),
    aboutRoleNarrative: z
      .string()
      .nullable()
      .optional()
      .describe(
        "ALL VERBATIM free-text paragraphs that appear BEFORE any bullet-point lists. This includes the company intro, team description, role overview, 'what's non-negotiable' statements, and any other narrative text. Concatenate ALL such paragraphs with newlines between them. Do NOT omit any paragraph.",
      ),
    otherContent: z
      .string()
      .nullable()
      .optional()
      .describe(
        "Any remaining content from the posting that does not fit into the other fields. Include everything verbatim.",
      ),

    // ── ATS Taxonomy Tags ───────────────────────────────────────────────────
    atsTags: z
      .object({
        programmingLanguagesAndFrameworks: z
          .array(z.string())
          .describe(
            "Extract BOTH languages AND frameworks as separate atomic entries. E.g., 'PHP' and 'Symfony' should be two separate entries, not 'PHP/Symfony'.",
          ),
        testingAndQuality: z
          .array(z.string())
          .describe(
            "Testing frameworks, methodologies, and quality practices. E.g., TDD, Jest, Cypress, code review, CI/CD testing.",
          ),
        engineeringPractices: z
          .array(z.string())
          .describe(
            "Software engineering principles and patterns. E.g., SOLID, DDD, microservices, clean architecture, event-driven.",
          ),
        businessDomain: z
          .array(z.string())
          .describe(
            "Industry verticals and business model tags. E.g., SaaS, fintech, B2B, legaltech, healthtech, e-commerce.",
          ),
        infrastructureAndDevOps: z
          .array(z.string())
          .describe(
            "Cloud, infrastructure, and DevOps tooling. E.g., Docker, AWS, Terraform, Kubernetes, CI/CD, monitoring.",
          ),
        impliedSkills: z
          .array(z.string())
          .describe(
            "Skills inferred from contextual phrasing rather than explicit mentions. E.g., 'high traffic' → 'scalability', 'multiple services' → 'distributed systems', 'complex codebase' → 'refactoring'.",
          ),
      })
      .nullable()
      .optional()
      .describe(
        "Exhaustive ATS keyword taxonomy extracted from the job posting. Must contain 30-50+ atomic tags across all categories.",
      ),

    // ── Legacy / catch-all ──────────────────────────────────────────────────
    roleInstructions: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  });

export const JobPostingSchema = JobPostingExtractionSchema.extend({
  location: z
    .preprocess(
      (val) => {
        if (val === null || val === undefined) return val;
        if (typeof val === "string") return val;
        if (Array.isArray(val)) return val.filter(Boolean).join("; ");
        if (typeof val === "object") return JSON.stringify(val);
        return String(val);
      },
      z.string().nullable().optional(),
    )
    .describe("Job location as a single string, e.g. 'San Francisco, CA'"),
  otherContent: z
    .preprocess(
      (val) => (Array.isArray(val) ? val.join("\n") : val),
      z.string().nullable().optional(),
    )
    .describe(
      "Any remaining content from the posting that does not fit into the other fields. Include everything verbatim.",
    ),
});

export const JobPosting = JobPostingSchema
  // Coerce null → undefined so downstream code only needs to check for undefined
  .transform((data) => {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = value === null ? undefined : value;
    }
    // Ensure core identifiers have fallback defaults
    result.companyName = data.companyName ?? "Unknown Company";
    result.jobTitle = data.jobTitle ?? "Unknown Title";
    result.salaryCurrency = data.salaryCurrency ?? "USD";
    return result as typeof data;
  });

export type DetailedScrapeResult = ScrapedPage & {
  /**
   * @deprecated `handleScrapeJob` no longer produces a separate Browser
   * Rendering `/json` extraction — the hybrid pipeline supersedes it.
   * Field retained for backward compatibility with callers that still
   * thread it through (Greenhouse fallback path may leave it `undefined`).
   */
  jsonExtract?: z.infer<typeof JobPosting>;
  /** DOM elements (h1-h3, ul>li, ol>li, p) used by the hybrid extraction. */
  scrapedElements?: ScrapeResult;
};
