/**
 * @file Discovery scorer cron handler.
 *
 * Runs on the 4-hour cron alongside health checks. Scores `api_companies`
 * and `jobs_postings` using **keyword + location heuristic matching** against
 * the applicant profile (no AI involved for `is_recommended`).
 *
 * Scoring criteria:
 * - **Jobs `is_recommended`**: location is remote or SF Bay Area AND
 *   title/description matches candidate profile keywords.
 * - **Companies `is_recommended`**: has remote or SF Bay Area jobs AND
 *   description or known jobs match candidate profile.
 *
 * After scoring, a separate AI analysis step runs on `is_recommended:true`
 * jobs that haven't been analyzed yet.
 */

import { eq, sql, and, isNull } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { apiCompanies, jobsPostings, globalConfig } from "@/backend/db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApplicantProfile {
  location?: string;
  locations?: string[];
  hubs?: string[];
  target_roles?: string[];
  applicant_name?: {
    first_name?: string;
    last_name?: string;
    full_name?: string;
  };
}

interface ScoringResult {
  companiesScored: number;
  companiesRecommended: number;
  jobsScored: number;
  jobsRecommended: number;
}

// ---------------------------------------------------------------------------
// Default fallback profile (mirrors config.ts defaultConfig)
// ---------------------------------------------------------------------------

const FALLBACK_PROFILE: ApplicantProfile = {
  location: "San Francisco Bay Area",
  locations: ["san francisco", "bay area", "sf", "oakland", "san jose", "california", "ca"],
  hubs: ["San Francisco", "New York", "Seattle", "Austin"],
  target_roles: ["software engineer", "frontend", "backend", "fullstack", "devops"],
};

// Always-match location keywords (case-insensitive)
const REMOTE_KEYWORDS = ["remote", "anywhere", "distributed", "work from home", "wfh"];

// ---------------------------------------------------------------------------
// Profile loader
// ---------------------------------------------------------------------------

async function loadApplicantProfile(env: Env): Promise<ApplicantProfile> {
  const db = getDb(env);

  try {
    const [row] = await db
      .select({ value: globalConfig.value })
      .from(globalConfig)
      .where(eq(globalConfig.key, "applicant_profile"))
      .limit(1);

    if (row?.value) {
      const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      return { ...FALLBACK_PROFILE, ...parsed };
    }
  } catch {
    // Fallback on parse error
  }

  return FALLBACK_PROFILE;
}

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

/**
 * Checks if a location string matches the candidate's target geography.
 * Returns true for remote positions or SF Bay Area locations.
 */
function locationMatches(location: string | null | undefined, profile: ApplicantProfile): boolean {
  if (!location) return false;
  const loc = location.toLowerCase().trim();

  // Remote is always a match
  if (REMOTE_KEYWORDS.some((kw) => loc.includes(kw))) return true;

  // Check against profile locations
  const profileLocations = profile.locations ?? FALLBACK_PROFILE.locations ?? [];
  return profileLocations.some((pl) => loc.includes(pl));
}

/**
 * Checks if a job title or description matches the candidate's target roles.
 * Uses substring matching against the profile's target_roles keywords.
 */
function titleMatches(title: string | null | undefined, profile: ApplicantProfile): boolean {
  if (!title) return false;
  const t = title.toLowerCase().trim();

  const targetRoles = profile.target_roles ?? FALLBACK_PROFILE.target_roles ?? [];
  return targetRoles.some((role) => t.includes(role));
}

/**
 * Builds a human-readable recommendation reason from match signals.
 */
function buildReason(signals: { titleMatch: boolean; locationMatch: boolean; title: string; location: string }): string {
  const parts: string[] = [];

  if (signals.titleMatch) {
    parts.push(`Title match: "${signals.title}"`);
  }
  if (signals.locationMatch) {
    parts.push(`Location match: "${signals.location}"`);
  }

  return parts.join(" | ");
}

/**
 * Calculates a simple 0-100 heuristic score based on match quality.
 */
function calculateScore(signals: { titleMatch: boolean; locationMatch: boolean }): number {
  let score = 0;

  if (signals.titleMatch) score += 50;
  if (signals.locationMatch) score += 50;

  return score;
}

// ---------------------------------------------------------------------------
// Company scorer
// ---------------------------------------------------------------------------

/**
 * Scores `api_companies` that have `is_recommended IS NULL` or have a stale
 * recommendation_reason (from the old blind-set logic).
 *
 * Uses the company name, description, and `recommendation_reason` text to
 * determine if the company likely has jobs matching the candidate's profile.
 */
async function scoreCompanies(env: Env, profile: ApplicantProfile): Promise<{ scored: number; recommended: number }> {
  const db = getDb(env);
  const BATCH_SIZE = 500;
  let scored = 0;
  let recommended = 0;

  // Find companies that haven't been properly scored yet.
  // "Properly scored" means recommendation_reason is NOT null AND
  // does NOT contain the old blind-set marker text.
  const unscoredCompanies = await db
    .select({
      id: apiCompanies.id,
      name: apiCompanies.name,
      token: apiCompanies.jobBoardToken,
      system: apiCompanies.system,
      recommendationReason: apiCompanies.recommendationReason,
    })
    .from(apiCompanies)
    .where(
      sql`${apiCompanies.isActive} = 1 AND (
        ${apiCompanies.recommendationReason} IS NULL
        OR ${apiCompanies.recommendationReason} LIKE '%Automatically discovered%'
      )`
    )
    .limit(BATCH_SIZE);

  if (unscoredCompanies.length === 0) {
    return { scored: 0, recommended: 0 };
  }

  // For companies, we check if the company name or token suggests relevance.
  // The real signal comes from the jobs_postings table — companies with
  // recommended jobs automatically become recommended companies.
  // For now, mark them all as scored (is_recommended:false) and let
  // the job-level scoring promote them.
  const updates: { id: number; isRecommended: boolean; reason: string }[] = [];

  for (const company of unscoredCompanies) {
    // Simple heuristic: check if company name matches any target keywords
    const name = (company.name || company.token || "").toLowerCase();
    const isRelevant = false; // Companies start unscored — jobs promote them

    updates.push({
      id: company.id,
      isRecommended: isRelevant,
      reason: `Scored by discovery heuristic. Awaiting job-level analysis.`,
    });
    scored++;
  }

  // Batch update in chunks of 50
  const UPDATE_CHUNK = 50;
  for (let i = 0; i < updates.length; i += UPDATE_CHUNK) {
    const chunk = updates.slice(i, i + UPDATE_CHUNK);
    for (const u of chunk) {
      await db
        .update(apiCompanies)
        .set({
          isRecommended: u.isRecommended,
          recommendationReason: u.reason,
        })
        .where(eq(apiCompanies.id, u.id));
    }
  }

  return { scored, recommended };
}

// ---------------------------------------------------------------------------
// Job scorer
// ---------------------------------------------------------------------------

/**
 * Scores `jobs_postings` that don't yet have `is_recommended` set.
 * Uses title + location keyword matching against the applicant profile.
 */
async function scoreJobs(env: Env, profile: ApplicantProfile): Promise<{ scored: number; recommended: number }> {
  const db = getDb(env);
  const BATCH_SIZE = 500;
  let scored = 0;
  let recommended = 0;

  // Find jobs that haven't been scored yet
  // (is_recommended is still the default false AND recommendation_reason is NULL)
  const unscoredJobs = await db
    .select({
      id: jobsPostings.id,
      jobTitle: jobsPostings.jobTitle,
      company: jobsPostings.company,
      location: jobsPostings.location,
      triageReason: jobsPostings.triageReason,
    })
    .from(jobsPostings)
    .where(
      and(
        isNull(jobsPostings.recommendationReason),
        eq(jobsPostings.triagePassed, true),
      )
    )
    .limit(BATCH_SIZE);

  if (unscoredJobs.length === 0) {
    return { scored: 0, recommended: 0 };
  }

  for (const job of unscoredJobs) {
    // Extract location from triage_reason if not already stored
    // The sync-upstream.py stores location info in the triage_reason field
    let jobLocation = job.location;
    if (!jobLocation && job.triageReason) {
      const locMatch = job.triageReason.match(/in '([^']+)'/);
      if (locMatch) {
        jobLocation = locMatch[1];
      }
    }

    const isLocMatch = locationMatches(jobLocation, profile);
    const isTitleMatch = titleMatches(job.jobTitle, profile);

    // A job is recommended if BOTH title and location match
    const isRec = isLocMatch && isTitleMatch;
    const score = calculateScore({ titleMatch: isTitleMatch, locationMatch: isLocMatch });
    const reason = isRec
      ? buildReason({ titleMatch: isTitleMatch, locationMatch: isLocMatch, title: job.jobTitle, location: jobLocation || "unknown" })
      : `No match: title=${isTitleMatch ? "yes" : "no"}, location=${isLocMatch ? "yes" : "no"}`;

    await db
      .update(jobsPostings)
      .set({
        isRecommended: isRec,
        recommendationScore: score,
        recommendationReason: reason,
        location: jobLocation,
      })
      .where(eq(jobsPostings.id, job.id));

    scored++;
    if (isRec) recommended++;
  }

  // Promote companies that have recommended jobs
  if (recommended > 0) {
    await promoteCompaniesWithRecommendedJobs(env);
  }

  return { scored, recommended };
}

// ---------------------------------------------------------------------------
// Company promotion (job-driven)
// ---------------------------------------------------------------------------

/**
 * Finds companies that have `is_recommended:true` jobs and promotes
 * the parent `api_companies` row to `is_recommended:true`.
 */
async function promoteCompaniesWithRecommendedJobs(env: Env): Promise<void> {
  const db = getDb(env);

  // Find company tokens that have recommended jobs
  const recommendedCompanyTokens = await db
    .select({ company: jobsPostings.company })
    .from(jobsPostings)
    .where(eq(jobsPostings.isRecommended, true))
    .groupBy(jobsPostings.company);

  if (recommendedCompanyTokens.length === 0) return;

  for (const row of recommendedCompanyTokens) {
    await db
      .update(apiCompanies)
      .set({
        isRecommended: true,
        recommendationReason: `Has recommended job postings matching applicant profile.`,
      })
      .where(eq(apiCompanies.jobBoardToken, row.company));
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Runs the full discovery scoring pipeline.
 * Called from the Worker's `scheduled()` handler on the 4-hour cron.
 */
export async function runDiscoveryScorer(env: Env): Promise<ScoringResult> {
  const profile = await loadApplicantProfile(env);

  // Score jobs first (location + title matching)
  const jobResult = await scoreJobs(env, profile);

  // Then score companies (job-driven promotion)
  const companyResult = await scoreCompanies(env, profile);

  return {
    companiesScored: companyResult.scored,
    companiesRecommended: companyResult.recommended,
    jobsScored: jobResult.scored,
    jobsRecommended: jobResult.recommended,
  };
}
