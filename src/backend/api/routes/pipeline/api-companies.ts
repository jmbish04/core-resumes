/**
 * @fileoverview API Companies route for syncing upstream aggregator tokens.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getAgentByName } from "agents";
import { and, eq, inArray, notInArray } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { apiCompanies, apiCompanySyncStats } from "@/backend/db/schema";
import { getGithubToken } from "@/backend/utils/secrets";

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

    if (upstreamTokens.length === 0) {
      return c.json({ inserted: 0, deactivated: 0, reactivated: 0 }, 200);
    }

    const tokenStrings = upstreamTokens.map((t) => t.token);

    // 1. Mark active companies inactive if not in upstream
    const deactivated = await db
      .update(apiCompanies)
      .set({ isActive: false, timestampInactive: now })
      .where(
        and(eq(apiCompanies.isActive, true), notInArray(apiCompanies.jobBoardToken, tokenStrings)),
      )
      .returning();

    // 2. Mark previously inactive companies active if in upstream
    const reactivated = await db
      .update(apiCompanies)
      .set({ isActive: true, timestampInactive: null })
      .where(
        and(eq(apiCompanies.isActive, false), inArray(apiCompanies.jobBoardToken, tokenStrings)),
      )
      .returning();

    // 3. Find and insert new tokens
    const existingTokens = await db
      .select({ token: apiCompanies.jobBoardToken })
      .from(apiCompanies);
    const existingTokenSet = new Set(existingTokens.map((t) => t.token));

    const newTokens = upstreamTokens.filter((t) => !existingTokenSet.has(t.token));
    let insertedCount = 0;

    if (newTokens.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < newTokens.length; i += chunkSize) {
        const chunk = newTokens.slice(i, i + chunkSize);
        const insertedRows = await db
          .insert(apiCompanies)
          .values(
            chunk.map((t) => ({
              jobBoardToken: t.token,
              system: t.system,
              source: t.source,
              isActive: true,
              timestampAdded: now,
            })),
          )
          .onConflictDoNothing()
          .returning();
        insertedCount += insertedRows.length;
      }
    }
    // 4. Log the sync stats
    await db.insert(apiCompanySyncStats).values({
      runTimestamp: now,
      filesProcessed: 0, // We don't have filesProcessed from the script in this endpoint, but we can set it to upstreamTokens.length as an approximation or leave 0
      companiesAdded: insertedCount,
      companiesDeactivated: deactivated.length,
      companiesReactivated: reactivated.length,
      status: "success",
    });

    return c.json(
      {
        inserted: insertedCount,
        deactivated: deactivated.length,
        reactivated: reactivated.length,
      },
      200,
    );
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
    const token = await getGithubToken(c.env);
    if (!token) {
      return c.json({ error: "Missing GITHUB_PERSONAL_ACCESS_TOKEN" }, 500);
    }

    // Call GitHub API to trigger repository dispatch
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
      return c.json({ error: `GitHub API error: ${res.status} ${errText}` }, 500);
    }

    return c.json({ success: true }, 200);
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

    // Fan-out to all connected Pipeline dashboard WebSocket clients.
    //
    // Worker → Agent DO RPC. `wrangler types` emits the namespace with a
    // generic referencing the agent class, so `getAgentByName` returns a
    // fully-typed stub and `reportProgress` checks against its actual signature.
    //
    // @callable() is for WebSocket RPC from external clients (browsers/mobile) only.
    // Worker → Agent calls use direct method invocation, no @callable needed.
    // See: https://developers.cloudflare.com/agents/api-reference/callable-methods/
    try {
      const agent = await getAgentByName(c.env.SYNC_BROADCAST_AGENT, "global");
      await agent.reportProgress(body);
    } catch (e) {
      console.error("[sync-progress] Failed to reach SyncBroadcastAgent", e);
    }

    return c.json({ success: true }, 200);
  },
);
