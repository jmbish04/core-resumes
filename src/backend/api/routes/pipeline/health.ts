/**
 * @fileoverview Pipeline health route — triggers greenhouse-only
 * diagnostics via the HealthCoordinator.
 */

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { HealthCoordinator } from "@/health";

import { pipelineHealthResultSchema } from "./types";

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const healthRouter = new OpenAPIHono<{ Bindings: Env }>();

/**
 * POST /health — Run greenhouse-only health checks.
 */
healthRouter.openapi(
  createRoute({
    method: "post",
    path: "/health",
    operationId: "runPipelineHealth",
    responses: {
      200: {
        description: "Greenhouse health check results",
        content: {
          "application/json": { schema: pipelineHealthResultSchema },
        },
      },
    },
  }),
  async (c) => {
    const start = Date.now();
    const coordinator = new HealthCoordinator(c.env);
    const { results } = await coordinator.runAllChecks("manual");

    // Filter to greenhouse category only
    const ghResults = results.filter((r) => r.category === "greenhouse");

    const failCount = ghResults.filter((r) => r.status === "fail" || r.status === "timeout").length;
    const overall = (failCount === 0 ? "healthy" : failCount <= 2 ? "degraded" : "unhealthy") as
      | "healthy"
      | "degraded"
      | "unhealthy";

    return c.json(
      {
        results: ghResults.map((r) => ({
          name: r.name,
          status: r.status,
          message: r.message,
          durationMs: r.durationMs,
          details: r.details,
        })),
        overall,
        durationMs: Date.now() - start,
      },
      200,
    );
  },
);
