/**
 * @fileoverview Remotive RSS feed provider.
 *
 * URL: https://remotive.com/remote-jobs/rss-feed
 * Feed format: RSS 2.0
 * Title format: Varies — company is typically in the `<author>` tag or
 *   can be extracted from the `<link>` URL slug.
 */

import type { RssItem } from "../xml-parser";
import type { NormalizedRssJob, RssFeedProvider } from "./types";

const REMOTIVE_FEED_URL = "https://remotive.com/remote-jobs/rss-feed";

/** Extract a stable ID from the Remotive posting URL. */
function extractRemotiveId(link: string): string {
  // https://remotive.com/remote-jobs/software-dev/senior-frontend-engineer-12345
  // → "12345" if numeric suffix exists, otherwise the full slug
  const match = link.match(/remote-jobs\/[^/]+\/(.+?)(?:\/)?$/);
  if (match) {
    // Try to extract numeric suffix for a cleaner ID
    const numMatch = match[1].match(/(\d+)$/);
    if (numMatch) return numMatch[1];
    return match[1];
  }
  return `rss-remotive-${hashString(link)}`;
}

/** Extract company from the Remotive item title or description. */
function extractCompany(item: RssItem): string {
  // Remotive often structures as "Job Title at Company" or puts company in description
  const atMatch = item.title.match(/\bat\s+(.+)$/i);
  if (atMatch) return atMatch[1].trim();

  // Fallback: extract from description
  const descMatch = item.description.match(/company[:\s]+([^<.\n]+)/i);
  if (descMatch) return descMatch[1].trim();

  return "Unknown";
}

/** Clean the job title (remove "at Company" suffix). */
function cleanTitle(title: string): string {
  return title.replace(/\s+at\s+.+$/i, "").trim();
}

export const remotiveProvider: RssFeedProvider = {
  name: "remotive",
  displayName: "Remotive",
  type: "industry",

  buildFeedUrl(): string {
    return REMOTIVE_FEED_URL;
  },

  normalize(item: RssItem): NormalizedRssJob {
    const jobSiteId = extractRemotiveId(item.link);
    const company = extractCompany(item);
    const jobTitle = cleanTitle(item.title);

    return {
      jobSiteId,
      jobTitle,
      company,
      location: "Remote",
      jobUrl: item.link || null,
      pubDate: item.pubDate ? new Date(item.pubDate).toISOString() : null,
      feedSource: "remotive",
      descriptionText: item.description,
    };
  },
};

/** Simple string hash for fallback IDs. */
function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
