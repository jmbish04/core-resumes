/**
 * @fileoverview Pipeline insights route — snapshot analytics for the
 * documentation page (verdict distribution, salary trends, company coverage).
 */

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { avg, count } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { boardTokens, jobSnapshots, jobsPostings } from "@/backend/db/schema";

import { snapshotInsightsSchema } from "./types";

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const insightsRouter = new OpenAPIHono<{ Bindings: Env }>();

/**
 * GET /insights — Snapshot analytics for the docs page.
 */
insightsRouter.openapi(
  createRoute({
    method: "get",
    path: "/insights",
    operationId: "getPipelineInsights",
    responses: {
      200: {
        description: "Snapshot insights and analytics",
        content: { "application/json": { schema: snapshotInsightsSchema } },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);

    // Verdict distribution from job_snapshots
    const verdicts = await db
      .select({
        verdict: jobSnapshots.verdict,
        count: count(),
      })
      .from(jobSnapshots)
      .groupBy(jobSnapshots.verdict);

    const verdictDistribution = verdicts
      .filter((v) => v.verdict)
      .map((v) => ({ verdict: v.verdict!, count: v.count }));

    // Salary averages
    const salaryOverall = await db
      .select({
        avgMin: avg(jobSnapshots.salaryMin),
        avgMax: avg(jobSnapshots.salaryMax),
      })
      .from(jobSnapshots);

    const salaryByVerdict = await db
      .select({
        verdict: jobSnapshots.verdict,
        avgMin: avg(jobSnapshots.salaryMin),
        avgMax: avg(jobSnapshots.salaryMax),
      })
      .from(jobSnapshots)
      .groupBy(jobSnapshots.verdict);

    // Totals
    const [{ total: totalSnapshots }] = await db.select({ total: count() }).from(jobSnapshots);

    const [{ total: totalPostings }] = await db.select({ total: count() }).from(jobsPostings);

    // Company coverage (jobs per company)
    const companyCoverage = await db
      .select({
        company: jobsPostings.company,
        jobCount: count(),
      })
      .from(jobsPostings)
      .groupBy(jobsPostings.company);

    // Enrich with company names from board_tokens
    const tokenMap = new Map<string, string | null>();
    const allTokens = await db.select().from(boardTokens);
    for (const t of allTokens) {
      tokenMap.set(t.token, t.companyName);
    }

    return c.json(
      {
        verdictDistribution,
        avgSalary: {
          overall: salaryOverall[0]?.avgMin ? Number(salaryOverall[0].avgMin) : null,
          byVerdict: salaryByVerdict
            .filter((v) => v.verdict)
            .map((v) => ({
              verdict: v.verdict!,
              avgMin: v.avgMin ? Number(v.avgMin) : null,
              avgMax: v.avgMax ? Number(v.avgMax) : null,
            })),
        },
        totalSnapshots,
        totalPostings,
        companyCoverage: companyCoverage.map((cc) => ({
          token: cc.company,
          companyName: cc.company,
          jobCount: cc.jobCount,
        })),
      },
      200,
    );
  },
);
