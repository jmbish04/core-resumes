/**
 * @fileoverview WeWorkRemotely RSS feed provider.
 *
 * URLs:
 *  - Programming: https://weworkremotely.com/categories/remote-programming-jobs.rss
 *  - DevOps:      https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss
 *
 * Feed format: RSS 2.0
 * Title format: "Company Name: Job Title" (split on first colon)
 */

import type { RssItem } from "../xml-parser";
import type { NormalizedRssJob, RssFeedProvider } from "./types";

const FEED_URLS: Record<string, string> = {
  programming: "https://weworkremotely.com/categories/remote-programming-jobs.rss",
  devops: "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss",
};

/** Parse "Company: Title" format used by WeWorkRemotely. */
function parseWwrTitle(rawTitle: string): { company: string; title: string } {
  const colonIndex = rawTitle.indexOf(":");
  if (colonIndex > 0) {
    return {
      company: rawTitle.slice(0, colonIndex).trim(),
      title: rawTitle.slice(colonIndex + 1).trim(),
    };
  }
  return { company: "Unknown", title: rawTitle.trim() };
}

/** Extract a stable ID from the WWR posting URL. */
function extractWwrId(link: string): string {
  // https://weworkremotely.com/remote-jobs/company-job-title-slug → slug
  const match = link.match(/remote-jobs\/(.+)/);
  return match ? match[1] : `rss-wwr-${hashString(link)}`;
}

function createWwrProvider(category: string): RssFeedProvider {
  return {
    name: `weworkremotely_${category}`,
    displayName: `WeWorkRemotely (${category})`,
    type: "industry",

    buildFeedUrl(): string {
      const url = FEED_URLS[category];
      if (!url) throw new Error(`Unknown WWR category: ${category}`);
      return url;
    },

    normalize(item: RssItem): NormalizedRssJob {
      const { company, title } = parseWwrTitle(item.title);
      const jobSiteId = extractWwrId(item.link);

      return {
        jobSiteId,
        jobTitle: title,
        company,
        location: "Remote",
        jobUrl: item.link || null,
        pubDate: item.pubDate ? new Date(item.pubDate).toISOString() : null,
        feedSource: `weworkremotely_${category}`,
        descriptionText: item.description,
      };
    },
  };
}

export const wwrProgrammingProvider = createWwrProvider("programming");
export const wwrDevopsProvider = createWwrProvider("devops");

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
