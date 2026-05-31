/**
 * @fileoverview Salary Intelligence Dashboard API — serves aggregated market
 * salary data, saved views, pinned role comparisons, and AI-generated trend
 * analysis for the `/salary-intelligence` frontend page.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq, desc, sql, inArray } from "drizzle-orm";

import { getActiveBullets } from "@/backend/ai/tasks";

import { getDb } from "@/backend/db";
import {
  marketSalarySnapshots,
  marketSalaryStats,
  marketCompanySalaries,
  marketSalaryInsights,
  salaryDashboardViews,
  salaryPinnedRoles,
  roles,
  globalConfig,
} from "@/backend/db/schema";
import { AiProvider } from "@/backend/ai/providers";

// ---------------------------------------------------------------------------
// Helpers for Role Normalization and Aggregation
// ---------------------------------------------------------------------------

function normalizeRoleType(role: string): string {
  if (!role) return "";
  const clean = role.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
  if (clean === "fullstack" || clean === "fullstackengineer" || clean === "fullstackdeveloper") {
    return "Full Stack";
  }
  if (clean === "frontend" || clean === "frontendengineer" || clean === "frontenddeveloper") {
    return "Frontend";
  }
  if (clean === "backend" || clean === "backendengineer" || clean === "backenddeveloper") {
    return "Backend";
  }
  if (clean === "softwareengineer" || clean === "swe" || clean === "developer" || clean === "softwaredeveloper") {
    return "Software Engineer";
  }
  if (clean === "legalops" || clean === "legaloperations" || clean === "legaloperationstech" || clean === "legaltechnologist") {
    return "Legal Ops";
  }
  if (clean === "productmanager" || clean === "pm" || clean === "productmanagement") {
    return "Product Manager";
  }
  if (clean === "devops" || clean === "sre" || clean === "infrastructure" || clean === "devopsengineer") {
    return "DevOps";
  }
  // Title case fallback
  return role
    .split(/[ -]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function aggregateStats(rows: (typeof marketSalaryStats.$inferSelect)[]): (typeof marketSalaryStats.$inferSelect)[] {
  const grouped: Record<
    string,
    {
      id: number;
      snapshotId: number;
      roleType: string;
      metricKey: string;
      metricLabel: string;
      p25Sum: number;
      medianSum: number;
      p75Sum: number;
      sampleSize: number;
      createdAt: Date;
    }
  > = {};

  for (const row of rows) {
    const normRole = normalizeRoleType(row.roleType);
    const key = `${normRole}||${row.metricKey}||${row.metricLabel}`;

    if (!grouped[key]) {
      grouped[key] = {
        id: row.id,
        snapshotId: row.snapshotId,
        roleType: normRole,
        metricKey: row.metricKey,
        metricLabel: row.metricLabel,
        p25Sum: 0,
        medianSum: 0,
        p75Sum: 0,
        sampleSize: 0,
        createdAt: row.createdAt,
      };
    }

    const grp = grouped[key];
    grp.p25Sum += row.p25 * row.sampleSize;
    grp.medianSum += row.median * row.sampleSize;
    grp.p75Sum += row.p75 * row.sampleSize;
    grp.sampleSize += row.sampleSize;
  }

  return Object.values(grouped).map((g) => ({
    id: g.id,
    snapshotId: g.snapshotId,
    roleType: g.roleType,
    metricKey: g.metricKey,
    metricLabel: g.metricLabel,
    p25: g.sampleSize > 0 ? Math.round(g.p25Sum / g.sampleSize) : 0,
    median: g.sampleSize > 0 ? Math.round(g.medianSum / g.sampleSize) : 0,
    p75: g.sampleSize > 0 ? Math.round(g.p75Sum / g.sampleSize) : 0,
    sampleSize: g.sampleSize,
    createdAt: g.createdAt,
  }));
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const salaryIntelligenceRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /salary-intelligence/context
// Lightweight career context for the assistant-UI system prompt enrichment.
// ---------------------------------------------------------------------------

salaryIntelligenceRouter.openapi(
  createRoute({
    method: "get",
    path: "/salary-intelligence/context",
    operationId: "getSalaryIntelligenceContext",
    responses: {
      200: {
        description: "Career context for agent system prompt",
        content: { "application/json": { schema: z.any() } },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);

    // Active roles the user is tracking
    const activeRoles = await db
      .select({
        id: roles.id,
        companyName: roles.companyName,
        jobTitle: roles.jobTitle,
        status: roles.status,
        salaryMin: roles.salaryMin,
        salaryMax: roles.salaryMax,
      })
      .from(roles)
      .where(
        sql`${roles.status} IN ('applied', 'interviewing', 'offered', 'saved', 'interested')`,
      )
      .orderBy(desc(roles.updatedAt))
      .limit(20);

    // Latest market summary
    const [snapshot] = await db
      .select({ id: marketSalarySnapshots.id })
      .from(marketSalarySnapshots)
      .where(eq(marketSalarySnapshots.status, "success"))
      .orderBy(desc(marketSalarySnapshots.runTimestamp))
      .limit(1);

    let marketSummary = {
      avgNationalMedian: null as number | null,
      avgLocalMedian: null as number | null,
      totalCompanies: 0,
      totalDataPoints: 0,
    };

    if (snapshot) {
      const stats = await db
        .select()
        .from(marketSalaryStats)
        .where(eq(marketSalaryStats.snapshotId, snapshot.id));

      const companySalaries = await db
        .select({ companyName: marketCompanySalaries.companyName })
        .from(marketCompanySalaries)
        .where(eq(marketCompanySalaries.snapshotId, snapshot.id));

      const nationalStats = stats.filter((s) => s.metricKey === "national");
      const localStats = stats.filter((s) => s.metricKey === "local_market");

      marketSummary = {
        avgNationalMedian:
          nationalStats.length > 0
            ? Math.round(
                nationalStats.reduce((sum, s) => sum + s.median, 0) /
                  nationalStats.length,
              )
            : null,
        avgLocalMedian:
          localStats.length > 0
            ? Math.round(
                localStats.reduce((sum, s) => sum + s.median, 0) /
                  localStats.length,
              )
            : null,
        totalCompanies: new Set(companySalaries.map((c) => c.companyName)).size,
        totalDataPoints: stats.length + companySalaries.length,
      };
    }

    // Resume bullets (career facts)
    const bullets = await getActiveBullets(c.env);

    // Applicant name from config (set on /config page)
    const [profileRow] = await db
      .select({ value: globalConfig.value })
      .from(globalConfig)
      .where(eq(globalConfig.key, "applicant_profile"))
      .limit(1);

    const profileValue = profileRow?.value as Record<string, unknown> | null;
    const nameField = profileValue?.applicant_name as
      | { full_name?: string; first_name?: string }
      | string
      | null;
    const applicantName =
      (typeof nameField === "object" && nameField?.full_name) ||
      (typeof nameField === "string" && nameField) ||
      "Justin";

    return c.json(
      {
        userName: applicantName,
        roles: activeRoles,
        marketSummary,
        bullets: bullets.slice(0, 30).map((b) => ({
          category: b.category,
          content: b.content,
          impactMetric: b.impactMetric ?? null,
        })),
      },
      200,
    );
  },
);

// ---------------------------------------------------------------------------
// GET /salary-intelligence/overview
// ---------------------------------------------------------------------------

salaryIntelligenceRouter.openapi(
  createRoute({
    method: "get",
    path: "/salary-intelligence/overview",
    operationId: "getSalaryIntelligenceOverview",
    responses: {
      200: { description: "Dashboard overview data", content: { "application/json": { schema: z.any() } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);

    // Latest successful snapshot
    const [snapshot] = await db
      .select()
      .from(marketSalarySnapshots)
      .where(eq(marketSalarySnapshots.status, "success"))
      .orderBy(desc(marketSalarySnapshots.runTimestamp))
      .limit(1);

    let stats: (typeof marketSalaryStats.$inferSelect)[] = [];
    let companySalaries: (typeof marketCompanySalaries.$inferSelect)[] = [];

    if (snapshot) {
      const rawStats = await db
        .select()
        .from(marketSalaryStats)
        .where(eq(marketSalaryStats.snapshotId, snapshot.id));
      stats = aggregateStats(rawStats);

      companySalaries = await db
        .select()
        .from(marketCompanySalaries)
        .where(eq(marketCompanySalaries.snapshotId, snapshot.id));
    }

    // Latest AI insight
    const [latestInsight] = await db
      .select()
      .from(marketSalaryInsights)
      .orderBy(desc(marketSalaryInsights.createdAt))
      .limit(1);

    // Unique role types
    const roleTypes = [...new Set(stats.map((s) => s.roleType))];

    // Unique companies
    const companyNames = [...new Set(companySalaries.map((cs) => cs.companyName))];

    // Compute summary KPIs
    const nationalStats = stats.filter((s) => s.metricKey === "national");
    const localStats = stats.filter((s) => s.metricKey === "local_market");
    const remoteStats = stats.filter((s) => s.metricKey === "remote");

    const avgNationalMedian =
      nationalStats.length > 0
        ? Math.round(nationalStats.reduce((sum, s) => sum + s.median, 0) / nationalStats.length)
        : null;

    const avgLocalMedian =
      localStats.length > 0
        ? Math.round(localStats.reduce((sum, s) => sum + s.median, 0) / localStats.length)
        : null;

    const avgRemoteMedian =
      remoteStats.length > 0
        ? Math.round(remoteStats.reduce((sum, s) => sum + s.median, 0) / remoteStats.length)
        : null;

    const sfPremium =
      avgNationalMedian && avgLocalMedian
        ? Math.round(((avgLocalMedian - avgNationalMedian) / avgNationalMedian) * 100)
        : null;

    const remoteDiscount =
      avgLocalMedian && avgRemoteMedian
        ? Math.round(((avgLocalMedian - avgRemoteMedian) / avgLocalMedian) * 100)
        : null;

    // Top paying company by median
    const topCompany = companySalaries.length > 0
      ? companySalaries.reduce((top, cs) => (cs.median > (top?.median ?? 0) ? cs : top), companySalaries[0])
      : null;

    return c.json({
      snapshot,
      stats,
      companySalaries,
      latestInsight: latestInsight || null,
      roleTypes,
      companyNames: companyNames.slice(0, 100),
      kpis: {
        avgNationalMedian,
        avgLocalMedian,
        avgRemoteMedian,
        sfPremium,
        remoteDiscount,
        topCompany: topCompany
          ? { companyName: topCompany.companyName, median: topCompany.median, jobTitle: topCompany.jobTitle }
          : null,
        totalCompanies: companyNames.length,
        totalDataPoints: stats.length + companySalaries.length,
      },
    }, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /salary-intelligence/percentiles
// ---------------------------------------------------------------------------

salaryIntelligenceRouter.openapi(
  createRoute({
    method: "get",
    path: "/salary-intelligence/percentiles",
    operationId: "getSalaryPercentiles",
    responses: {
      200: { description: "Percentile breakdown by metric and role", content: { "application/json": { schema: z.any() } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);

    const [snapshot] = await db
      .select({ id: marketSalarySnapshots.id })
      .from(marketSalarySnapshots)
      .where(eq(marketSalarySnapshots.status, "success"))
      .orderBy(desc(marketSalarySnapshots.runTimestamp))
      .limit(1);

    if (!snapshot) {
      return c.json({ percentiles: [] }, 200);
    }

    const rawStats = await db
      .select()
      .from(marketSalaryStats)
      .where(eq(marketSalaryStats.snapshotId, snapshot.id));

    return c.json({ percentiles: aggregateStats(rawStats) }, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /salary-intelligence/companies
// ---------------------------------------------------------------------------

salaryIntelligenceRouter.openapi(
  createRoute({
    method: "get",
    path: "/salary-intelligence/companies",
    operationId: "getSalaryCompanies",
    responses: {
      200: { description: "Company salary data with seniority breakdown", content: { "application/json": { schema: z.any() } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);

    const [snapshot] = await db
      .select({ id: marketSalarySnapshots.id })
      .from(marketSalarySnapshots)
      .where(eq(marketSalarySnapshots.status, "success"))
      .orderBy(desc(marketSalarySnapshots.runTimestamp))
      .limit(1);

    if (!snapshot) {
      return c.json({ companies: [] }, 200);
    }

    const companySalaries = await db
      .select()
      .from(marketCompanySalaries)
      .where(eq(marketCompanySalaries.snapshotId, snapshot.id));

    // Group by company
    const grouped: Record<string, (typeof marketCompanySalaries.$inferSelect)[]> = {};
    for (const cs of companySalaries) {
      if (!grouped[cs.companyName]) grouped[cs.companyName] = [];
      grouped[cs.companyName].push(cs);
    }

    const companies = Object.entries(grouped).map(([name, entries]) => ({
      companyName: name,
      roles: entries.map((e) => ({
        jobTitle: e.jobTitle,
        seniority: e.seniority,
        p25: e.p25,
        median: e.median,
        p75: e.p75,
        sampleSize: e.sampleSize,
      })),
      avgMedian: Math.round(entries.reduce((s, e) => s + e.median, 0) / entries.length),
      totalSamples: entries.reduce((s, e) => s + e.sampleSize, 0),
    }));

    // Sort by avgMedian descending
    companies.sort((a, b) => b.avgMedian - a.avgMedian);

    return c.json({ companies }, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /salary-intelligence/trends
// ---------------------------------------------------------------------------

salaryIntelligenceRouter.openapi(
  createRoute({
    method: "get",
    path: "/salary-intelligence/trends",
    operationId: "getSalaryTrends",
    responses: {
      200: { description: "Historical salary data across snapshots", content: { "application/json": { schema: z.any() } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);

    // Get all successful snapshots ordered by time
    const snapshots = await db
      .select()
      .from(marketSalarySnapshots)
      .where(eq(marketSalarySnapshots.status, "success"))
      .orderBy(marketSalarySnapshots.runTimestamp);

    if (snapshots.length === 0) {
      return c.json({ trends: [] }, 200);
    }

    const snapshotIds = snapshots.map((s) => s.id);

    // Get all stats for these snapshots
    const allStats = await db
      .select()
      .from(marketSalaryStats)
      .where(inArray(marketSalaryStats.snapshotId, snapshotIds));

    // Build time series: for each snapshot, group stats by roleType and metricKey
    const trends = snapshots.map((snap) => {
      const snapStats = allStats.filter((s) => s.snapshotId === snap.id);
      const byRole: Record<string, Record<string, { median: number; p25: number; p75: number }>> = {};

      for (const stat of snapStats) {
        if (!byRole[stat.roleType]) byRole[stat.roleType] = {};
        byRole[stat.roleType][stat.metricKey] = {
          median: stat.median,
          p25: stat.p25,
          p75: stat.p75,
        };
      }

      return {
        snapshotId: snap.id,
        timestamp: snap.runTimestamp,
        metadata: snap.metadata,
        roles: byRole,
      };
    });

    return c.json({ trends }, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /salary-intelligence/role-comparison
// ---------------------------------------------------------------------------

salaryIntelligenceRouter.openapi(
  createRoute({
    method: "get",
    path: "/salary-intelligence/role-comparison",
    operationId: "getSalaryRoleComparison",
    request: {
      query: z.object({ roleIds: z.string().optional() }),
    },
    responses: {
      200: { description: "Comparison data for pinned roles", content: { "application/json": { schema: z.any() } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const roleIdsParam = c.req.query("roleIds");

    if (!roleIdsParam) {
      return c.json({ comparisons: [] }, 200);
    }

    const roleIds = roleIdsParam.split(",").filter(Boolean);
    if (roleIds.length === 0) {
      return c.json({ comparisons: [] }, 200);
    }

    // Fetch roles
    const roleRecords = await db
      .select()
      .from(roles)
      .where(inArray(roles.id, roleIds));

    // Fetch latest snapshot
    const [snapshot] = await db
      .select({ id: marketSalarySnapshots.id })
      .from(marketSalarySnapshots)
      .where(eq(marketSalarySnapshots.status, "success"))
      .orderBy(desc(marketSalarySnapshots.runTimestamp))
      .limit(1);

    const comparisons = await Promise.all(
      roleRecords.map(async (role) => {
        let companySalaries: (typeof marketCompanySalaries.$inferSelect)[] = [];

        if (snapshot && role.companyName) {
          const cleanCompany = role.companyName
            .toLowerCase()
            .replace(/, inc\.?| inc\.?| l\.?l\.?c\.?/g, "")
            .trim();

          companySalaries = await db
            .select()
            .from(marketCompanySalaries)
            .where(
              sql`${marketCompanySalaries.snapshotId} = ${snapshot.id} AND LOWER(${marketCompanySalaries.companyName}) LIKE ${`%${cleanCompany}%`}`,
            );
        }

        return {
          roleId: role.id,
          jobTitle: role.jobTitle,
          companyName: role.companyName,
          salaryMin: role.salaryMin,
          salaryMax: role.salaryMax,
          companySalaries,
        };
      }),
    );

    return c.json({ comparisons }, 200);
  },
);

// ---------------------------------------------------------------------------
// POST /salary-intelligence/ai-analysis
// ---------------------------------------------------------------------------

salaryIntelligenceRouter.openapi(
  createRoute({
    method: "post",
    path: "/salary-intelligence/ai-analysis",
    operationId: "triggerSalaryAIAnalysis",
    responses: {
      200: { description: "AI analysis result", content: { "application/json": { schema: z.any() } } },
      500: { description: "Server error" },
    },
  }),
  async (c) => {
    const db = getDb(c.env);

    try {
      // Fetch latest data
      const [snapshot] = await db
        .select()
        .from(marketSalarySnapshots)
        .where(eq(marketSalarySnapshots.status, "success"))
        .orderBy(desc(marketSalarySnapshots.runTimestamp))
        .limit(1);

      if (!snapshot) {
        return c.json({ error: "No salary data available for analysis" }, 500);
      }

      const stats = await db
        .select()
        .from(marketSalaryStats)
        .where(eq(marketSalaryStats.snapshotId, snapshot.id));

      const companySalaries = await db
        .select()
        .from(marketCompanySalaries)
        .where(eq(marketCompanySalaries.snapshotId, snapshot.id))
        .limit(50);

      const provider = new AiProvider(c.env);

      const prompt = `You are a Senior Career Data Analyst specializing in technology compensation markets.

Analyze the following market salary data and produce structured intelligence for a job seeker:

<MARKET_STATS>
${JSON.stringify(stats, null, 2)}
</MARKET_STATS>

<COMPANY_FILINGS_SAMPLE>
${JSON.stringify(companySalaries.slice(0, 30), null, 2)}
</COMPANY_FILINGS_SAMPLE>

<STRICT_OUTPUT_SCHEMA_INSTRUCTIONS>
Produce a JSON object with these exact keys:
1. "keyInsights" — array of 4-6 headline findings as short sentences (e.g. "Remote roles pay 15% less than SF local market")
2. "anomalies" — array of OBJECTS (NOT STRINGS). Each object must represent surprising data points or outliers, containing exactly two keys:
   - "title" (string): The outlier name/short summary.
   - "explanation" (string): Detailed explanation of why it is an anomaly.
   DO NOT return plain strings. Every entry in "anomalies" MUST be an object like {"title": "...", "explanation": "..."}.
3. "recommendations" — array of 3-4 career pivot advice items based on the data patterns
4. "marketNarrative" — a 2-3 paragraph markdown narrative summarizing the overall market picture
5. "topPayingSegments" — array of objects for the top 5 highest-paying segments, each with: "segment" (name), "median" (numeric value), and "context" (additional details/reasoning)
</STRICT_OUTPUT_SCHEMA_INSTRUCTIONS>`;

      const result = await provider.generateStructuredOutput({
        messages: [
          { role: "system", content: "You are a precise compensation analyst. Output valid JSON only, conforming strictly to the requested schema. Ensure the 'anomalies' property is an array of objects, not strings." },
          { role: "user", content: prompt },
        ],
        schema: z.object({
          keyInsights: z.array(z.string()),
          anomalies: z.array(z.object({ title: z.string(), explanation: z.string() })),
          recommendations: z.array(z.string()),
          marketNarrative: z.string(),
          topPayingSegments: z.array(z.object({ segment: z.string(), median: z.number(), context: z.string() })),
        }),
        schemaName: "SalaryDashboardInsights",
        temperature: 0.2,
        max_tokens: 4096,
      });

      // Persist the insight
      await db.insert(marketSalaryInsights).values({
        snapshotId: snapshot.id,
        insightText: JSON.stringify(result),
        metadata: {
          generatedAt: new Date().toISOString(),
          type: "dashboard_analysis",
          statsCount: stats.length,
          companiesCount: companySalaries.length,
        },
      });

      return c.json({ success: true, analysis: result }, 200);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  },
);

// ---------------------------------------------------------------------------
// CRUD: Saved Views
// ---------------------------------------------------------------------------

salaryIntelligenceRouter.openapi(
  createRoute({
    method: "get",
    path: "/salary-intelligence/views",
    operationId: "getSalaryDashboardViews",
    responses: {
      200: { description: "List of saved views", content: { "application/json": { schema: z.any() } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const views = await db.select().from(salaryDashboardViews).orderBy(desc(salaryDashboardViews.updatedAt));
    return c.json({ views }, 200);
  },
);

salaryIntelligenceRouter.openapi(
  createRoute({
    method: "post",
    path: "/salary-intelligence/views",
    operationId: "createSalaryDashboardView",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string(),
              filters: z.record(z.string(), z.unknown()),
              isDefault: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: "Created view", content: { "application/json": { schema: z.any() } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const body = c.req.valid("json");
    const now = new Date();

    // If setting as default, clear other defaults first
    if (body.isDefault) {
      await db
        .update(salaryDashboardViews)
        .set({ isDefault: 0, updatedAt: now })
        .where(eq(salaryDashboardViews.isDefault, 1));
    }

    const [view] = await db
      .insert(salaryDashboardViews)
      .values({
        name: body.name,
        filters: body.filters as any,
        isDefault: body.isDefault ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return c.json({ view }, 200);
  },
);

salaryIntelligenceRouter.openapi(
  createRoute({
    method: "patch",
    path: "/salary-intelligence/views/{id}",
    operationId: "updateSalaryDashboardView",
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().optional(),
              filters: z.record(z.string(), z.unknown()).optional(),
              isDefault: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: "Updated view", content: { "application/json": { schema: z.any() } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const now = new Date();

    if (body.isDefault) {
      await db
        .update(salaryDashboardViews)
        .set({ isDefault: 0, updatedAt: now })
        .where(eq(salaryDashboardViews.isDefault, 1));
    }

    const updateData: Record<string, unknown> = { updatedAt: now };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.filters !== undefined) updateData.filters = body.filters;
    if (body.isDefault !== undefined) updateData.isDefault = body.isDefault ? 1 : 0;

    const [updated] = await db
      .update(salaryDashboardViews)
      .set(updateData)
      .where(eq(salaryDashboardViews.id, Number(id)))
      .returning();

    return c.json({ view: updated }, 200);
  },
);

salaryIntelligenceRouter.openapi(
  createRoute({
    method: "delete",
    path: "/salary-intelligence/views/{id}",
    operationId: "deleteSalaryDashboardView",
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: { description: "Deleted", content: { "application/json": { schema: z.any() } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const { id } = c.req.valid("param");
    await db.delete(salaryDashboardViews).where(eq(salaryDashboardViews.id, Number(id)));
    return c.json({ success: true }, 200);
  },
);

// ---------------------------------------------------------------------------
// CRUD: Pinned Roles
// ---------------------------------------------------------------------------

salaryIntelligenceRouter.openapi(
  createRoute({
    method: "get",
    path: "/salary-intelligence/pinned-roles",
    operationId: "getSalaryPinnedRoles",
    responses: {
      200: { description: "List of pinned roles", content: { "application/json": { schema: z.any() } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const pinned = await db.select().from(salaryPinnedRoles).orderBy(desc(salaryPinnedRoles.pinnedAt));
    return c.json({ pinnedRoles: pinned }, 200);
  },
);

salaryIntelligenceRouter.openapi(
  createRoute({
    method: "post",
    path: "/salary-intelligence/pinned-roles",
    operationId: "pinRoleForComparison",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              roleId: z.string(),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: "Pinned role", content: { "application/json": { schema: z.any() } } },
      404: { description: "Role not found" },
      409: { description: "Role already pinned" },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const { roleId } = c.req.valid("json");

    // Check if already pinned
    const [existing] = await db
      .select()
      .from(salaryPinnedRoles)
      .where(eq(salaryPinnedRoles.roleId, roleId))
      .limit(1);

    if (existing) {
      return c.json({ error: "Role already pinned" }, 409);
    }

    // Fetch role data
    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) {
      return c.json({ error: "Role not found" }, 404);
    }

    const [pinned] = await db
      .insert(salaryPinnedRoles)
      .values({
        roleId: role.id,
        roleTitle: role.jobTitle,
        companyName: role.companyName || "Unknown",
        salaryMin: role.salaryMin,
        salaryMax: role.salaryMax,
        pinnedAt: new Date(),
      })
      .returning();

    return c.json({ pinnedRole: pinned }, 200);
  },
);

salaryIntelligenceRouter.openapi(
  createRoute({
    method: "delete",
    path: "/salary-intelligence/pinned-roles/{id}",
    operationId: "unpinRole",
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: { description: "Unpinned", content: { "application/json": { schema: z.any() } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const { id } = c.req.valid("param");
    await db.delete(salaryPinnedRoles).where(eq(salaryPinnedRoles.id, Number(id)));
    return c.json({ success: true }, 200);
  },
);
