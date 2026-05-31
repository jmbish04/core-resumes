/**
 * @fileoverview RSS feed connectivity health check.
 *
 * Probes each configured RSS feed URL to validate:
 * - The URL returns a 200 OK status
 * - The response contains valid `<item>` or `<entry>` elements
 * - Reports latency and item count per feed
 */

import { eq } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { globalConfig } from "@/backend/db/schema";
import type { HealthStepResult } from "@/backend/health/types";
import { getAtsFeedProviders, getIndustryFeedProviders } from "@/backend/services/rss/feeds";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeedProbeResult {
  url: string;
  provider: string;
  status: "ok" | "warn" | "fail";
  itemCount: number;
  latencyMs: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function checkRssFeeds(env: Env): Promise<HealthStepResult> {
  const start = Date.now();

  // Load config for ATS tokens
  const db = getDb(env);
  let config: any = {};
  try {
    const [row] = await db
      .select({ value: globalConfig.value })
      .from(globalConfig)
      .where(eq(globalConfig.key, "health_check_config"))
      .limit(1);
    if (row?.value) {
      config = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    }
  } catch {
    // Use empty defaults
  }

  // Build probe targets — one URL per ATS token + all enabled industry feeds
  const probeTargets: Array<{ provider: string; url: string }> = [];

  for (const p of getAtsFeedProviders()) {
    let tokens: string[] = [];
    if (p.name === "greenhouse_rss") tokens = config.greenhouse_tokens ?? [];
    else if (p.name === "lever_rss") tokens = config.lever_tokens ?? [];

    // Only probe first token per ATS provider (health check, not full scan)
    if (tokens.length > 0) {
      try {
        probeTargets.push({ provider: p.name, url: p.buildFeedUrl(tokens[0]) });
      } catch {
        // Invalid token
      }
    }
  }

  const enabledIndustry = new Set(config.rss_industry_feeds ?? [
    "weworkremotely_programming",
    "weworkremotely_devops",
    "remotive",
  ]);

  for (const p of getIndustryFeedProviders()) {
    if (enabledIndustry.has(p.name)) {
      probeTargets.push({ provider: p.name, url: p.buildFeedUrl() });
    }
  }

  if (probeTargets.length === 0) {
    return {
      status: "skipped",
      latencyMs: Date.now() - start,
      details: { message: "No RSS feeds configured" },
    };
  }

  // Probe all feeds in parallel with a 5s timeout
  const results = await Promise.allSettled(
    probeTargets.map(async (target): Promise<FeedProbeResult> => {
      const probeStart = Date.now();
      try {
        const res = await fetch(target.url, {
          signal: AbortSignal.timeout(5_000),
          headers: {
            "User-Agent": "CoreResumes-HealthCheck/1.0",
            Accept: "application/rss+xml, application/xml, text/xml",
          },
        });

        if (!res.ok) {
          return {
            url: target.url,
            provider: target.provider,
            status: "fail",
            itemCount: 0,
            latencyMs: Date.now() - probeStart,
            error: `HTTP ${res.status}`,
          };
        }

        const xml = await res.text();
        const itemCount = (xml.match(/<item[\s>]/gi) || xml.match(/<entry[\s>]/gi) || []).length;

        return {
          url: target.url,
          provider: target.provider,
          status: itemCount > 0 ? "ok" : "warn",
          itemCount,
          latencyMs: Date.now() - probeStart,
          error: itemCount === 0 ? "Feed returned 0 items" : undefined,
        };
      } catch (err) {
        return {
          url: target.url,
          provider: target.provider,
          status: "fail",
          itemCount: 0,
          latencyMs: Date.now() - probeStart,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );

  // Aggregate
  const feedResults: FeedProbeResult[] = [];
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (const r of results) {
    if (r.status === "fulfilled") {
      feedResults.push(r.value);
      if (r.value.status === "ok") passCount++;
      else if (r.value.status === "warn") warnCount++;
      else failCount++;
    } else {
      failCount++;
      feedResults.push({
        url: "unknown",
        provider: "unknown",
        status: "fail",
        itemCount: 0,
        latencyMs: 0,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  }

  const overallStatus = failCount > 0 ? "fail" : warnCount > 0 ? "warn" : "ok";

  return {
    status: overallStatus,
    latencyMs: Date.now() - start,
    error: failCount > 0 ? `${failCount}/${probeTargets.length} RSS feeds failed` : undefined,
    details: {
      feeds: feedResults,
      feedCount: probeTargets.length,
      passCount,
      warnCount,
      failCount,
    },
  };
}
