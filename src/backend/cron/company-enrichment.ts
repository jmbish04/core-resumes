/**
 * @file Company enrichment cron handler.
 *
 * Runs on the 4-hour cron (piggybacked with health checks and discovery scorer).
 * Enriches `api_companies` rows that are missing `name` fields by querying
 * the respective job board APIs:
 *
 * - **Greenhouse:** `GET boards-api.greenhouse.io/v1/boards/{token}` → board `name`
 * - **Ashby:** `GET api.ashbyhq.com/posting-api/job-board/{token}` → first job's company metadata
 * - **Lever:** `GET api.lever.co/v0/postings/{token}?limit=1` → company name from posting
 *
 * Processes up to 25 companies per run, prioritizing `is_recommended = true` rows.
 * Failed lookups are silently skipped and retried on the next cycle.
 */

import { eq, and, isNull, desc } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { apiCompanies } from "@/backend/db/schema";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = 25;
const PER_REQUEST_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Board API extractors
// ---------------------------------------------------------------------------

/** Extract company name from Greenhouse board metadata. */
async function extractGreenhouseName(token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${token}`,
      { signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS) },
    );
    if (!res.ok) return null;

    const body = (await res.json()) as { name?: string };
    return body.name?.trim() || null;
  } catch {
    return null;
  }
}

/** Extract company name from Ashby public posting-api. */
async function extractAshbyName(token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.ashbyhq.com/posting-api/job-board/${token}`,
      { signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS) },
    );
    if (!res.ok) return null;

    const body = (await res.json()) as {
      jobs?: Array<{ organizationName?: string }>;
    };

    // The board-level response may have jobs with organizationName
    if (body.jobs && body.jobs.length > 0) {
      const orgName = body.jobs[0].organizationName;
      if (orgName?.trim()) return orgName.trim();
    }

    // Fallback: use the token itself as a display-friendly name
    // (capitalize first letter of each word, replace hyphens with spaces)
    return formatTokenAsName(token);
  } catch {
    return null;
  }
}

/** Extract company name from Lever postings API. */
async function extractLeverName(token: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.lever.co/v0/postings/${token}?limit=1`,
      { signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS) },
    );
    if (!res.ok) return null;

    const body = (await res.json()) as Array<{
      categories?: { team?: string };
      text?: string;
    }>;

    // Lever postings don't include a dedicated company name field,
    // so we format the token slug into a readable name
    if (Array.isArray(body) && body.length > 0) {
      return formatTokenAsName(token);
    }

    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a URL-style token slug into a human-readable company name.
 * e.g. "stripe" → "Stripe", "palo-alto-networks" → "Palo Alto Networks"
 */
function formatTokenAsName(token: string): string {
  return token
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export interface CompanyEnrichmentResult {
  queried: number;
  enriched: number;
  failed: number;
  skipped: number;
}

export async function runCompanyEnrichment(
  env: Env,
): Promise<CompanyEnrichmentResult> {
  const db = getDb(env);

  // Fetch up to BATCH_SIZE companies with missing names, prioritize recommended
  const candidates = await db
    .select({
      id: apiCompanies.id,
      token: apiCompanies.jobBoardToken,
      system: apiCompanies.system,
    })
    .from(apiCompanies)
    .where(
      and(
        isNull(apiCompanies.name),
        eq(apiCompanies.isActive, true),
      ),
    )
    .orderBy(desc(apiCompanies.isRecommended))
    .limit(BATCH_SIZE);

  if (candidates.length === 0) {
    return { queried: 0, enriched: 0, failed: 0, skipped: 0 };
  }

  let enriched = 0;
  let failed = 0;
  let skipped = 0;

  // Process each candidate — extract name based on system type
  for (const company of candidates) {
    let extractedName: string | null = null;

    switch (company.system) {
      case "greenhouse":
        extractedName = await extractGreenhouseName(company.token);
        break;
      case "ashby":
        extractedName = await extractAshbyName(company.token);
        break;
      case "lever":
        extractedName = await extractLeverName(company.token);
        break;
      default:
        // Unknown system — skip, try token-based fallback
        extractedName = formatTokenAsName(company.token);
        break;
    }

    if (extractedName) {
      try {
        await db
          .update(apiCompanies)
          .set({ name: extractedName })
          .where(eq(apiCompanies.id, company.id));
        enriched++;
      } catch {
        failed++;
      }
    } else {
      skipped++;
    }
  }

  return {
    queried: candidates.length,
    enriched,
    failed,
    skipped,
  };
}
