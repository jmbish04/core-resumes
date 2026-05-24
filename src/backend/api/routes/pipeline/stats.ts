/**
 * @fileoverview Pipeline stats route — aggregated pipeline statistics
 * including session history, scrape counts, and next scheduled run.
 */

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { desc } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { boardTokens, sessionRuns } from "@/backend/db/schema";

import { pipelineStatsSchema } from "./types";

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const statsRouter = new OpenAPIHono<{ Bindings: Env }>();

/**
 * GET /stats — Aggregated pipeline statistics.
 */
statsRouter.openapi(
  createRoute({
    method: "get",
    path: "/stats",
    operationId: "getPipelineStats",
    responses: {
      200: {
        description: "Aggregated pipeline statistics",
        content: { "application/json": { schema: pipelineStatsSchema } },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);

    // Board token counts
    const allTokens = await db.select().from(boardTokens);
    const activeCount = allTokens.filter((t) => t.isActive).length;

    // Session aggregates
    const sessions = await db
      .select()
      .from(sessionRuns)
      .orderBy(desc(sessionRuns.timestamp))
      .limit(100);

    const totalScraped = sessions.reduce((s, r) => s + r.totalScraped, 0);
    const totalTriaged = sessions.reduce((s, r) => s + r.totalTriaged, 0);
    const totalAnalyzed = sessions.reduce((s, r) => s + r.totalAnalyzed, 0);

    const lastSession = sessions[0] ?? null;

    // Next scheduled run: cron is `0 */6 * * *` (every 6 hours)
    const cronSchedule = "0 */6 * * *";
    let nextScheduledRun: string | null = null;
    if (lastSession?.timestamp) {
      const lastTs =
        typeof lastSession.timestamp === "string"
          ? new Date(lastSession.timestamp)
          : lastSession.timestamp;
      const next = new Date(lastTs.getTime() + 6 * 60 * 60 * 1000);
      if (next.getTime() < Date.now()) {
        // If overdue, next run is now + 6h from now
        const fromNow = new Date(Date.now() + 6 * 60 * 60 * 1000);
        nextScheduledRun = fromNow.toISOString();
      } else {
        nextScheduledRun = next.toISOString();
      }
    }

    // Session history (last 30 for charting)
    const history = sessions.slice(0, 30).map((s) => ({
      timestamp:
        s.timestamp instanceof Date
          ? s.timestamp.toISOString()
          : new Date(s.timestamp as unknown as number).toISOString(),
      totalScraped: s.totalScraped,
      totalTriaged: s.totalTriaged,
      totalAnalyzed: s.totalAnalyzed,
      totalFailed: s.totalFailed,
    }));

    return c.json(
      {
        totalSessions: sessions.length,
        totalCompanies: allTokens.length,
        activeCompanies: activeCount,
        totalJobsScraped: totalScraped,
        totalJobsTriaged: totalTriaged,
        totalJobsAnalyzed: totalAnalyzed,
        lastScrape: lastSession
          ? {
              timestamp:
                lastSession.timestamp instanceof Date
                  ? lastSession.timestamp.toISOString()
                  : new Date(lastSession.timestamp as unknown as number).toISOString(),
              totalScraped: lastSession.totalScraped,
              totalTriaged: lastSession.totalTriaged,
              totalAnalyzed: lastSession.totalAnalyzed,
              totalFailed: lastSession.totalFailed,
            }
          : null,
        nextScheduledRun,
        cronSchedule,
        sessionHistory: history.reverse(),
      },
      200,
    );
  },
);
