/**
 * @fileoverview API routes for role insights — location, compensation, and combined
 * analysis with versioned history and change detection.
 *
 * Routes (mounted on /api/roles):
 *  GET  /:roleId/insights?type=            — latest insight for a type
 *  GET  /:roleId/insights/history?type=    — all versions for a type
 *  GET  /:roleId/insights/changes          — check which dimensions have changed
 *  POST /:roleId/insights                  — trigger analysis for specified types
 */

import { Hono } from "hono";

import type { AppBindings } from "..";
import type { RoleInsightType } from "../../db/schemas/role-insights";

import { RoleInsightsService } from "../../services/role-insights";

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const insightsRouter = new Hono<AppBindings>();

const service = new RoleInsightsService();

// ---------------------------------------------------------------------------
// GET /:roleId/insights?type=location|compensation|combined
// ---------------------------------------------------------------------------

insightsRouter.get("/:roleId/insights", async (c) => {
  const { roleId } = c.req.param();
  const type = c.req.query("type") as RoleInsightType | undefined;

  if (!type || !["location", "compensation", "combined"].includes(type)) {
    return c.json(
      { error: "Query param 'type' is required (location|compensation|combined)" },
      400,
    );
  }

  const insight = await service.getLatestInsight(c.env, roleId, type);

  if (!insight) {
    return c.json({ error: `No ${type} insight found for this role` }, 404);
  }

  return c.json(insight);
});

// ---------------------------------------------------------------------------
// GET /:roleId/insights/history?type=location|compensation|combined
// ---------------------------------------------------------------------------

insightsRouter.get("/:roleId/insights/history", async (c) => {
  const { roleId } = c.req.param();
  const type = c.req.query("type") as RoleInsightType | undefined;

  if (!type || !["location", "compensation", "combined"].includes(type)) {
    return c.json(
      { error: "Query param 'type' is required (location|compensation|combined)" },
      400,
    );
  }

  const history = await service.getInsightHistory(c.env, roleId, type);
  return c.json(history);
});

// ---------------------------------------------------------------------------
// GET /:roleId/insights/changes — check which dimensions have changed inputs
// ---------------------------------------------------------------------------

insightsRouter.get("/:roleId/insights/changes", async (c) => {
  const { roleId } = c.req.param();

  const changes = await service.checkForChanges(c.env, roleId);
  return c.json(changes);
});

// ---------------------------------------------------------------------------
// POST /:roleId/insights — trigger analysis for specified types
// Body: { types: ["location", "compensation", "combined"] }
// Omit types to analyze all dimensions.
// ---------------------------------------------------------------------------

insightsRouter.post("/:roleId/insights", async (c) => {
  const { roleId } = c.req.param();
  const body = await c.req.json<{ types?: RoleInsightType[] }>();

  const typesToAnalyze: RoleInsightType[] =
    body.types && body.types.length > 0 ? body.types : ["location", "compensation", "combined"];

  const results: Record<string, unknown> = {};

  for (const type of typesToAnalyze) {
    try {
      if (type === "location") {
        results.location = await service.generateLocationInsight(c.env, roleId);
      } else if (type === "compensation") {
        results.compensation = await service.generateCompensationInsight(c.env, roleId);
      } else if (type === "combined") {
        results.combined = await service.generateCombinedInsight(c.env, roleId);
      }
    } catch (error) {
      results[type] = {
        error: error instanceof Error ? error.message : "Analysis failed",
      };
    }
  }

  return c.json(results);
});
