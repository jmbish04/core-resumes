/**
 * @fileoverview RSS feed provider interface and normalized job type.
 *
 * Every RSS feed provider implements `RssFeedProvider` — one file per provider
 * in this directory. The registry in `index.ts` collects them all.
 *
 * To add a new feed provider:
 * 1. Create `{name}.ts` in this directory implementing `RssFeedProvider`
 * 2. Import and add it to the `RSS_FEED_PROVIDERS` array in `index.ts`
 */

import type { RssItem } from "../xml-parser";

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

export interface RssFeedProvider {
  /** Unique machine name — used as R2 dedup catalog key. */
  name: string;
  /** Human-readable name for UI display. */
  displayName: string;
  /** ATS providers generate per-company URLs; industry providers have static URLs. */
  type: "ats" | "industry";
  /**
   * Build the feed URL.
   * - ATS providers: token is required (e.g. "stripe" → Greenhouse RSS URL).
   * - Industry providers: token is ignored, returns the static URL.
   */
  buildFeedUrl(token?: string): string;
  /**
   * Transform a raw `RssItem` into a normalized job structure.
   * @param item - Parsed RSS/Atom item
   * @param feedToken - ATS board token (undefined for industry feeds)
   */
  normalize(item: RssItem, feedToken?: string): NormalizedRssJob;
}

// ---------------------------------------------------------------------------
// Normalized output
// ---------------------------------------------------------------------------

export interface NormalizedRssJob {
  /** Raw ATS job ID when extractable, otherwise a content-derived hash. */
  jobSiteId: string;
  /** Job title — cleaned of company prefix if present. */
  jobTitle: string;
  /** Company name or board token. */
  company: string;
  /** Location string, or null if not available. */
  location: string | null;
  /** Full URL to the job posting. */
  jobUrl: string | null;
  /** ISO date string of publication, if available. */
  pubDate: string | null;
  /** Which feed provider produced this item. */
  feedSource: string;
  /** Stripped HTML description text — used for relevance keyword matching. */
  descriptionText?: string;
}
