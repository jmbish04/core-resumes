/**
 * @fileoverview Lever RSS/XML feed provider.
 *
 * URL pattern: `https://api.lever.co/v0/postings/{token}?mode=xml`
 * Feed format: RSS 2.0
 * Job ID extraction: from link path UUID segment
 */

import type { RssItem } from "../xml-parser";
import type { NormalizedRssJob, RssFeedProvider } from "./types";

/** Extract the Lever posting UUID from the posting URL. */
function extractLeverJobId(link: string): string | null {
  // https://jobs.lever.co/vercel/abc123-def456 → "abc123-def456"
  const match = link.match(/lever\.co\/[^/]+\/([a-f0-9-]+)/i);
  return match ? match[1] : null;
}

/** Extract location from the Lever RSS item description. */
function extractLocation(description: string): string | null {
  // Lever often puts location in a categories block or as "Location: ..."
  const locMatch = description.match(/(?:location|office)[:\s]*([^<.\n,]+(?:,\s*[^<.\n]+)?)/i);
  return locMatch ? locMatch[1].trim() : null;
}

export const leverRssProvider: RssFeedProvider = {
  name: "lever_rss",
  displayName: "Lever RSS",
  type: "ats",

  buildFeedUrl(token?: string): string {
    if (!token) throw new Error("Lever RSS requires a company token");
    return `https://api.lever.co/v0/postings/${token}?mode=xml`;
  },

  normalize(item: RssItem, feedToken?: string): NormalizedRssJob {
    const atsId = extractLeverJobId(item.link);
    const jobSiteId = atsId ?? `rss-lv-${hashString(item.link)}`;

    return {
      jobSiteId,
      jobTitle: item.title,
      company: feedToken ?? "unknown",
      location: extractLocation(item.description),
      jobUrl: item.link || null,
      pubDate: item.pubDate ? new Date(item.pubDate).toISOString() : null,
      feedSource: "lever_rss",
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
