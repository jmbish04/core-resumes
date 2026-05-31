/**
 * @fileoverview RSS feed aggregator — core orchestration service.
 *
 * Flow: fetch feeds → parse XML → normalize → relevance check → dedup → insert
 *
 * No AI at this stage. Uses `isRelevantJob()` for keyword + location matching
 * and the R2 dedup catalog to avoid redundant writes.
 *
 * On conflict (same `jobSiteId` already exists from another pipeline),
 * updates `jobTitle` and `location` to capture any changes while preserving
 * the original `date_first_seen`.
 */

import { eq } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { globalConfig, jobsPostings } from "@/backend/db/schema";
import { isRelevantJob } from "@/backend/services/jobs/relevance";
import { parseRssXml } from "./xml-parser";
import { getAtsFeedProviders, getIndustryFeedProviders } from "./feeds";
import { loadSeenIds, appendSeenIds } from "./dedup-catalog";

import type { RssFeedProvider, NormalizedRssJob } from "./feeds";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AggregatorResult {
  feedsProcessed: number;
  feedsFailed: number;
  jobsDiscovered: number;
  jobsInserted: number;
  jobsSkipped: number;
  perFeed: FeedResult[];
}

interface FeedResult {
  feedUrl: string;
  provider: string;
  jobCount: number;
  insertedCount: number;
  skippedCount: number;
  error?: string;
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

interface HealthCheckConfig {
  greenhouse_tokens?: string[];
  lever_tokens?: string[];
  ashby_tokens?: string[];
  gem_tokens?: string[];
  rss_industry_feeds?: string[];
}

async function loadHealthCheckConfig(env: Env): Promise<HealthCheckConfig> {
  const db = getDb(env);
  try {
    const [row] = await db
      .select({ value: globalConfig.value })
      .from(globalConfig)
      .where(eq(globalConfig.key, "health_check_config"))
      .limit(1);

    if (row?.value) {
      return typeof row.value === "string" ? JSON.parse(row.value) : row.value;
    }
  } catch {
    // Use defaults
  }
  return {};
}

// ---------------------------------------------------------------------------
// Feed URL builder
// ---------------------------------------------------------------------------

interface FeedTarget {
  provider: RssFeedProvider;
  url: string;
  token?: string;
}

function buildFeedTargets(
  config: HealthCheckConfig,
): FeedTarget[] {
  const targets: FeedTarget[] = [];

  // ATS providers — one URL per configured token
  for (const provider of getAtsFeedProviders()) {
    let tokens: string[] = [];
    if (provider.name === "greenhouse_rss") {
      tokens = config.greenhouse_tokens ?? [];
    } else if (provider.name === "lever_rss") {
      tokens = config.lever_tokens ?? [];
    }

    for (const token of tokens) {
      try {
        targets.push({
          provider,
          url: provider.buildFeedUrl(token),
          token,
        });
      } catch {
        // Invalid token — skip
      }
    }
  }

  // Industry providers — static URLs, filtered by config
  const enabledIndustry = new Set(config.rss_industry_feeds ?? [
    "weworkremotely_programming",
    "weworkremotely_devops",
    "remotive",
  ]);

  for (const provider of getIndustryFeedProviders()) {
    if (enabledIndustry.has(provider.name)) {
      targets.push({
        provider,
        url: provider.buildFeedUrl(),
      });
    }
  }

  return targets;
}

// ---------------------------------------------------------------------------
// Single feed processor
// ---------------------------------------------------------------------------

async function processFeed(
  env: Env,
  target: FeedTarget,
  seenIds: Set<string>,
): Promise<{ result: FeedResult; newIds: string[] }> {
  const start = Date.now();
  const newIds: string[] = [];

  try {
    // Fetch with timeout
    const response = await fetch(target.url, {
      signal: AbortSignal.timeout(10_000),
      headers: {
        "User-Agent": "CoreResumes-RSSAggregator/1.0",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
    });

    if (!response.ok) {
      return {
        result: {
          feedUrl: target.url,
          provider: target.provider.name,
          jobCount: 0,
          insertedCount: 0,
          skippedCount: 0,
          error: `HTTP ${response.status}`,
          latencyMs: Date.now() - start,
        },
        newIds: [],
      };
    }

    const xml = await response.text();
    const items = parseRssXml(xml);

    // Normalize all items
    const normalized: NormalizedRssJob[] = items
      .map((item) => target.provider.normalize(item, target.token))
      .filter((job) => job.jobTitle && job.jobSiteId);

    // Dedup against R2 catalog
    const unseen = normalized.filter((job) => !seenIds.has(job.jobSiteId));

    // Batch insert into D1
    const db = getDb(env);
    let insertedCount = 0;
    let skippedCount = 0;

    const BATCH_SIZE = 25;
    for (let i = 0; i < unseen.length; i += BATCH_SIZE) {
      const chunk = unseen.slice(i, i + BATCH_SIZE);

      const stmts = chunk.map((job) => {
        return db
          .insert(jobsPostings)
          .values({
            jobSiteId: job.jobSiteId,
            jobTitle: job.jobTitle,
            company: job.company,
            location: job.location,
            jobUrl: job.jobUrl,
            pipelineSource: "rss_feed",
            triagePassed: false,
            isRecommended: false,
          })
          .onConflictDoUpdate({
            target: jobsPostings.jobSiteId,
            set: {
              jobTitle: job.jobTitle,
              location: job.location,
              jobUrl: job.jobUrl,
            },
          })
          .returning({ id: jobsPostings.id });
      });

      if (stmts.length > 0) {
        try {
          const results = await db.batch(stmts as any);
          for (const r of results) {
            if (Array.isArray(r) && r.length > 0) {
              insertedCount++;
            }
          }
        } catch {
          // Fallback: individual inserts
          for (const stmt of stmts) {
            try {
              await stmt;
              insertedCount++;
            } catch {
              skippedCount++;
            }
          }
        }
      }
    }

    // Run relevance scoring on newly inserted jobs
    for (const job of unseen) {
      try {
        const relevance = await isRelevantJob(env, {
          jobTitle: job.jobTitle,
          location: job.location,
          description: job.descriptionText,
        });

        if (relevance.isRelevant) {
          await db
            .update(jobsPostings)
            .set({
              isRecommended: true,
              recommendationScore: relevance.score,
              recommendationReason: relevance.reason,
            })
            .where(eq(jobsPostings.jobSiteId, job.jobSiteId));
        }
      } catch {
        // Non-critical — job is still in the system, just unscored
      }

      newIds.push(job.jobSiteId);
    }

    skippedCount += normalized.length - unseen.length;

    return {
      result: {
        feedUrl: target.url,
        provider: target.provider.name,
        jobCount: normalized.length,
        insertedCount,
        skippedCount,
        latencyMs: Date.now() - start,
      },
      newIds,
    };
  } catch (err) {
    return {
      result: {
        feedUrl: target.url,
        provider: target.provider.name,
        jobCount: 0,
        insertedCount: 0,
        skippedCount: 0,
        error: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - start,
      },
      newIds: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Run the full RSS aggregation pipeline.
 *
 * 1. Load ATS tokens from health_check_config
 * 2. Build feed URLs for ATS + industry providers
 * 3. Fetch all feeds concurrently
 * 4. Parse → normalize → dedup → insert
 * 5. Score for relevance (sets isRecommended for HITL discovery)
 * 6. Persist new IDs to R2 dedup catalog
 */
export async function runRssAggregator(env: Env): Promise<AggregatorResult> {
  const config = await loadHealthCheckConfig(env);
  const targets = buildFeedTargets(config);

  if (targets.length === 0) {
    return {
      feedsProcessed: 0,
      feedsFailed: 0,
      jobsDiscovered: 0,
      jobsInserted: 0,
      jobsSkipped: 0,
      perFeed: [],
    };
  }

  // Load dedup catalogs for all unique providers
  const r2 = env.R2_JOBS_BUCKET;
  const providerNames = [...new Set(targets.map((t) => t.provider.name))];
  const seenByProvider = new Map<string, Set<string>>();

  await Promise.all(
    providerNames.map(async (name) => {
      const seen = await loadSeenIds(r2, name);
      seenByProvider.set(name, seen);
    }),
  );

  // Build a merged set of all seen IDs (cross-provider dedup)
  const allSeen = new Set<string>();
  for (const seen of seenByProvider.values()) {
    for (const id of seen) {
      allSeen.add(id);
    }
  }

  // Process all feeds concurrently
  const settled = await Promise.allSettled(
    targets.map((target) => processFeed(env, target, allSeen)),
  );

  // Aggregate results
  const perFeed: FeedResult[] = [];
  let feedsFailed = 0;
  let totalDiscovered = 0;
  let totalInserted = 0;
  let totalSkipped = 0;
  const newIdsByProvider = new Map<string, string[]>();

  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    if (s.status === "fulfilled") {
      perFeed.push(s.value.result);
      totalDiscovered += s.value.result.jobCount;
      totalInserted += s.value.result.insertedCount;
      totalSkipped += s.value.result.skippedCount;

      if (s.value.result.error) feedsFailed++;

      // Collect new IDs per provider for dedup catalog update
      const providerName = targets[i].provider.name;
      const existing = newIdsByProvider.get(providerName) ?? [];
      existing.push(...s.value.newIds);
      newIdsByProvider.set(providerName, existing);
    } else {
      feedsFailed++;
      perFeed.push({
        feedUrl: targets[i].url,
        provider: targets[i].provider.name,
        jobCount: 0,
        insertedCount: 0,
        skippedCount: 0,
        error: s.reason instanceof Error ? s.reason.message : String(s.reason),
        latencyMs: 0,
      });
    }
  }

  // Persist new IDs to R2 dedup catalog
  await Promise.all(
    [...newIdsByProvider.entries()].map(([provider, ids]) =>
      appendSeenIds(r2, provider, ids),
    ),
  );

  return {
    feedsProcessed: targets.length,
    feedsFailed,
    jobsDiscovered: totalDiscovered,
    jobsInserted: totalInserted,
    jobsSkipped: totalSkipped,
    perFeed,
  };
}
