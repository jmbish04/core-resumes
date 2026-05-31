/**
 * @fileoverview Gem Job Board API client.
 *
 * Provides API-based extraction for job postings hosted on Gem ATS
 * (api.gem.com/job_board/v0). This is the third ATS provider alongside
 * Greenhouse and AshbyHQ.
 *
 * Key architectural note: Unlike Greenhouse, Gem's public Job Board API
 * does NOT offer a separate endpoint for single job details. The standard
 * GET /job_board/v0/{vanity_url_path}/job_posts returns the entire nested
 * payload for all active posts. To retrieve a single job, we fetch the
 * full list and filter in memory.
 *
 * @see https://api.gem.com/job_board/v0/reference
 * @see https://help.gem.com/databases/gem-help-center/the-job-board-api
 */

import type { ScrapedPage } from "./browser-rendering";

// ---------------------------------------------------------------------------
// URL pattern matching
// ---------------------------------------------------------------------------

/**
 * Matches Gem job board URLs and extracts the vanity slug.
 *
 * Supported patterns:
 * - https://api.gem.com/job_board/v0/{slug}/job_posts
 * - https://jobs.gem.com/{slug}
 * - https://jobs.gem.com/{slug}/{jobId}
 */
const GEM_URL_PATTERN =
  /^https?:\/\/(?:api\.gem\.com\/job_board\/v0\/([^/]+)\/job_posts|jobs\.gem\.com\/([^/]+)(?:\/([^/?]+))?)/i;

export function parseGemUrl(url: string): { vanitySlug: string; jobId?: string } | null {
  const match = url.match(GEM_URL_PATTERN);
  if (!match) return null;

  const slug = match[1] || match[2];
  const jobId = match[3];

  if (!slug) return null;

  return { vanitySlug: slug, jobId: jobId || undefined };
}

/**
 * Returns true if the URL is a Gem job board link.
 */
export function isGemUrl(url: string): boolean {
  return parseGemUrl(url) !== null;
}

// ---------------------------------------------------------------------------
// Gem API response types
// ---------------------------------------------------------------------------

export interface GemLocation {
  id: string;
  name: string;
  city?: string;
  region?: string;
  country?: string;
}

export interface GemDepartment {
  id: string;
  name: string;
}

export interface GemJobPost {
  id: string;
  title: string;
  description_html: string;
  compensation_html?: string;
  department?: GemDepartment;
  location?: GemLocation;
  is_remote: boolean;
  published_at: string;
}

export interface GemJobBoardResponse {
  job_posts: GemJobPost[];
}

// ---------------------------------------------------------------------------
// Fetch all jobs from a Gem board
// ---------------------------------------------------------------------------

const GEM_API_BASE = "https://api.gem.com/job_board/v0";
const PER_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Fetches all active job posts from a company's public Gem job board.
 *
 * @param vanitySlug - The unique company slug assigned in Gem Admin Settings.
 * @param apiKey - Optional Bearer token if the board is configured as private.
 */
export async function scrapeGemBoard(
  vanitySlug: string,
  apiKey?: string,
): Promise<GemJobPost[]> {
  if (!vanitySlug || vanitySlug.trim() === "") {
    throw new Error("A valid Gem vanity URL path/slug must be provided.");
  }

  const targetUrl = `${GEM_API_BASE}/${vanitySlug}/job_posts`;

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(targetUrl, {
    headers,
    signal: AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `Gem API returned ${response.status} for board '${vanitySlug}'`,
    );
  }

  const body = (await response.json()) as GemJobBoardResponse;

  if (!body || !Array.isArray(body.job_posts)) {
    return [];
  }

  return body.job_posts;
}

// ---------------------------------------------------------------------------
// Fetch a single job from a Gem board (in-memory filter)
// ---------------------------------------------------------------------------

/**
 * Fetches a single job posting from a Gem board by filtering the full payload
 * in memory. This is the standard approach since Gem's public API does not
 * offer a single-job endpoint.
 *
 * Returns the same `ScrapedPage` shape used by Browser Rendering and
 * Greenhouse, enabling drop-in usage in the analysis pipeline.
 */
export async function scrapeGemJob(
  vanitySlug: string,
  jobId: string,
  apiKey?: string,
): Promise<ScrapedPage & { gem: GemJobPost }> {
  if (!jobId) {
    throw new Error("A target Job ID is required to isolate individual posting data.");
  }

  const allJobs = await scrapeGemBoard(vanitySlug, apiKey);
  const targetJob = allJobs.find((job) => job.id === jobId);

  if (!targetJob) {
    throw new Error(
      `Job '${jobId}' not found on Gem board '${vanitySlug}' (${allJobs.length} active posts)`,
    );
  }

  // Normalize to ScrapedPage shape
  const html = decodeHtmlEntities(targetJob.description_html || "");
  const text = stripHtml(html);

  const enrichedText = [
    `Company: ${vanitySlug}`,
    `Job Title: ${targetJob.title}`,
    `Location: ${targetJob.location?.name ?? (targetJob.is_remote ? "Remote" : "Not specified")}`,
    targetJob.department ? `Department: ${targetJob.department.name}` : "",
    targetJob.is_remote ? "Remote: Yes" : "",
    targetJob.compensation_html
      ? `Compensation: ${stripHtml(decodeHtmlEntities(targetJob.compensation_html))}`
      : "",
    "",
    text,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    html,
    text: enrichedText,
    links: [],
    screenshotUrl: undefined,
    gem: targetJob,
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
