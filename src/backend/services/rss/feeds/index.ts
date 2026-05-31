/**
 * @fileoverview RSS feed provider registry — barrel export.
 *
 * To add a new RSS feed provider:
 * 1. Create `{name}.ts` in this directory implementing `RssFeedProvider`
 * 2. Import it here and add to `RSS_FEED_PROVIDERS`
 *
 * That's it. The aggregator and health checks will automatically pick it up.
 */

import type { RssFeedProvider } from "./types";

import { greenhouseRssProvider } from "./greenhouse-rss";
import { leverRssProvider } from "./lever-rss";
import { wwrProgrammingProvider, wwrDevopsProvider } from "./weworkremotely";
import { remotiveProvider } from "./remotive";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const RSS_FEED_PROVIDERS: RssFeedProvider[] = [
  // ATS providers — generate per-company feed URLs from board tokens
  greenhouseRssProvider,
  leverRssProvider,

  // Industry feeds — static URLs, no token needed
  wwrProgrammingProvider,
  wwrDevopsProvider,
  remotiveProvider,
];

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

/** Get only ATS-type providers (require a board token). */
export function getAtsFeedProviders(): RssFeedProvider[] {
  return RSS_FEED_PROVIDERS.filter((p) => p.type === "ats");
}

/** Get only industry-type providers (static URLs). */
export function getIndustryFeedProviders(): RssFeedProvider[] {
  return RSS_FEED_PROVIDERS.filter((p) => p.type === "industry");
}

/** Get all registered providers. */
export function getAllProviders(): RssFeedProvider[] {
  return [...RSS_FEED_PROVIDERS];
}

/** Look up a provider by name. */
export function getProviderByName(name: string): RssFeedProvider | undefined {
  return RSS_FEED_PROVIDERS.find((p) => p.name === name);
}

// Re-export types
export type { RssFeedProvider, NormalizedRssJob } from "./types";
