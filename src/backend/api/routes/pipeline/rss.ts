/**
 * @fileoverview RSS feed pipeline API routes.
 *
 * - POST /rss/scan         — Manual trigger (returns AggregatorResult)
 * - GET  /rss/feeds        — List configured feed sources + dedup catalog stats
 * - POST /rss/migrate-ids  — One-time migration to normalize prefixed job_site_id values
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { globalConfig } from "@/backend/db/schema";
import { runRssAggregator } from "@/backend/services/rss/aggregator";
import { getAllProviders } from "@/backend/services/rss/feeds";
import { getCatalogStats } from "@/backend/services/rss/dedup-catalog";
import { migrateJobSiteIds } from "@/backend/services/jobs/migrate-ids";

export const rssRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// POST /rss/scan — Manual trigger
// ---------------------------------------------------------------------------

rssRouter.openapi(
  createRoute({
    method: "post",
    path: "/rss/scan",
    operationId: "triggerRssScan",
    responses: {
      200: {
        description: "RSS scan completed",
        content: {
          "application/json": {
            schema: z.object({
              feedsProcessed: z.number(),
              feedsFailed: z.number(),
              jobsDiscovered: z.number(),
              jobsInserted: z.number(),
              jobsSkipped: z.number(),
              perFeed: z.array(
                z.object({
                  feedUrl: z.string(),
                  provider: z.string(),
                  jobCount: z.number(),
                  insertedCount: z.number(),
                  skippedCount: z.number(),
                  error: z.string().optional(),
                  latencyMs: z.number(),
                }),
              ),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const result = await runRssAggregator(c.env);
    return c.json(result, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /rss/feeds — List configured feeds + catalog stats
// ---------------------------------------------------------------------------

rssRouter.openapi(
  createRoute({
    method: "get",
    path: "/rss/feeds",
    operationId: "listRssFeeds",
    responses: {
      200: {
        description: "Configured RSS feed providers and their dedup catalog stats",
        content: {
          "application/json": {
            schema: z.object({
              providers: z.array(
                z.object({
                  name: z.string(),
                  displayName: z.string(),
                  type: z.string(),
                  catalogStats: z.object({
                    exists: z.boolean(),
                    totalIds: z.number(),
                    lastUpdated: z.string().nullable(),
                  }),
                }),
              ),
              config: z.object({
                greenhouse_tokens: z.array(z.string()),
                lever_tokens: z.array(z.string()),
                rss_industry_feeds: z.array(z.string()),
              }),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const r2 = c.env.R2_JOBS_BUCKET;
    const providers = getAllProviders();

    // Load config
    const db = getDb(c.env);
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

    // Get catalog stats for each provider
    const providerData = await Promise.all(
      providers.map(async (p) => {
        const stats = await getCatalogStats(r2, p.name);
        return {
          name: p.name,
          displayName: p.displayName,
          type: p.type,
          catalogStats: stats,
        };
      }),
    );

    return c.json({
      providers: providerData,
      config: {
        greenhouse_tokens: config.greenhouse_tokens ?? [],
        lever_tokens: config.lever_tokens ?? [],
        rss_industry_feeds: config.rss_industry_feeds ?? [
          "weworkremotely_programming",
          "weworkremotely_devops",
          "remotive",
        ],
      },
    }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /rss/migrate-ids — One-time jobSiteId normalization
// ---------------------------------------------------------------------------

rssRouter.openapi(
  createRoute({
    method: "post",
    path: "/rss/migrate-ids",
    operationId: "migrateJobSiteIds",
    description: "One-time migration to strip pipeline prefixes (gh-{token}-, lv-{token}-, as-{token}-) from existing job_site_id values. Safe to run multiple times.",
    responses: {
      200: {
        description: "Migration completed",
        content: {
          "application/json": {
            schema: z.object({
              totalRows: z.number(),
              rowsNeedingUpdate: z.number(),
              rowsUpdated: z.number(),
              duplicatesResolved: z.number(),
              errors: z.array(z.string()),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const result = await migrateJobSiteIds(c.env);
    return c.json(result, 200);
  },
);
