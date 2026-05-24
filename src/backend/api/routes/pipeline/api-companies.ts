/**
 * @fileoverview API Companies route for syncing upstream aggregator tokens.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getAgentByName } from "agents";
import { eq, inArray } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { apiCompanies, apiCompanySyncStats } from "@/backend/db/schema";
import { getGithubToken } from "@/backend/utils/secrets";
import { Logger } from "@/backend/lib/logger";

import { syncApiCompaniesBody, syncProgressBody } from "./types";

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

    // D1 caps bound parameters at 100 per query — diff in memory and update by id
    // in chunks instead of passing the full token list into inArray/notInArray.
    // Setting CHUNK to 10 keeps maximum parameters at 70 (10 * 7) for inserts and 12 (10 + 2) for updates.
    const CHUNK = 10;
    const upstreamSet = new Set(upstreamTokens.map((t) => t.token));

    try {
      const allCompanies = await db
        .select({
          id: apiCompanies.id,
          token: apiCompanies.jobBoardToken,
          isActive: apiCompanies.isActive,
        })
        .from(apiCompanies);

      const existingTokenSet = new Set(allCompanies.map((c) => c.token));
      const toDeactivateIds = allCompanies
        .filter((c) => c.isActive && !upstreamSet.has(c.token))
        .map((c) => c.id);
      const toReactivateIds = allCompanies
        .filter((c) => !c.isActive && upstreamSet.has(c.token))
        .map((c) => c.id);
      const newTokens = upstreamTokens.filter((t) => !existingTokenSet.has(t.token));

      let deactivatedCount = 0;
      for (let i = 0; i < toDeactivateIds.length; i += CHUNK) {
        const chunk = toDeactivateIds.slice(i, i + CHUNK);
        const rows = await db
          .update(apiCompanies)
          .set({ isActive: false, timestampInactive: now })
          .where(inArray(apiCompanies.id, chunk))
          .returning({ id: apiCompanies.id });
        deactivatedCount += rows.length;
      }

      let reactivatedCount = 0;
      for (let i = 0; i < toReactivateIds.length; i += CHUNK) {
        const chunk = toReactivateIds.slice(i, i + CHUNK);
        const rows = await db
          .update(apiCompanies)
          .set({ isActive: true, timestampInactive: null })
          .where(inArray(apiCompanies.id, chunk))
          .returning({ id: apiCompanies.id });
        reactivatedCount += rows.length;
      }

      let insertedCount = 0;
      for (let i = 0; i < newTokens.length; i += CHUNK) {
        const chunk = newTokens.slice(i, i + CHUNK);
        const insertedRows = await db
          .insert(apiCompanies)
          .values(
            chunk.map((t) => ({
              jobBoardToken: t.token,
              system: t.system,
              source: t.source,
              isActive: true,
              timestampAdded: now,
              isRecommended: t.isRecommended ?? false,
              recommendationReason: t.recommendationReason ?? null,
            })),
          )
          .onConflictDoNothing()
          .returning({ id: apiCompanies.id });
        insertedCount += insertedRows.length;
      }

      // Update recommendation status for recommended companies in the sync payload
      const recommendedTokens = upstreamTokens.filter((t) => t.isRecommended);
      for (let i = 0; i < recommendedTokens.length; i += CHUNK) {
        const chunk = recommendedTokens.slice(i, i + CHUNK);
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
        description: "List of sync stats",
        content: {
          "application/json": {
            schema: z.object({
              stats: z.array(
                z.object({
                  id: z.number(),
                  runTimestamp: z.string(),
                  filesProcessed: z.number(),
                  companiesAdded: z.number(),
                  companiesDeactivated: z.number(),
                  companiesReactivated: z.number(),
                  status: z.string(),
                  error: z.string().nullable(),
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
    const stats = await db
      .select()
      .from(apiCompanySyncStats)
      .orderBy(apiCompanySyncStats.runTimestamp)
      .limit(50);

    // reverse to get desc
    stats.reverse();

    return c.json(
      {
        stats: stats.map((s) => ({
          ...s,
          // Drizzle's timestamp mode normally returns a Date, but some D1
          // driver paths can return a string/number. Be defensive.
          runTimestamp:
            s.runTimestamp instanceof Date
              ? s.runTimestamp.toISOString()
              : String(s.runTimestamp),
        })),
      },
      200,
    );
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
 * POST /api-companies/sync-progress — Receive progress from GitHub action script
 * and fan it out to all connected Pipeline dashboard WebSocket clients via
 * SyncBroadcastAgent (dedicated Agent DO for broadcasting).
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

    // Fan out to every open Pipeline dashboard WebSocket via SyncBroadcastAgent.
    // Failures here must not 500 the GitHub Action — log and swallow.
    try {
      const agent = await getAgentByName(c.env.SYNC_BROADCAST_AGENT, "global");
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
    return c.json(
      {
        titles: [
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
        ],
        locations: [
          "remote",
          "san francisco",
          "sf",
          "bay area",
          "california",
          "united states",
          "us",
          "usa",
        ],
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

