import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { getAgentByName } from "agents";

import { getDb } from "@/backend/db";
import {
  marketSalarySnapshots,
  marketSalaryStats,
  marketCompanySalaries,
  marketSalaryInsights,
  globalConfig,
  roles,
} from "@/backend/db/schema";
import { Logger } from "@/backend/lib/logger";
import { SalaryAgent } from "@/backend/ai/agents/salary";

// ---------------------------------------------------------------------------
// Route schemas
// ---------------------------------------------------------------------------

const syncStatsBody = z.object({
  status: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  stats: z.array(
    z.object({
      roleType: z.string(),
      metricKey: z.string(),
      metricLabel: z.string(),
      p25: z.number(),
      median: z.number(),
      p75: z.number(),
      sampleSize: z.number(),
    })
  ),
  companySalaries: z.array(
    z.object({
      companyName: z.string(),
      jobTitle: z.string(),
      seniority: z.string(),
      p25: z.number(),
      median: z.number(),
      p75: z.number(),
      sampleSize: z.number(),
    })
  ),
});

// ---------------------------------------------------------------------------
// Composed router
// ---------------------------------------------------------------------------

export const salaryStatsRouter = new OpenAPIHono<{ Bindings: Env }>();

/**
 * POST /api/pipeline/salary-stats/sync — Receive aggregated salary stats and company lookup percentiles.
 */
salaryStatsRouter.openapi(
  createRoute({
    method: "post",
    path: "/api-companies/salary-stats/sync",
    operationId: "syncSalaryStats",
    request: {
      body: { content: { "application/json": { schema: syncStatsBody } } },
    },
    responses: {
      200: {
        description: "Sync results",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              snapshotId: z.number(),
              statsInserted: z.number(),
              companySalariesInserted: z.number(),
            }),
          },
        },
      },
      500: {
        description: "Server Error",
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const body = c.req.valid("json");
    const now = new Date();
    const logger = new Logger(c.env);

    try {
      await logger.info(
        `[Salary Ingestion] Syncing ${body.stats.length} aggregated stats and ${body.companySalaries.length} lookup entries.`,
        { status: body.status }
      );

      // 1. Insert snapshot
      const [snapshot] = await db
        .insert(marketSalarySnapshots)
        .values({
          runTimestamp: now,
          status: body.status,
          metadata: body.metadata || {},
        })
        .returning({ id: marketSalarySnapshots.id });

      if (!snapshot) {
        throw new Error("Failed to insert market salary snapshot record.");
      }

      // D1 parameter limit is 100. Let's do selective inserts in chunk sizes of 10.
      const INSERT_CHUNK = 10;

      // 2. Batch insert stats
      const statsQueries = [];
      for (let i = 0; i < body.stats.length; i += INSERT_CHUNK) {
        const chunk = body.stats.slice(i, i + INSERT_CHUNK);
        statsQueries.push(
          db
            .insert(marketSalaryStats)
            .values(
              chunk.map((item) => ({
                snapshotId: snapshot.id,
                roleType: item.roleType,
                metricKey: item.metricKey,
                metricLabel: item.metricLabel,
                p25: item.p25,
                median: item.median,
                p75: item.p75,
                sampleSize: item.sampleSize,
                createdAt: now,
              }))
            )
            .returning({ id: marketSalaryStats.id })
        );
      }

      // 3. Batch insert company salaries
      const companyQueries = [];
      for (let i = 0; i < body.companySalaries.length; i += INSERT_CHUNK) {
        const chunk = body.companySalaries.slice(i, i + INSERT_CHUNK);
        companyQueries.push(
          db
            .insert(marketCompanySalaries)
            .values(
              chunk.map((item) => ({
                snapshotId: snapshot.id,
                companyName: item.companyName.toLowerCase(),
                jobTitle: item.jobTitle.toLowerCase(),
                seniority: item.seniority,
                p25: item.p25,
                median: item.median,
                p75: item.p75,
                sampleSize: item.sampleSize,
                createdAt: now,
              }))
            )
            .returning({ id: marketCompanySalaries.id })
        );
      }

      let statsCount = 0;
      let companyCount = 0;

      // Execute all inserts in a single db.batch roundtrip!
      const totalQueries = [...statsQueries, ...companyQueries];
      if (totalQueries.length > 0) {
        const batchResults = await db.batch(totalQueries as any);
        const statsResults = batchResults.slice(0, statsQueries.length);
        const companyResults = batchResults.slice(statsQueries.length);

        for (const res of statsResults) {
          statsCount += (res as any).length;
        }
        for (const res of companyResults) {
          companyCount += (res as any).length;
        }
      }

      // 4. Cleanup old snapshots to prevent database bloat (Keep only last 10 successful snapshots)
      const successfulSnapshots = await db
        .select({ id: marketSalarySnapshots.id })
        .from(marketSalarySnapshots)
        .where(eq(marketSalarySnapshots.status, "success"))
        .orderBy(desc(marketSalarySnapshots.runTimestamp));

      if (successfulSnapshots.length > 10) {
        const toDeleteIds = successfulSnapshots.slice(10).map((s: { id: number }) => s.id);
        const deletedSnapshots = await db
          .delete(marketSalarySnapshots)
          .where(inArray(marketSalarySnapshots.id, toDeleteIds))
          .returning({ id: marketSalarySnapshots.id });
        
        await logger.info(
          `[Salary Ingestion] Cleaned up ${deletedSnapshots.length} older salary snapshots from D1.`,
          { deletedSnapshotIds: toDeleteIds }
        );
      }

      await logger.info(
        `[Salary Ingestion Completed] Ingested snapshot #${snapshot.id} with ${statsCount} stats and ${companyCount} company rows.`,
        { status: "completed", snapshotId: snapshot.id }
      );

      return c.json(
        {
          success: true,
          snapshotId: snapshot.id,
          statsInserted: statsCount,
          companySalariesInserted: companyCount,
        },
        200
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logger.error(`[Salary Ingestion Failed] ${message}`, {
        status: "failed",
      });
      return c.json({ error: message }, 500);
    }
  }
);

/**
 * GET /api/pipeline/salary-stats/latest — Fetch the latest aggregated salary statistics.
 */
salaryStatsRouter.openapi(
  createRoute({
    method: "get",
    path: "/api-companies/salary-stats/latest",
    operationId: "getLatestSalaryStats",
    responses: {
      200: {
        description: "Latest market statistics",
        content: {
          "application/json": {
            schema: z.object({
              snapshot: z.any().nullable(),
              stats: z.array(z.any()),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);

    // Get the latest successful snapshot
    const [snapshot] = await db
      .select()
      .from(marketSalarySnapshots)
      .where(eq(marketSalarySnapshots.status, "success"))
      .orderBy(desc(marketSalarySnapshots.runTimestamp))
      .limit(1);

    if (!snapshot) {
      return c.json({ snapshot: null, stats: [] }, 200);
    }

    const stats = await db
      .select()
      .from(marketSalaryStats)
      .where(eq(marketSalaryStats.snapshotId, snapshot.id));

    return c.json({ snapshot, stats }, 200);
  }
);

/**
 * GET /api/roles/:roleId/insights/market-compensation — Compute scorecards comparing a role to local, remote, and company statistics.
 */
salaryStatsRouter.openapi(
  createRoute({
    method: "get",
    path: "/roles/{roleId}/insights/market-compensation",
    operationId: "getRoleMarketCompensation",
    request: {
      params: z.object({
        roleId: z.string(),
      }),
    },
    responses: {
      200: {
        description: "Comparison scorecards for the role",
        content: {
          "application/json": {
            schema: z.any(),
          },
        },
      },
      404: {
        description: "Role not found",
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const { roleId } = c.req.valid("param");

    // Fetch the role details
    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) {
      return c.json({ error: "Role not found" }, 404);
    }

    // Fetch the latest config values
    const [configRow] = await db
      .select()
      .from(globalConfig)
      .where(eq(globalConfig.key, "applicant_profile"))
      .limit(1);

    const profile = (configRow?.value as any) || {
      location: "San Francisco Bay Area",
      locations: ["san francisco", "sf", "bay area"],
      hubs: ["San Francisco", "New York", "Seattle", "Austin"],
      target_roles: ["software engineer", "frontend", "backend", "fullstack", "devops"],
    };

    // Find the closest matching target role keyword by checking if the lowercase job title contains any role type
    const jobTitleLower = role.jobTitle.toLowerCase();
    let matchingRoleType = profile.target_roles[0] || "software engineer";
    for (const type of profile.target_roles) {
      if (jobTitleLower.includes(type.toLowerCase())) {
        matchingRoleType = type;
        break;
      }
    }

    // Get the latest successful snapshot ID
    const [snapshot] = await db
      .select({ id: marketSalarySnapshots.id })
      .from(marketSalarySnapshots)
      .where(eq(marketSalarySnapshots.status, "success"))
      .orderBy(desc(marketSalarySnapshots.runTimestamp))
      .limit(1);

    let stats: typeof marketSalaryStats.$inferSelect[] = [];
    if (snapshot) {
      stats = await db
        .select()
        .from(marketSalaryStats)
        .where(
          sql`${marketSalaryStats.snapshotId} = ${snapshot.id} AND LOWER(${marketSalaryStats.roleType}) = ${matchingRoleType.toLowerCase()}`
        );
    }

    // Fetch company salary data if any exists in lookup
    let companySalaries: typeof marketCompanySalaries.$inferSelect[] = [];
    if (snapshot && role.companyName) {
      const cleanCompany = role.companyName.toLowerCase().replace(/, inc\.?| inc\.?| l\.?l\.?c\.?/g, "").trim();
      companySalaries = await db
        .select()
        .from(marketCompanySalaries)
        .where(
          sql`${marketCompanySalaries.snapshotId} = ${snapshot.id} AND LOWER(${marketCompanySalaries.companyName}) LIKE ${"%" + cleanCompany + "%"}`
        );
    }

    return c.json(
      {
        jobTitle: role.jobTitle,
        companyName: role.companyName,
        advertisedMin: role.salaryMin,
        advertisedMax: role.salaryMax,
        matchingRoleType,
        stats,
        companySalaries,
        profile,
      },
      200
    );
  }
);

/**
 * POST /api/pipeline/salary-stats/analyze-trends — Trigger broad trend analysis via the SalaryAgent and persist results.
 */
salaryStatsRouter.openapi(
  createRoute({
    method: "post",
    path: "/api-companies/salary-stats/analyze-trends",
    operationId: "analyzeBroadSalaryTrends",
    responses: {
      200: {
        description: "Trend report markdown and metadata",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
              report: z.string(),
            }),
          },
        },
      },
      500: {
        description: "Server error",
      },
    },
  }),
  async (c) => {
    try {
      const agent = (await getAgentByName(c.env.SALARY_AGENT as any, "global")) as any;
      const report = await agent.analyzeBroadTrends();
      return c.json({ success: true, report }, 200);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }
);

/**
 * GET /api/pipeline/salary-stats/trends/latest — Fetch the latest broad salary trend report generated by AI.
 */
salaryStatsRouter.openapi(
  createRoute({
    method: "get",
    path: "/api-companies/salary-stats/trends/latest",
    operationId: "getLatestSalaryTrends",
    responses: {
      200: {
        description: "Latest AI insight report",
        content: {
          "application/json": {
            schema: z.object({
              insight: z.any().nullable(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const [insight] = await db
      .select()
      .from(marketSalaryInsights)
      .orderBy(desc(marketSalaryInsights.createdAt))
      .limit(1);

    return c.json({ insight: insight || null }, 200);
  }
);

/**
 * POST /api/roles/:roleId/insights/market-compensation/analyze — Trigger on-the-fly role salary analysis via Sandbox container.
 */
salaryStatsRouter.openapi(
  createRoute({
    method: "post",
    path: "/roles/{roleId}/insights/market-compensation/analyze",
    operationId: "analyzeRoleCompensationOnTheFly",
    request: {
      params: z.object({
        roleId: z.string(),
      }),
    },
    responses: {
      200: {
        description: "On-the-fly calculation results",
        content: {
          "application/json": {
            schema: z.any(),
          },
        },
      },
      500: {
        description: "Server error",
      },
    },
  }),
  async (c) => {
    const { roleId } = c.req.valid("param");
    try {
      const agent = (await getAgentByName(c.env.SALARY_AGENT as any, "global")) as any;
      const result = await agent.analyzeRoleCompensation(roleId);
      return c.json(result, 200);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }
);
