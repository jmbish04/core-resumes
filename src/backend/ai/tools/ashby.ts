/**
 * @fileoverview AshbyHQ Job Board API client.
 *
 * Provides API-based extraction for job postings hosted on AshbyHQ
 * (api.ashbyhq.com/posting-api/job-board). This is the second ATS provider
 * alongside Greenhouse and Gem.
 *
 * AshbyHQ's public Posting API is free and requires no authentication:
 * - Board listing: GET /posting-api/job-board/{boardToken}
 * - Single job:    GET /posting-api/job-board/{boardToken}?includeCompensation=true
 *   (filter in memory — no single-job endpoint)
 *
 * @see https://developers.ashbyhq.com/docs/public-api
 */

import type { ScrapedPage } from "./browser-rendering";

// ---------------------------------------------------------------------------
// URL pattern matching
// ---------------------------------------------------------------------------

/**
 * Matches Ashby job board URLs and extracts the board token + optional job ID.
 *
 * Supported patterns:
 * - https://jobs.ashbyhq.com/{token}
 * - https://jobs.ashbyhq.com/{token}/{jobId}
 * - https://jobs.ashbyhq.com/{token}/application/{jobId}
 */
const ASHBY_PATTERN =
  /^https?:\/\/jobs\.ashbyhq\.com\/([^/?#]+)(?:\/(?:application\/)?([^/?#]+))?/i;

export function parseAshbyUrl(url: string): { boardToken: string; jobId?: string } | null {
  const match = url.match(ASHBY_PATTERN);
  if (!match) return null;

  const token = match[1];
  if (!token) return null;

  return { boardToken: token, jobId: match[2] || undefined };
}

/**
 * Returns true if the URL is an AshbyHQ job board link.
 */
export function isAshbyUrl(url: string): boolean {
  return parseAshbyUrl(url) !== null;
}

// ---------------------------------------------------------------------------
// Ashby API response types
// ---------------------------------------------------------------------------

export interface AshbyJobResponse {
  id: string;
  title: string;
  location: string;
  organizationName?: string;
  publishedAt: string;
  descriptionHtml?: string;
  descriptionPlain?: string;
  compensationTierSummary?: string;
  isRemote: boolean;
  department?: string;
  team?: string;
  employmentType?: string;
}

interface AshbyBoardResponse {
  jobs?: AshbyJobResponse[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ASHBY_API_BASE = "https://api.ashbyhq.com/posting-api/job-board";
const PER_REQUEST_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Fetch all jobs from an Ashby board
// ---------------------------------------------------------------------------

/**
 * Fetches all active job posts from a company's public Ashby job board.
 *
 * @param boardToken - The unique company slug on AshbyHQ (e.g. "replicate", "lattice").
 */
export async function scrapeAshbyBoard(
  boardToken: string,
): Promise<AshbyJobResponse[]> {
  if (!boardToken || boardToken.trim() === "") {
    throw new Error("A valid Ashby board token must be provided.");
  }

  const response = await fetch(
    `${ASHBY_API_BASE}/${boardToken}?includeCompensation=true`,
    { signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS) },
  );

  if (!response.ok) {
    throw new Error(
      `Ashby API returned ${response.status} for board '${boardToken}'`,
    );
  }

  const body = (await response.json()) as AshbyBoardResponse;

  if (!body || !Array.isArray(body.jobs)) {
    return [];
  }

  return body.jobs;
}

// ---------------------------------------------------------------------------
// Fetch a single job from an Ashby board (in-memory filter)
// ---------------------------------------------------------------------------

/**
 * Fetches a single job posting from an Ashby board by filtering the full
 * payload in memory. Returns the same `ScrapedPage` shape used by Browser
 * Rendering, Greenhouse, and Gem for drop-in pipeline compatibility.
 */
export async function scrapeAshbyJob(
  boardToken: string,
  jobId: string,
): Promise<ScrapedPage & { ashby: AshbyJobResponse }> {
  if (!jobId) {
    throw new Error("A target Job ID is required to isolate individual posting data.");
  }

  const allJobs = await scrapeAshbyBoard(boardToken);
  const targetJob = allJobs.find((j) => j.id === jobId || j.title === jobId);

  if (!targetJob) {
    throw new Error(
      `Job '${jobId}' not found on Ashby board '${boardToken}' (${allJobs.length} active posts)`,
    );
  }

  // Normalize to ScrapedPage shape
  const html = decodeHtmlEntities(targetJob.descriptionHtml || "");
  const text = stripHtml(html);

  const enrichedText = `Company: ${targetJob.organizationName ?? boardToken}
Job Title: ${targetJob.title}
Location: ${targetJob.location || (targetJob.isRemote ? "Remote" : "Not specified")}${targetJob.department ? `\nDepartment: ${targetJob.department}` : ""}${targetJob.isRemote ? "\nRemote: Yes" : ""}${targetJob.compensationTierSummary ? `\nCompensation: ${targetJob.compensationTierSummary}` : ""}

${text || targetJob.descriptionPlain || "No description available."}`;

  return {
    html,
    text: enrichedText,
    links: [],
    screenshotUrl: undefined,
    ashby: targetJob,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Decode common HTML entities. */
function decodeHtmlEntities(html: string): string {
  return html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–");
}

/** Minimal HTML → plaintext strip. */
function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
