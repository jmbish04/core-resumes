/**
 * @fileoverview Greenhouse RSS feed provider.
 *
 * URL pattern: `https://boards.greenhouse.io/{token}/feed`
 * Feed format: RSS 2.0
 * Job ID extraction: from link path `/jobs/{id}` segment
 */

import type { RssItem } from "../xml-parser";
import type { NormalizedRssJob, RssFeedProvider } from "./types";

/** Extract the numeric Greenhouse job ID from the posting URL. */
function extractGreenhouseJobId(link: string): string | null {
  // https://boards.greenhouse.io/stripe/jobs/4567890 → "4567890"
  const match = link.match(/\/jobs\/(\d+)/);
  return match ? match[1] : null;
}

/** Extract location from the Greenhouse RSS description HTML. */
function extractLocation(description: string): string | null {
  // Greenhouse RSS descriptions often start with "Location: San Francisco, CA"
  // or embed it in a <strong>Location</strong> block.
  const locMatch = description.match(/(?:location|office|based in)[:\s]*([^<.\n]+)/i);
  return locMatch ? locMatch[1].trim() : null;
}

export const greenhouseRssProvider: RssFeedProvider = {
  name: "greenhouse_rss",
  displayName: "Greenhouse RSS",
  type: "ats",

  buildFeedUrl(token?: string): string {
    if (!token) throw new Error("Greenhouse RSS requires a board token");
    return `https://boards.greenhouse.io/${token}/feed`;
  },

  normalize(item: RssItem, feedToken?: string): NormalizedRssJob {
    const atsId = extractGreenhouseJobId(item.link);
    // Use raw ATS ID when available for cross-pipeline dedup
    const jobSiteId = atsId ?? `rss-gh-${hashString(item.link)}`;

    return {
      jobSiteId,
      jobTitle: item.title,
      company: feedToken ?? "unknown",
      location: extractLocation(item.description),
      jobUrl: item.link || null,
      pubDate: item.pubDate ? new Date(item.pubDate).toISOString() : null,
      feedSource: "greenhouse_rss",
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
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}
