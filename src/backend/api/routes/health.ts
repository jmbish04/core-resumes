/**
 * @fileoverview Health check API routes for the Career Orchestrator Worker.
 *
 * Provides three endpoints:
 *  - `GET  /api/health`        — Quick liveness check (returns latest run from D1)
 *  - `GET  /api/health/latest` — Fetch the most recent run with all results
 *  - `POST /api/health/run`    — Run a full diagnostic, persist to D1, return results
 *
 * Uses the new `HealthCoordinator` and relational D1 schema (`health_runs` + `health_results`).
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { HealthCoordinator } from "@/health";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const checkStatusEnum = z.enum(["ok", "warn", "fail", "skipped", "timeout"]);
const healthStatusEnum = z.enum(["healthy", "degraded", "unhealthy", "unknown"]);
const triggerEnum = z.enum(["manual", "scheduled", "agent"]);
const categoryEnum = z.enum([
  "database",
  "ai",
  "providers",
  "agents",
  "google",
  "binding",
  "auth",
  "api",
  "greenhouse",
  "custom",
]);

const healthResultSchema = z.object({
  id: z.string(),
  runId: z.string(),
  category: categoryEnum,
  name: z.string(),
  status: checkStatusEnum,
  message: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  durationMs: z.number(),
  aiSuggestion: z.string().optional(),
  timestamp: z.string(),
});

const healthRunSchema = z.object({
  id: z.string(),
  status: healthStatusEnum,
  trigger: triggerEnum,
  durationMs: z.number(),
  createdAt: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const healthResponseSchema = z.object({
  run: healthRunSchema,
  results: z.array(healthResultSchema),
});

const latestResponseSchema = z.object({
  run: healthRunSchema.nullable(),
  results: z.array(healthResultSchema),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const healthRouter = new OpenAPIHono<{ Bindings: Env }>();

/**
 * GET /api/health — Quick liveness / latest run.
 *
 * Returns the latest persisted run from D1 without re-running checks.
 * If no run exists yet, returns { run: null, results: [] }.
 */
healthRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    operationId: "healthCheck",
    responses: {
      200: {
        description: "Latest health run from D1 (no re-run)",
        content: { "application/json": { schema: latestResponseSchema } },
      },
    },
  }),
  async (c) => {
    const coordinator = new HealthCoordinator(c.env);
    const latest = await coordinator.getLatestRun();
    return c.json({ run: latest?.run ?? null, results: latest?.results ?? [] }, 200);
  },
);

/**
 * GET /api/health/latest — Same as GET / (explicit alias).
 */
healthRouter.openapi(
  createRoute({
    method: "get",
    path: "/latest",
    operationId: "getLatestHealthCheck",
    responses: {
      200: {
        description: "Most recent health run from D1",
        content: { "application/json": { schema: latestResponseSchema } },
      },
    },
  }),
  async (c) => {
    const coordinator = new HealthCoordinator(c.env);
    const latest = await coordinator.getLatestRun();
    return c.json({ run: latest?.run ?? null, results: latest?.results ?? [] }, 200);
  },
);

/**
 * POST /api/health/run — Explicit manual screening trigger.
 *
 * Runs all health checks in parallel, persists run + results to D1,
 * and returns the full payload.
 */
healthRouter.openapi(
  createRoute({
    method: "post",
    path: "/run",
    operationId: "runHealthCheck",
    responses: {
      200: {
        description: "On-demand health diagnostic results",
        content: { "application/json": { schema: healthResponseSchema } },
      },
    },
  }),
  async (c) => {
    const coordinator = new HealthCoordinator(c.env);
    const { run, results } = await coordinator.runAllChecks("manual");
    return c.json({ run, results }, 200);
  },
);
