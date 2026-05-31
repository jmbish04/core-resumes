/**
 * @fileoverview Normalize ATS job site IDs across pipelines.
 *
 * Different pipelines use different ID formats for the same job:
 * - Pipeline A: `gh-stripe-4567890` (prefixed with provider + token)
 * - Pipeline B: `4567890` (raw ATS ID)
 * - External:   `ext-a1b2c3d4` (synthetic hash)
 * - RSS:        raw ATS ID when extractable, otherwise `rss-{hash}`
 *
 * This utility strips known pipeline prefixes to produce the raw ATS ID,
 * so the UNIQUE constraint on `jobs_postings.job_site_id` catches duplicates
 * regardless of which pipeline discovered the job first.
 */

/**
 * Known pipeline prefix patterns.
 *
 * Format: `{provider}-{token}-{atsId}` where:
 * - `gh` = Greenhouse
 * - `lv` = Lever
 * - `as` = Ashby
 *
 * Synthetic prefixes (`ext-`, `rss-`) are kept as-is since they have
 * no real ATS ID to normalize to.
 */
const PIPELINE_PREFIX_RE = /^(?:gh|lv|as)-[a-z0-9_-]+-(.+)$/i;

/**
 * Strip pipeline prefixes and return the raw ATS-assigned job ID.
 *
 * @example
 * normalizeJobSiteId("gh-stripe-4567890")   // → "4567890"
 * normalizeJobSiteId("lv-vercel-abc123")    // → "abc123"
 * normalizeJobSiteId("as-replicate-xyz")    // → "xyz"
 * normalizeJobSiteId("4567890")             // → "4567890" (already raw)
 * normalizeJobSiteId("ext-a1b2c3d4")        // → "ext-a1b2c3d4" (synthetic, keep)
 * normalizeJobSiteId("rss-abc123")          // → "rss-abc123" (synthetic, keep)
 */
export function normalizeJobSiteId(rawId: string): string {
  // Synthetic IDs — keep as-is (no real ATS ID behind them)
  if (rawId.startsWith("ext-") || rawId.startsWith("rss-")) {
    return rawId;
  }

  const match = rawId.match(PIPELINE_PREFIX_RE);
  if (match) {
    return match[1];
  }

  // Already a raw ID
  return rawId;
}
