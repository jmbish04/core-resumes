/**
 * @fileoverview API Companies route for syncing upstream aggregator tokens.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getAgentByName } from "agents";
import { eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { apiCompanies, apiCompanySyncStats, jobsPostings, syncRunEvents } from "@/backend/db/schema";
import { getGithubToken } from "@/backend/utils/secrets";
import { Logger } from "@/backend/lib/logger";
import { normalizeJobSiteId } from "@/backend/services/jobs/normalize-id";

import { syncApiCompaniesBody, syncProgressBody, syncRunEventSchema, syncStatsWithMetaSchema } from "./types";

/**
 * GitHub repository the worker dispatches sync runs to.
 *
 * Centralised here so swapping the upstream (e.g. fork, staging, contributor
 * branch) is a one-line change. When this needs to differ per environment,
 * promote to an `env.GITHUB_DISPATCH_REPO` var in `wrangler.jsonc`.
 */
const GITHUB_DISPATCH_REPO = "jmbish04/core-resumes";

export const apiCompaniesRouter = new OpenAPIHono<{ Bindings: Env }>();

/**
 * POST /api-companies/sync — Sync companies from an upstream source (github aggregator).
 */
apiCompaniesRouter.openapi(
  createRoute({
    method: "post",
    path: "/api-companies/sync",
    operationId: "syncApiCompanies",
    request: {
      body: { content: { "application/json": { schema: syncApiCompaniesBody } } },
    },
    responses: {
      200: {
        description: "Sync results",
        content: {
          "application/json": {
            schema: z.object({
              inserted: z.number(),
              deactivated: z.number(),
              reactivated: z.number(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const body = c.req.valid("json");
    const upstreamTokens = body.companies;
    const now = new Date();
    const logger = new Logger(c.env);

    if (upstreamTokens.length === 0) {
      return c.json({ inserted: 0, deactivated: 0, reactivated: 0 }, 200);
    }

    // D1 caps bound parameters at 100 per query.
    // Setting INSERT_CHUNK to 10 keeps maximum parameters at 70 (10 * 7) for inserts.
    // Setting UPDATE_CHUNK to 90 keeps update parameter allocations well below the 100 limit (90 + 2).
    const INSERT_CHUNK = 10;
    const UPDATE_CHUNK = 90;
    const upstreamSet = new Set(upstreamTokens.map((t) => t.token));

    try {
      const existingTokenSet = new Set<string>();
      const toReactivateIds: number[] = [];

      // 1. Query D1 in selective, parameter-safe chunks of 2,000 matching tokens
      // using raw SQL IN-list to bypass the 100-parameter cap while avoiding OOM.
      const SELECT_CHUNK = 2000;
      for (let i = 0; i < upstreamTokens.length; i += SELECT_CHUNK) {
        const chunk = upstreamTokens.slice(i, i + SELECT_CHUNK);
        const tokensInChunk = chunk.map((t) => t.token);

        // Sanitize and escape single quotes to prevent any SQL injection,
        // then build a raw comma-separated list of quoted string literals.
        const sqlChunk = tokensInChunk
          .map((t) => `'${t.replace(/'/g, "''")}'`)
          .join(",");

        const dbMatches = await db
          .select({
            id: apiCompanies.id,
            token: apiCompanies.jobBoardToken,
            isActive: apiCompanies.isActive,
          })
          .from(apiCompanies)
          .where(sql`job_board_token IN (${sql.raw(sqlChunk)})`);

        for (const match of dbMatches) {
          existingTokenSet.add(match.token);
          if (!match.isActive) {
            toReactivateIds.push(match.id);
          }
        }
      }

      // 2. Load ONLY token and id of active companies to compute deactivations in a memory-light Set comparison
      const activeCompanies = await db
        .select({
          id: apiCompanies.id,
          token: apiCompanies.jobBoardToken,
        })
        .from(apiCompanies)
        .where(eq(apiCompanies.isActive, true));

      const toDeactivateIds = activeCompanies
        .filter((c) => !upstreamSet.has(c.token))
        .map((c) => c.id);

      const newTokens = upstreamTokens.filter((t) => !existingTokenSet.has(t.token));

      let deactivatedCount = 0;
      for (let i = 0; i < toDeactivateIds.length; i += UPDATE_CHUNK) {
        const chunk = toDeactivateIds.slice(i, i + UPDATE_CHUNK);
        const rows = await db
          .update(apiCompanies)
          .set({ isActive: false, timestampInactive: now })
          .where(inArray(apiCompanies.id, chunk))
          .returning({ id: apiCompanies.id });
        deactivatedCount += rows.length;
      }

      let reactivatedCount = 0;
      for (let i = 0; i < toReactivateIds.length; i += UPDATE_CHUNK) {
        const chunk = toReactivateIds.slice(i, i + UPDATE_CHUNK);
        const rows = await db
          .update(apiCompanies)
          .set({ isActive: true, timestampInactive: null })
          .where(inArray(apiCompanies.id, chunk))
          .returning({ id: apiCompanies.id });
        reactivatedCount += rows.length;
      }

      let insertedCount = 0;
      const INSERT_BATCH_SIZE = 50;
      for (let i = 0; i < newTokens.length; i += INSERT_BATCH_SIZE) {
        const chunk = newTokens.slice(i, i + INSERT_BATCH_SIZE);
        const insertStmts = chunk.map((t) =>
          db
            .insert(apiCompanies)
            .values({
              jobBoardToken: t.token,
              system: t.system,
              source: t.source,
              isActive: true,
              timestampAdded: now,
              isRecommended: t.isRecommended ?? false,
              recommendationReason: t.recommendationReason ?? null,
            })
            .onConflictDoNothing()
            .returning({ id: apiCompanies.id })
        );

        if (insertStmts.length > 0) {
          const results = await db.batch(insertStmts as any);
          insertedCount += results.filter((r) => Array.isArray(r) && r.length > 0).length;
        }
      }

      // Update recommendation status for recommended companies in the sync payload
      const recommendedTokens = upstreamTokens.filter((t) => t.isRecommended);
      for (let i = 0; i < recommendedTokens.length; i += UPDATE_CHUNK) {
        const chunk = recommendedTokens.slice(i, i + UPDATE_CHUNK);
        for (const t of chunk) {
          await db
            .update(apiCompanies)
            .set({
              isRecommended: true,
              recommendationReason: t.recommendationReason || null,
            })
            .where(eq(apiCompanies.jobBoardToken, t.token));
        }
      }

      // Extract all recommended jobs from the payload
      const allRecommendedJobs: {
        jobSiteId: string;
        jobTitle: string;
        company: string;
        location: string | null;
        triagePassed: boolean;
        triageReason: string;
      }[] = [];

      for (const t of upstreamTokens) {
        if (t.recommendedJobs && t.recommendedJobs.length > 0) {
          for (const job of t.recommendedJobs) {
            allRecommendedJobs.push({
              jobSiteId: job.id.toString(),
              jobTitle: job.title,
              company: t.token,
              location: job.location || null,
              triagePassed: true,
              triageReason: `Discovered and matched during aggregator sync: '${job.title}' in '${job.location}'`,
            });
          }
        }
      }

      // Batch insert the recommended jobs into the database
      let jobsInserted = 0;
      const JOB_BATCH_SIZE = 50;
      for (let i = 0; i < allRecommendedJobs.length; i += JOB_BATCH_SIZE) {
        const chunk = allRecommendedJobs.slice(i, i + JOB_BATCH_SIZE);
        const insertStmts = chunk.map((job) =>
          db
            .insert(jobsPostings)
            .values({
              jobSiteId: normalizeJobSiteId(job.jobSiteId),
              jobTitle: job.jobTitle,
              company: job.company,
              location: job.location,
              triagePassed: job.triagePassed,
              triageReason: job.triageReason,
              pipelineSource: "github_dataset",
            })
            .onConflictDoNothing()
            .returning({ id: jobsPostings.id })
        );

        if (insertStmts.length > 0) {
          const results = await db.batch(insertStmts as any);
          jobsInserted += results.filter((r) => Array.isArray(r) && r.length > 0).length;
        }
      }

      if (jobsInserted > 0) {
        await logger.info(`[Aggregator Sync] Automatically processed and saved ${jobsInserted} matching jobs into the system.`, {
          status: "completed",
          jobsAdded: jobsInserted,
        });
      }

      await db.insert(apiCompanySyncStats).values({
        runTimestamp: now,
        filesProcessed: 0,
        companiesAdded: insertedCount,
        companiesDeactivated: deactivatedCount,
        companiesReactivated: reactivatedCount,
        status: "success",
      });

      await logger.info(
        "[Aggregator Sync Completed] Discovered and processed company records in D1.",
        {
          status: "completed",
          added: insertedCount,
          deactivated: deactivatedCount,
          reactivated: reactivatedCount,
        },
      );

      return c.json(
        {
          inserted: insertedCount,
          deactivated: deactivatedCount,
          reactivated: reactivatedCount,
        },
        200,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logger.error(`[Aggregator Sync Failed] ${message}`, {
        status: "failed",
        upstreamCount: upstreamTokens.length,
      });
      await db
        .insert(apiCompanySyncStats)
        .values({
          runTimestamp: now,
          filesProcessed: 0,
          companiesAdded: 0,
          companiesDeactivated: 0,
          companiesReactivated: 0,
          status: "failed",
          error: message,
        })
        .catch(() => {});
      throw err;
    }
  },
);

/**
 * GET /api-companies/sync-stats — List historical sync stats.
 */
apiCompaniesRouter.openapi(
  createRoute({
    method: "get",
    path: "/api-companies/sync-stats",
    operationId: "getApiCompaniesSyncStats",
    responses: {
      200: {
        description: "List of sync stats with event metadata",
        content: {
          "application/json": {
            schema: z.object({
              stats: z.array(syncStatsWithMetaSchema),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const stats = await db
      .select()
      .from(apiCompanySyncStats)
      .orderBy(apiCompanySyncStats.runTimestamp)
      .limit(50);

    // reverse to get desc
    stats.reverse();

    // Enrich each run with event metadata
    const enriched = await Promise.all(
      stats.map(async (s) => {
        // Count events and compute duration from first to last event
        const events = await db
          .select({
            id: syncRunEvents.id,
            createdAt: syncRunEvents.createdAt,
          })
          .from(syncRunEvents)
          .where(eq(syncRunEvents.syncStatsId, s.id))
          .orderBy(syncRunEvents.createdAt);

        let durationMs: number | null = null;
        if (events.length >= 2) {
          const first = events[0].createdAt instanceof Date
            ? events[0].createdAt.getTime()
            : new Date(events[0].createdAt as unknown as number).getTime();
          const last = events[events.length - 1].createdAt instanceof Date
            ? events[events.length - 1].createdAt.getTime()
            : new Date(events[events.length - 1].createdAt as unknown as number).getTime();
          durationMs = last - first;
        }

        return {
          id: s.id,
          runTimestamp:
            s.runTimestamp instanceof Date
              ? s.runTimestamp.toISOString()
              : String(s.runTimestamp),
          filesProcessed: s.filesProcessed,
          companiesAdded: s.companiesAdded,
          companiesDeactivated: s.companiesDeactivated,
          companiesReactivated: s.companiesReactivated,
          status: s.status,
          error: s.error ?? null,
          durationMs,
          eventsCount: events.length,
        };
      })
    );

    return c.json({ stats: enriched }, 200);
  },
);

/**
 * GET /api-companies — List active upstream companies.
 */
apiCompaniesRouter.openapi(
  createRoute({
    method: "get",
    path: "/api-companies",
    operationId: "listApiCompanies",
    responses: {
      200: {
        description: "List of API Companies",
        content: {
          "application/json": {
            schema: z.object({
              companies: z.array(
                z.object({
                  id: z.number(),
                  name: z.string().nullable(),
                  jobBoardToken: z.string(),
                  system: z.string(),
                  isActive: z.boolean(),
                  isRecommended: z.boolean(),
                  recommendationReason: z.string().nullable(),
                }),
              ),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const companies = await db
      .select({
        id: apiCompanies.id,
        name: apiCompanies.name,
        jobBoardToken: apiCompanies.jobBoardToken,
        system: apiCompanies.system,
        isActive: apiCompanies.isActive,
        isRecommended: apiCompanies.isRecommended,
        recommendationReason: apiCompanies.recommendationReason,
      })
      .from(apiCompanies)
      .where(eq(apiCompanies.isActive, true))
      .orderBy(apiCompanies.jobBoardToken);

    return c.json({ companies }, 200);
  },
);

/**
 * POST /api-companies/trigger-sync — Trigger GitHub Action for synchronization
 */
apiCompaniesRouter.openapi(
  createRoute({
    method: "post",
    path: "/api-companies/trigger-sync",
    operationId: "triggerApiCompaniesSync",
    responses: {
      200: { description: "Triggered successfully" },
      500: { description: "Server Error" },
    },
  }),
  async (c) => {
    const logger = new Logger(c.env);
    const token = await getGithubToken(c.env);
    if (!token) {
      await logger.error("[Aggregator Sync Trigger] Failed: GITHUB_PERSONAL_ACCESS_TOKEN is missing in secret store.");
      return c.json({ error: "Missing GITHUB_PERSONAL_ACCESS_TOKEN" }, 500);
    }

    // Call GitHub API to trigger repository dispatch
    await logger.info("[Aggregator Sync Trigger] Dispatching repository_dispatch to upstream GitHub repo...", {
      repo: GITHUB_DISPATCH_REPO,
      event_type: "trigger-sync"
    });

    const res = await fetch(`https://api.github.com/repos/${GITHUB_DISPATCH_REPO}/dispatches`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github.v3+json",
        Authorization: `token ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "Core-Resumes-Worker",
      },
      body: JSON.stringify({
        event_type: "trigger-sync",
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      await logger.error(`[Aggregator Sync Trigger] GitHub Action trigger failed: HTTP ${res.status}`, {
        status: res.status,
        response: errText
      });
      return c.json({ error: `GitHub API error: ${res.status} ${errText}` }, 500);
    }

    // Verification Phase: Verify that GitHub Actions successfully registered the dispatch 
    // and spawned a workflow run.
    await logger.info("[Aggregator Sync Trigger] Verifying repository dispatch registered on GitHub Actions...");

    let workflowRunFound = false;
    let recentRun: any = null;
    const now = new Date();

    // Poll the GitHub runs API up to 2 times with a 1.5s delay to allow GitHub to register the dispatch event
    for (let attempt = 1; attempt <= 6; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1500));

      try {
        const runsRes = await fetch(`https://api.github.com/repos/${GITHUB_DISPATCH_REPO}/actions/runs?event=repository_dispatch&per_page=5`, {
          method: "GET",
          headers: {
            Accept: "application/vnd.github.v3+json",
            Authorization: `token ${token}`,
            "User-Agent": "Core-Resumes-Worker",
          },
        });

        if (runsRes.ok) {
          const data: any = await runsRes.json();
          const runs = data.workflow_runs || [];
          
          // Find a run triggered by repository_dispatch that was created within the last 45 seconds
          recentRun = runs.find((run: any) => {
            const createdAt = new Date(run.created_at);
            const diffMs = Math.abs(now.getTime() - createdAt.getTime());
            return diffMs < 45000; // 45 seconds threshold
          });

          if (recentRun) {
            workflowRunFound = true;
            break;
          }
        }
      } catch (e) {
        // Log query failure but continue polling attempts
        await logger.warn(`[Aggregator Sync Trigger] Poll attempt #${attempt} failed: ${String(e)}`);
      }
    }

    if (!workflowRunFound || !recentRun) {
      const dispatchError = "GitHub Action dispatch failed to spawn a workflow run. " + 
        "Please check if the sync workflow configuration is committed under .github/workflows/ and has the trigger-sync repository_dispatch event.";
      await logger.error(`[Aggregator Sync Trigger] ${dispatchError}`, {
        status: "failed",
      });
      return c.json({ error: dispatchError }, 500);
    }

    await logger.info(`[Aggregator Sync Trigger] GitHub Action sync successfully dispatched and validated!`, {
      status: "dispatching",
      message: `Verified workflow run #${recentRun.run_number} is spawned (Status: ${recentRun.status}). Run URL: ${recentRun.html_url}`,
    });

    return c.json({ success: true, runId: recentRun.id, runUrl: recentRun.html_url }, 200);
  },
);

/**
 * Map sync-progress status values to workflow step numbers.
 * Mirrors the frontend stepper logic in PipelineOperations.tsx.
 */
function statusToStepNumber(status: string): number | null {
  switch (status) {
    case "dispatching":
    case "trigger-sync":
      return 1;
    case "initializing":
    case "fetching_upstream":
    case "fetching":
    case "loading_sources":
      return 2;
    case "scraping":
    case "parsing":
    case "processing":
    case "mapping":
      return 3;
    case "saving_db":
    case "ingesting":
    case "writing_d1":
    case "updating_database":
      return 4;
    case "completed":
    case "success":
    case "failed":
    case "error":
    case "salary_sync":
    case "salary_sync_complete":
    case "salary_sync_failed":
      return 5;
    default:
      return null;
  }
}

/**
 * Classify a sync-progress status into an event type.
 */
function statusToEventType(status: string): string {
  if (status === "completed" || status === "success" || status === "salary_sync_complete") return "completed";
  if (status === "failed" || status === "error" || status === "salary_sync_failed") return "failed";
  if (status === "dispatching" || status === "trigger-sync" || status === "initializing") return "step_start";
  return "progress";
}

/**
 * POST /api-companies/sync-progress — Receive progress from GitHub action script,
 * persist to D1, and fan out to all connected Pipeline dashboard WebSocket clients
 * via SyncBroadcastAgent (dedicated Agent DO for broadcasting).
 */
apiCompaniesRouter.openapi(
  createRoute({
    method: "post",
    path: "/api-companies/sync-progress",
    operationId: "apiCompaniesSyncProgress",
    request: {
      body: { content: { "application/json": { schema: syncProgressBody } } },
    },
    responses: {
      200: { description: "Progress received" },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const logger = new Logger(c.env);
    const db = getDb(c.env);

    const logMetadata = {
      status: body.status,
      current: body.current ?? undefined,
      total: body.total ?? undefined,
      message: body.message ?? undefined,
    };

    const logMessage = body.message || `Sync progress update: ${body.status}`;

    if (body.status === "failed" || body.status === "error") {
      await logger.error(logMessage, logMetadata);
    } else {
      await logger.info(logMessage, logMetadata);
    }

    // Persist event to D1 for historical reconstruction.
    // Find the most recent in-progress sync stats row to link the event.
    let syncStatsId: number | null = null;
    try {
      const recentStats = await db
        .select({ id: apiCompanySyncStats.id })
        .from(apiCompanySyncStats)
        .orderBy(sql`id DESC`)
        .limit(1);

      if (recentStats.length > 0) {
        syncStatsId = recentStats[0].id;
      }
    } catch {
      // Non-critical — event still gets persisted without the FK
    }

    try {
      await db.insert(syncRunEvents).values({
        syncStatsId,
        eventType: statusToEventType(body.status),
        stepNumber: statusToStepNumber(body.status),
        status: body.status,
        message: body.message ?? null,
        current: body.current ?? null,
        total: body.total ?? null,
      });
    } catch (e) {
      await logger.warn(
        `[Aggregator Sync Progress] Failed to persist event to D1: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }

    // Fan out to every open Pipeline dashboard WebSocket via SyncBroadcastAgent.
    // Failures here must not 500 the GitHub Action — log and swallow.
    try {
      const agent = (await getAgentByName(c.env.SYNC_BROADCAST_AGENT as any, "global")) as any;
      await agent.reportProgress(body);
    } catch (e) {
      await logger.warn(
        `[Aggregator Sync Progress] Failed to broadcast to SyncBroadcastAgent: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }

    return c.json({ success: true }, 200);
  },
);

/**
 * GET /api-companies/sync-stats/:id/events — Historical events for a specific sync run.
 * Returns all sync_run_events rows linked to the given sync_stats_id.
 */
apiCompaniesRouter.openapi(
  createRoute({
    method: "get",
    path: "/api-companies/sync-stats/{id}/events",
    operationId: "getApiCompaniesSyncRunEvents",
    request: {
      params: z.object({
        id: z.string().openapi({ description: "Sync stats ID" }),
      }),
    },
    responses: {
      200: {
        description: "List of sync run events for the given run",
        content: {
          "application/json": {
            schema: z.object({
              events: z.array(syncRunEventSchema),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const { id } = c.req.valid("param");
    const numericId = parseInt(id, 10);

    if (isNaN(numericId)) {
      return c.json({ events: [] }, 200);
    }

    const events = await db
      .select()
      .from(syncRunEvents)
      .where(eq(syncRunEvents.syncStatsId, numericId))
      .orderBy(syncRunEvents.createdAt);

    return c.json(
      {
        events: events.map((e) => ({
          ...e,
          createdAt:
            e.createdAt instanceof Date
              ? e.createdAt.toISOString()
              : String(e.createdAt),
        })),
      },
      200,
    );
  },
);

/**
 * GET /api-companies/steps — Get synchronization workflow steps (single source of truth).
 */
apiCompaniesRouter.openapi(
  createRoute({
    method: "get",
    path: "/api-companies/steps",
    operationId: "getApiCompaniesSyncSteps",
    responses: {
      200: {
        description: "List of sync workflow steps",
        content: {
          "application/json": {
            schema: z.object({
              steps: z.array(
                z.object({
                  step: z.number(),
                  title: z.string(),
                  status: z.string(),
                  logs: z.array(z.string()),
                }),
              ),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    return c.json(
      {
        steps: [
          { step: 1, title: "Dispatch Sync Workflow", status: "idle", logs: [] },
          { step: 2, title: "Load Upstream Repositories", status: "idle", logs: [] },
          { step: 3, title: "Scrape and Extract Metadata", status: "idle", logs: [] },
          { step: 4, title: "Update Local Databases", status: "idle", logs: [] },
          { step: 5, title: "Finalize & Broadcast Stats", status: "idle", logs: [] },
        ],
      },
      200,
    );
  },
);

/**
 * GET /api-companies/search-terms — Expose keywords for title and location matching
 */
apiCompaniesRouter.openapi(
  createRoute({
    method: "get",
    path: "/api-companies/search-terms",
    operationId: "getApiCompaniesSearchTerms",
    responses: {
      200: {
        description: "Sync discovery search terms",
        content: {
          "application/json": {
            schema: z.object({
              titles: z.array(z.string()),
              locations: z.array(z.string()),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const { globalConfig } = await import("@/backend/db/schema");
    
    let titles = [
      "software engineer",
      "software developer",
      "frontend",
      "backend",
      "fullstack",
      "full stack",
      "engineer",
      "developer",
      "platform",
      "infrastructure",
      "devops",
    ];
    let locations = [
      "remote",
      "san francisco",
      "sf",
      "bay area",
      "california",
      "united states",
      "us",
      "usa",
    ];

    try {
      const [row] = await db
        .select({ value: globalConfig.value })
        .from(globalConfig)
        .where(eq(globalConfig.key, "applicant_profile"))
        .limit(1);

      if (row?.value) {
        const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
        if (parsed.target_roles) titles = parsed.target_roles;
        if (parsed.locations) locations = parsed.locations;
      }
    } catch {
      // Fallback on error
    }

    return c.json(
      {
        titles,
        locations,
      },
      200,
    );
  },
);

/**
 * POST /api-companies/reject-all — Dismiss all unpromoted aggregator recommendations
 */
apiCompaniesRouter.openapi(
  createRoute({
    method: "post",
    path: "/api-companies/reject-all",
    operationId: "rejectAllRecommendations",
    responses: {
      200: {
        description: "Successfully rejected all recommendations",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    await db.update(apiCompanies).set({ isRecommended: false, recommendationReason: null });
    return c.json({ success: true }, 200);
  },
);

/**
 * POST /api-companies/{id}/reject — Dismiss single company recommendation
 */
apiCompaniesRouter.openapi(
  createRoute({
    method: "post",
    path: "/api-companies/{id}/reject",
    operationId: "rejectRecommendation",
    request: {
      params: z.object({
        id: z.string().openapi({ description: "Company ID" }),
      }),
    },
    responses: {
      200: {
        description: "Successfully rejected recommendation",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const { id } = c.req.valid("param");
    const numericId = parseInt(id, 10);
    if (!isNaN(numericId)) {
      await db
        .update(apiCompanies)
        .set({ isRecommended: false, recommendationReason: null })
        .where(eq(apiCompanies.id, numericId));
    }
    return c.json({ success: true }, 200);
  },
);

/**
 * POST /api-companies/recommend — Receive a real-time matching recommendation and job posting.
 */
apiCompaniesRouter.openapi(
  createRoute({
    method: "post",
    path: "/api-companies/recommend",
    operationId: "apiCompaniesRecommend",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              token: z.string(),
              system: z.string(),
              source: z.string(),
              recommendationReason: z.string(),
              jobs: z.array(
                z.object({
                  id: z.string(),
                  title: z.string(),
                  location: z.string(),
                })
              ).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Recommendation processed and saved",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              jobsInserted: z.number(),
            }),
          },
        },
      },
      500: {
        description: "Server Error",
        content: {
          "application/json": {
            schema: z.object({
              error: z.string(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const body = c.req.valid("json");
    const now = new Date();
    const logger = new Logger(c.env);

    try {
      // 1. Upsert/Update the company
      const existing = await db
        .select({ id: apiCompanies.id })
        .from(apiCompanies)
        .where(eq(apiCompanies.jobBoardToken, body.token))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(apiCompanies)
          .set({
            isRecommended: true,
            recommendationReason: body.recommendationReason,
            isActive: true,
            timestampInactive: null,
          })
          .where(eq(apiCompanies.id, existing[0].id));
      } else {
        await db
          .insert(apiCompanies)
          .values({
            jobBoardToken: body.token,
            system: body.system,
            source: body.source,
            isActive: true,
            isRecommended: true,
            recommendationReason: body.recommendationReason,
            timestampAdded: now,
          });
      }

      // 2. Ingest any recommended jobs directly
      let jobsInserted = 0;
      if (body.jobs && body.jobs.length > 0) {
        const insertPromises = body.jobs.map((job) =>
          db
            .insert(jobsPostings)
            .values({
              jobSiteId: normalizeJobSiteId(job.id.toString()),
              jobTitle: job.title,
              company: body.token,
              location: job.location,
              triagePassed: true,
              triageReason: `Discovered and matched during real-time REST API recommend push: '${job.title}' in '${job.location}'`,
              isRecommended: true,
              recommendationScore: 100,
              recommendationReason: body.recommendationReason,
              pipelineSource: "github_dataset",
            })
            .onConflictDoNothing()
            .returning({ id: jobsPostings.id })
        );

        const results = await db.batch(insertPromises as any);
        jobsInserted = results.filter((r) => Array.isArray(r) && r.length > 0).length;
      }

      await logger.info(`[Aggregator Sync] Saved real-time matching recommendation for ${body.token} (${jobsInserted} jobs).`, {
        status: "completed",
        company: body.token,
        jobsAdded: jobsInserted,
      });

      return c.json({ success: true, jobsInserted }, 200);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logger.error(`[Aggregator Sync] Failed to save real-time recommendation for ${body.token}: ${message}`);
      return c.json({ error: message }, 500);
    }
  }
);


