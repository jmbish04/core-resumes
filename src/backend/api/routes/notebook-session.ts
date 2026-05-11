/**
 * @fileoverview API route for managing the NotebookLM session cookie in KV.
 *
 * PUT  /api/notebook/session       — Write a new cookie string to KV (browser auth via cr_session)
 * GET  /api/notebook/session       — Check session status (age, length, preview)
 * POST /api/notebook/session/sync  — External API-key-authenticated endpoint for scripts
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { checkNotebookLMQuery } from "../../health/checks/notebooklm-query";
import { constantTimeEqual } from "../../lib/crypto";
import { getWorkerApiKey } from "../../utils/secrets";

const KV_KEY = "ACTIVE_NOTEBOOKLM_SESSION";
const KV_TIMESTAMP_KEY = "ACTIVE_NOTEBOOKLM_SESSION_UPDATED_AT";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const putSessionBody = z.object({
  cookies: z
    .string()
    .min(20, "Cookie string is too short — paste the full value from Chrome DevTools"),
});

const sessionStatusResponse = z.object({
  hasSession: z.boolean(),
  cookieLength: z.number().optional(),
  preview: z.string().optional(),
  updatedAt: z.string().optional(),
  source: z.enum(["kv", "none"]),
});

const syncSessionBody = z.object({
  cookies: z.string().min(20, "Cookie string is too short"),
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const putSessionRoute = createRoute({
  method: "put",
  path: "/session",
  tags: ["NotebookLM"],
  summary: "Update the active NotebookLM session cookies in KV",
  request: { body: { content: { "application/json": { schema: putSessionBody } } } },
  responses: {
    200: {
      description: "Session updated successfully",
      content: {
        "application/json": {
          schema: z.object({ ok: z.boolean(), cookieLength: z.number(), updatedAt: z.string() }),
        },
      },
    },
  },
});

const getSessionRoute = createRoute({
  method: "get",
  path: "/session",
  tags: ["NotebookLM"],
  summary: "Check current NotebookLM session status",
  responses: {
    200: {
      description: "Session status",
      content: { "application/json": { schema: sessionStatusResponse } },
    },
  },
});

/**
 * External sync endpoint — authenticated via `x-api-key` header instead of
 * the `cr_session` cookie, allowing local scripts to push cookies from cron.
 */
const syncSessionRoute = createRoute({
  method: "post",
  path: "/session/sync",
  tags: ["NotebookLM"],
  summary: "External: sync session cookies via API key (for scripts/cron)",
  request: {
    body: { content: { "application/json": { schema: syncSessionBody } } },
  },
  responses: {
    200: {
      description: "Session synced",
      content: {
        "application/json": {
          schema: z.object({ ok: z.boolean(), cookieLength: z.number(), updatedAt: z.string() }),
        },
      },
    },
    401: { description: "Missing or invalid API key" },
  },
});

/**
 * External active health check endpoint — authenticated via `x-api-key`.
 * Runs a live query to NotebookLM to verify authentication.
 */
const checkSessionRoute = createRoute({
  method: "post",
  path: "/session/check",
  tags: ["NotebookLM"],
  summary: "External: run active health check query on NotebookLM",
  responses: {
    200: {
      description: "Active health check result",
      content: {
        "application/json": {
          schema: z.object({
            ok: z.boolean(),
            status: z.string(),
            error: z.string().optional(),
            latencyMs: z.number().optional(),
          }),
        },
      },
    },
    401: { description: "Missing or invalid API key" },
  },
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const notebookSessionRouter = new OpenAPIHono<{ Bindings: Env }>();

notebookSessionRouter.openapi(putSessionRoute, async (c) => {
  const { cookies } = c.req.valid("json");
  const now = new Date().toISOString();

  await c.env.KV.put(KV_KEY, cookies);
  await c.env.KV.put(KV_TIMESTAMP_KEY, now);

  return c.json({ ok: true, cookieLength: cookies.length, updatedAt: now }, 200);
});

notebookSessionRouter.openapi(getSessionRoute, async (c) => {
  // KV is the only session source
  const kvSession = await c.env.KV.get(KV_KEY);
  if (kvSession && kvSession.length > 20) {
    const updatedAt = await c.env.KV.get(KV_TIMESTAMP_KEY);
    return c.json(
      {
        hasSession: true,
        cookieLength: kvSession.length,
        preview: kvSession.slice(0, 40) + "…",
        updatedAt: updatedAt ?? undefined,
        source: "kv" as const,
      },
      200,
    );
  }

  return c.json({ hasSession: false, source: "none" as const }, 200);
});

/**
 * API-key authenticated sync endpoint for external scripts.
 * Validates the `x-api-key` header against the WORKER_API_KEY secret.
 */
notebookSessionRouter.openapi(syncSessionRoute, async (c) => {
  // --- Auth: x-api-key header ---
  const apiKey = c.req.header("x-api-key");
  if (!apiKey) {
    return c.json({ error: "Missing x-api-key header" }, 401);
  }

  const expected = await getWorkerApiKey(c.env);
  if (!expected) {
    return c.json({ error: "Server misconfigured: WORKER_API_KEY not set" }, 500);
  }

  if (!constantTimeEqual(apiKey, expected)) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  // --- Write cookies to KV ---
  const { cookies } = c.req.valid("json");
  const now = new Date().toISOString();

  await c.env.KV.put(KV_KEY, cookies);
  await c.env.KV.put(KV_TIMESTAMP_KEY, now);

  return c.json({ ok: true, cookieLength: cookies.length, updatedAt: now }, 200);
});

/**
 * API-key authenticated active check endpoint for external scripts.
 * Validates the `x-api-key` header against the WORKER_API_KEY secret.
 */
notebookSessionRouter.openapi(checkSessionRoute, async (c) => {
  // --- Auth: x-api-key header ---
  const apiKey = c.req.header("x-api-key");
  if (!apiKey) {
    return c.json({ error: "Missing x-api-key header" }, 401);
  }

  const expected = await getWorkerApiKey(c.env);
  if (!expected) {
    return c.json({ error: "Server misconfigured: WORKER_API_KEY not set" }, 500);
  }

  if (!constantTimeEqual(apiKey, expected)) {
    return c.json({ error: "Invalid API key" }, 401);
  }

  // --- Run active query check ---
  const result = await checkNotebookLMQuery(c.env, "manual");

  if (result.status === "ok") {
    return c.json({ ok: true, status: result.status, latencyMs: result.latencyMs }, 200);
  } else {
    return c.json(
      { ok: false, status: result.status, error: result.error, latencyMs: result.latencyMs },
      200,
    );
  }
});
