/**
 * @fileoverview Service for generating, caching, and versioning role insights
 * across dimensions (location, compensation, combined).
 *
 * Uses SHA-256 input hashing for change detection — if a new analysis request
 * matches any prior hash for the same role+type, the existing result is returned
 * rather than re-running the AI analysis.
 */

import { desc, eq, and } from "drizzle-orm";
import { z } from "zod";

import type { RoleInsightType, RoleInsight } from "@/backend/db/schemas/applications/role-insights";

import { runLocationAnalysisAgents } from "@/ai/tasks/analyze/location";
import { getModelRegistry } from "@/backend/ai/models";
import { getDb } from "@/backend/db";
import {
  globalConfig,
  roleInsights,
  roles,
  roleBullets,
  scoringRubrics,
  marketSalarySnapshots,
  marketSalaryStats,
  marketCompanySalaries,
  marketSalaryInsights,
} from "@/backend/db/schema";
import { sql } from "drizzle-orm";
import { OpenRouteService } from "@/backend/services/openroute";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LocationAnalysisPayload = {
  /** Role location from metadata */
  location: string | null;
  /** Workplace type: remote, hybrid, onsite */
  workplaceType: string | null;
  /** RTO policy details */
  rtoPolicy: string | null;
  /** Commute details per mode/schedule/departure time */
  commuteTable: Array<{
    direction: "to_office" | "to_home";
    departureTime: string;
    mode: string;
    durationMinutes: number | null;
    monthlyCost: number | null;
  }>;
  /** Justin's home address used in analysis */
  homeAddress: string;
};

export type CompensationAnalysisPayload = {
  /** Advertised salary range */
  advertisedMin: number | null;
  advertisedMax: number | null;
  currency: string;
  /** Google TC baseline for comparison */
  googleBaseline: Record<string, unknown>;
  /** Negotiation analysis */
  negotiationTarget: number | null;
  negotiationRationale: string | null;
  /** Delta vs Google */
  deltaVsGoogle: number | null;
  /** Future promotion path */
  futurePromotionPath: number | null;
  /** Geographic positioning analysis (SF vs NYC vs Seattle vs Austin) */
  geographicPositioning: string | null;
  /** Remote vs local salary discount assessment */
  remoteDiscountAnalysis: string | null;
  /** Comparison to peer company H1B filings */
  industryPeerComparison: string | null;
  /** Context from the latest broad market trend analysis */
  marketTrendContext: string | null;
};

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class RoleInsightsService {
  /**
   * Compute the input hash for a given role + insight type.
   * Used for change detection — if the hash matches a prior version, skip re-analysis.
   */
  async computeInputHash(
    env: Env,
    roleId: string,
    type: RoleInsightType,
  ): Promise<{ hash: string; inputs: Record<string, unknown> }> {
    const db = getDb(env);

    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);

    if (!role) throw new Error(`Role not found: ${roleId}`);

    const bullets = await db.select().from(roleBullets).where(eq(roleBullets.roleId, roleId));

    const bulletsSorted = bullets
      .map((b) => `${b.type}:${b.content}`)
      .sort()
      .join("|");

    const meta = (role.metadata ?? {}) as Record<string, unknown>;

    if (type === "location") {
      const inputs = {
        location: meta.location ?? meta.city ?? null,
        workplaceType: meta.workplaceType ?? meta.workplace_type ?? null,
        rtoPolicy: meta.rtoPolicy ?? meta.rto_policy ?? null,
        bullets: bulletsSorted,
      };
      return { hash: await sha256(JSON.stringify(inputs)), inputs };
    }

    if (type === "compensation") {
      const inputs = {
        salaryMin: role.salaryMin,
        salaryMax: role.salaryMax,
        salaryCurrency: role.salaryCurrency,
        bullets: bulletsSorted,
      };
      return { hash: await sha256(JSON.stringify(inputs)), inputs };
    }

    // combined = location hash + compensation hash
    const locResult = await this.computeInputHash(env, roleId, "location");
    const compResult = await this.computeInputHash(env, roleId, "compensation");
    const inputs = { locationHash: locResult.hash, compensationHash: compResult.hash };
    return { hash: await sha256(JSON.stringify(inputs)), inputs };
  }

  /**
   * Get the latest insight for a role + type. Returns null if none exists.
   */
  async getLatestInsight(
    env: Env,
    roleId: string,
    type: RoleInsightType,
  ): Promise<RoleInsight | null> {
    const db = getDb(env);

    const [row] = await db
      .select()
      .from(roleInsights)
      .where(and(eq(roleInsights.roleId, roleId), eq(roleInsights.type, type)))
      .orderBy(desc(roleInsights.version))
      .limit(1);

    return row ?? null;
  }

  /**
   * Get all insight versions for a role + type.
   */
  async getInsightHistory(env: Env, roleId: string, type: RoleInsightType): Promise<RoleInsight[]> {
    const db = getDb(env);

    return db
      .select()
      .from(roleInsights)
      .where(and(eq(roleInsights.roleId, roleId), eq(roleInsights.type, type)))
      .orderBy(desc(roleInsights.version));
  }

  /**
   * Check if any dimension has changed inputs since the last analysis.
   */
  async checkForChanges(env: Env, roleId: string): Promise<Record<RoleInsightType, boolean>> {
    const types: RoleInsightType[] = ["location", "compensation", "combined"];
    const result: Record<string, boolean> = {};

    for (const type of types) {
      const { hash } = await this.computeInputHash(env, roleId, type);
      const latest = await this.getLatestInsight(env, roleId, type);
      result[type] = !latest || latest.inputHash !== hash;
    }

    return result as Record<RoleInsightType, boolean>;
  }

  /**
   * Generate a location insight for a role.
   * Returns cached result if input hash matches any prior version.
   */
  async generateLocationInsight(env: Env, roleId: string): Promise<RoleInsight> {
    const db = getDb(env);
    const { hash, inputs } = await this.computeInputHash(env, roleId, "location");

    // Check ALL versions for hash match (handles rollbacks)
    const [cached] = await db
      .select()
      .from(roleInsights)
      .where(
        and(
          eq(roleInsights.roleId, roleId),
          eq(roleInsights.type, "location"),
          eq(roleInsights.inputHash, hash),
        ),
      )
      .limit(1);

    if (cached) return cached;

    // Get role + metadata
    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) throw new Error(`Role not found: ${roleId}`);

    // Get scoring rubrics
    const rubrics = await db
      .select()
      .from(scoringRubrics)
      .where(and(eq(scoringRubrics.type, "location"), eq(scoringRubrics.isActive, true)));

    const meta = (role.metadata ?? {}) as Record<string, unknown>;
    const rawLocation = (inputs.location as string) ?? "Unknown";
    const workplaceType = (inputs.workplaceType as string) ?? "Unknown";
    const rtoPolicy = (inputs.rtoPolicy as string) ?? "Unknown";
    const homeAddress = "126 Colby St, San Francisco, CA 94134";

    // Prefer California/Bay Area location for commute targeting (user will never relocate)
    const caLocations = (meta.californiaLocations ?? []) as string[];
    const commuteTarget = caLocations.length > 0 ? caLocations[0] : rawLocation;
    const location = commuteTarget;

    // 1. Fetch real commute data from OpenRoute API
    let commuteFactualData = "Not available. Estimate using your geographic knowledge.";
    if (location !== "Unknown" && location.trim().length > 0) {
      try {
        const openRoute = new OpenRouteService(env);
        const summary = await openRoute.getCommuteSummary(homeAddress, location);
        if (summary.success) {
          const sourceLabel =
            summary.source === "google_maps" ? "Google Maps API (fallback)" : "OpenRoute API";
          commuteFactualData = `${sourceLabel} Driving Data: ${summary.distanceMiles.toFixed(1)} miles, ${summary.durationMinutes} minutes each way.`;
        } else {
          console.warn("OpenRoute commute summary failed:", summary.error);
        }
      } catch (e) {
        console.warn("Failed to invoke OpenRouteService:", e);
      }
    }

    const result = await this.executeLocationAI(
      env,
      { jobTitle: role.jobTitle, companyName: role.companyName },
      { location, workplaceType, rtoPolicy },
      commuteFactualData,
      rubrics,
    );

    // Compute next version
    const latest = await this.getLatestInsight(env, roleId, "location");
    const nextVersion = (latest?.version ?? 0) + 1;

    const payload: LocationAnalysisPayload = {
      location,
      workplaceType,
      rtoPolicy,
      commuteTable: result.commute_table.map((row: any) => ({
        direction: row.direction,
        departureTime: row.departure_time,
        mode: row.mode,
        durationMinutes: row.duration_minutes,
        monthlyCost: row.monthly_cost,
      })),
      homeAddress,
    };

    const id = crypto.randomUUID();
    const [inserted] = await db
      .insert(roleInsights)
      .values({
        id,
        roleId,
        version: nextVersion,
        type: "location",
        inputHash: hash,
        score: result.score,
        rationale: result.rationale,
        analysisPayload: payload as unknown as Record<string, unknown>,
        configSnapshot: { rubrics, workplaceAssessment: result.workplace_assessment },
      })
      .returning();

    return inserted;
  }

  /**
   * Generate a compensation insight for a role.
   * Returns cached result if input hash matches any prior version.
   */
  async generateCompensationInsight(env: Env, roleId: string): Promise<RoleInsight> {
    const db = getDb(env);
    const { hash } = await this.computeInputHash(env, roleId, "compensation");

    // Check ALL versions for hash match
    const [cached] = await db
      .select()
      .from(roleInsights)
      .where(
        and(
          eq(roleInsights.roleId, roleId),
          eq(roleInsights.type, "compensation"),
          eq(roleInsights.inputHash, hash),
        ),
      )
      .limit(1);

    if (cached) return cached;

    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) throw new Error(`Role not found: ${roleId}`);

    // Get scoring rubrics
    const rubrics = await db
      .select()
      .from(scoringRubrics)
      .where(and(eq(scoringRubrics.type, "compensation"), eq(scoringRubrics.isActive, true)));

    // Get compensation baseline from global config
    const [configRow] = await db
      .select()
      .from(globalConfig)
      .where(eq(globalConfig.key, "compensation_baseline"))
      .limit(1);

    const compensationBaseline = configRow?.value as Record<string, unknown> | null;

    // Get applicant profile config for locations and target roles
    const [profileRow] = await db
      .select()
      .from(globalConfig)
      .where(eq(globalConfig.key, "applicant_profile"))
      .limit(1);

    const profile = (profileRow?.value as any) || {
      location: "San Francisco Bay Area",
      locations: ["san francisco", "bay area", "sf"],
      hubs: ["San Francisco", "New York", "Seattle", "Austin"],
      target_roles: ["software engineer", "frontend", "backend", "fullstack", "devops"],
    };

    // Find the closest matching target role keyword
    const jobTitleLower = role.jobTitle.toLowerCase();
    let matchingRoleType = profile.target_roles[0] || "software engineer";
    for (const type of profile.target_roles) {
      if (jobTitleLower.includes(type.toLowerCase())) {
        matchingRoleType = type;
        break;
      }
    }

    // Fetch the latest successful snapshot ID and matching stats
    const [latestSnapshot] = await db
      .select({ id: marketSalarySnapshots.id })
      .from(marketSalarySnapshots)
      .where(eq(marketSalarySnapshots.status, "success"))
      .orderBy(desc(marketSalarySnapshots.runTimestamp))
      .limit(1);

    // ─── Build comprehensive market context ──────────────────────────────
    let marketStatsText = "No live market salary statistics found in local database.";
    let geographicBreakdownText = "";
    let peerCompaniesText = "";
    let remoteDiscountText = "";
    let trendInsightText = "";

    if (latestSnapshot) {
      // 1. Stats for the matching role type (primary context)
      const matchingStats = await db
        .select()
        .from(marketSalaryStats)
        .where(
          sql`${marketSalaryStats.snapshotId} = ${latestSnapshot.id} AND LOWER(${marketSalaryStats.roleType}) = ${matchingRoleType.toLowerCase()}`
        );

      if (matchingStats.length > 0) {
        marketStatsText = matchingStats
          .map(
            (s) =>
              `- ${s.metricLabel} (${s.metricKey}): 25th=$${s.p25.toLocaleString()}, median=$${s.median.toLocaleString()}, 75th=$${s.p75.toLocaleString()} (based on ${s.sampleSize.toLocaleString()} listings)`
          )
          .join("\n");
      }

      // 2. Geographic hub breakdown — ALL role types at the snapshot for cross-role context
      const allHubStats = await db
        .select()
        .from(marketSalaryStats)
        .where(eq(marketSalaryStats.snapshotId, latestSnapshot.id));

      if (allHubStats.length > 0) {
        // Group by metricKey (local_market, remote, top_hubs, national)
        const byMetric: Record<string, typeof allHubStats> = {};
        for (const s of allHubStats) {
          (byMetric[s.metricKey] ??= []).push(s);
        }

        const sections: string[] = [];
        for (const [metricKey, entries] of Object.entries(byMetric)) {
          const rows = entries
            .map(
              (s) =>
                `    * ${s.roleType}: 25th=$${s.p25.toLocaleString()}, median=$${s.median.toLocaleString()}, 75th=$${s.p75.toLocaleString()} (${s.sampleSize.toLocaleString()} listings)`
            )
            .join("\n");
          const label = entries[0]?.metricLabel || metricKey;
          sections.push(`  ${label} (${metricKey}):\n${rows}`);
        }
        geographicBreakdownText = sections.join("\n\n");

        // 3. Compute remote discount vs local market
        const localStats = matchingStats.find((s) => s.metricKey === "local_market");
        const remoteStats = matchingStats.find((s) => s.metricKey === "remote");
        if (localStats && remoteStats && localStats.median > 0) {
          const discount = ((localStats.median - remoteStats.median) / localStats.median) * 100;
          remoteDiscountText = `Remote roles for '${matchingRoleType}' carry a ${discount.toFixed(1)}% discount compared to ${profile.location} local market equivalents. Local median: $${localStats.median.toLocaleString()}, Remote median: $${remoteStats.median.toLocaleString()}.`;
        }
      }

      // 4. Company H1B data for the target company
      if (role.companyName) {
        const cleanCompany = role.companyName.toLowerCase().replace(/, inc\.?| inc\.?| l\.?l\.?c\.?/g, "").trim();
        const companySalaries = await db
          .select()
          .from(marketCompanySalaries)
          .where(
            sql`${marketCompanySalaries.snapshotId} = ${latestSnapshot.id} AND LOWER(${marketCompanySalaries.companyName}) LIKE ${"%" + cleanCompany + "%"}`
          );

        if (companySalaries.length > 0) {
          const compText = companySalaries
            .map(
              (c) =>
                `  * Title: ${c.jobTitle} (${c.seniority} seniority) — 25th=$${c.p25.toLocaleString()}, median=$${c.median.toLocaleString()}, 75th=$${c.p75.toLocaleString()} (${c.sampleSize.toLocaleString()} certified H1B applications)`
            )
            .join("\n");
          marketStatsText += `\n\nCompany H1B Certified Salaries for ${role.companyName}:\n${compText}`;
        }
      }

      // 5. Top 10 peer companies by H1B sample size for industry benchmarking
      const peerCompanies = await db
        .select()
        .from(marketCompanySalaries)
        .where(eq(marketCompanySalaries.snapshotId, latestSnapshot.id))
        .orderBy(desc(marketCompanySalaries.sampleSize))
        .limit(10);

      if (peerCompanies.length > 0) {
        peerCompaniesText = peerCompanies
          .map(
            (c) =>
              `- ${c.companyName} — ${c.jobTitle} (${c.seniority}): median=$${c.median.toLocaleString()}, 75th=$${c.p75.toLocaleString()} (${c.sampleSize.toLocaleString()} filings)`
          )
          .join("\n");
      }

      // 6. Latest broad market trend insight from market_salary_insights
      const [latestTrend] = await db
        .select()
        .from(marketSalaryInsights)
        .orderBy(desc(marketSalaryInsights.createdAt))
        .limit(1);

      if (latestTrend) {
        // Truncate to ~2000 chars to stay within prompt budget
        trendInsightText = latestTrend.insightText.length > 2000
          ? latestTrend.insightText.slice(0, 2000) + "\n[... truncated for prompt budget]"
          : latestTrend.insightText;
      }
    }

    const rubricText = rubrics
      .map((r) => `- ${r.criteria}: ${r.scoreRangeMin}–${r.scoreRangeMax}`)
      .join("\n");

    const CompensationInsightSchema = z.object({
      score: z.number().int().min(0).max(100).describe("Compensation score 0–100"),
      rationale: z.string().describe("Detailed rationale for the compensation score"),
      negotiation_target: z.number().nullable().describe("Recommended negotiation target salary"),
      negotiation_rationale: z.string().nullable().describe("Strategy for negotiation"),
      delta_vs_google: z
        .number()
        .nullable()
        .describe("Difference vs Google TC (positive = role pays more)"),
      advertised_assessment: z.string().nullable().describe("Assessment of the advertised range"),
      future_promotion_path: z
        .number()
        .nullable()
        .describe(
          "Estimated compensation for the next promotion level, computed as roughly 15-20% above the advertised max. Output as raw number (e.g., 280000).",
        ),
      geographic_positioning: z
        .string()
        .nullable()
        .describe(
          "How this role's compensation compares geographically across SF, NYC, Seattle, Austin, and national benchmarks. Reference specific percentile data.",
        ),
      remote_discount_analysis: z
        .string()
        .nullable()
        .describe(
          "Assessment of the remote vs local salary discount for this role type, with specific percentages and implications for negotiation.",
        ),
      industry_peer_comparison: z
        .string()
        .nullable()
        .describe(
          "How this role's compensation compares to peer companies' H1B certified filings. Reference specific companies and salary ranges.",
        ),
      market_trend_context: z
        .string()
        .nullable()
        .describe(
          "Relevant insights from the latest broad market salary trends analysis that apply to this role's compensation assessment.",
        ),
    });

    const baselineText = compensationBaseline
      ? JSON.stringify(compensationBaseline, null, 2)
      : "No compensation baseline configured.";

    const systemPrompt = `You are an expert career compensation analyst for Justin, evaluating a role's compensation against his historical Google compensation, live market statistics, geographic benchmarks, and industry H1B filing data.

Justin's Google Compensation Baseline:
${baselineText}

Live Aggregated Market Statistics (for matching role type '${matchingRoleType}'):
${marketStatsText}
${geographicBreakdownText ? `\n<GEOGRAPHIC_HUB_BREAKDOWN>\nComplete market salary percentiles across ALL geographic segments and role types:\n${geographicBreakdownText}\n</GEOGRAPHIC_HUB_BREAKDOWN>` : ""}
${remoteDiscountText ? `\n<REMOTE_DISCOUNT_DATA>\n${remoteDiscountText}\n</REMOTE_DISCOUNT_DATA>` : ""}
${peerCompaniesText ? `\n<INDUSTRY_PEER_COMPANIES_H1B>\nTop peer companies by H1B certified filings (sorted by sample size):\n${peerCompaniesText}\n</INDUSTRY_PEER_COMPANIES_H1B>` : ""}
${trendInsightText ? `\n<LATEST_MARKET_TRENDS>\n${trendInsightText}\n</LATEST_MARKET_TRENDS>` : ""}

Scoring rubrics:
${rubricText}

Analyze the role's compensation and provide:
1. A score (0–100) based on the rubrics
2. Where Justin could negotiate within the advertised range
3. How the compensation compares to his Google TC (~$260,672) and live market percentiles for his local job market (${profile.location}) and remote roles.
4. Net delta vs Google (positive means role pays more)
5. Geographic positioning: how this role's comp stacks up against SF, NYC, Seattle, Austin, and national medians. Factor in cost-of-living differentials.
6. Remote discount assessment: quantify the remote-vs-local premium/discount and its implications for this specific role.
7. Industry peer comparison: how does this company's pay compare to the top H1B filing companies for similar roles?
8. Market trend context: what relevant macro trends from the latest market analysis apply to this role?

You must respond with a valid JSON object matching the requested schema. DO NOT wrap your response in markdown fences.`;

    const userPrompt = `Role: ${role.jobTitle} at ${role.companyName}
Salary Range: ${role.salaryMin ? `$${role.salaryMin.toLocaleString()}` : "Not disclosed"} – ${role.salaryMax ? `$${role.salaryMax.toLocaleString()}` : "Not disclosed"}
Currency: ${role.salaryCurrency ?? "USD"}`;

    const { AiProvider } = await import("@/backend/ai/providers/index");
    let result = await new AiProvider(env).generateStructuredOutput({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      schema: CompensationInsightSchema,
      schemaName: "CompensationInsight",
      temperature: 0,
      max_tokens: 8096,
      model: getModelRegistry(env).analyze,
    });

    // ---------------------------------------------------------------------------
    // Retry with gpt-oss-120b if the first model left key fields null
    // ---------------------------------------------------------------------------
    const missingFields: string[] = [];
    if (result.negotiation_target == null) missingFields.push("negotiation_target");
    if (!result.negotiation_rationale) missingFields.push("negotiation_rationale");
    if (result.delta_vs_google == null) missingFields.push("delta_vs_google");
    if (!result.advertised_assessment) missingFields.push("advertised_assessment");
    if (result.future_promotion_path == null) missingFields.push("future_promotion_path");
    if (!result.geographic_positioning) missingFields.push("geographic_positioning");
    if (!result.remote_discount_analysis) missingFields.push("remote_discount_analysis");
    if (!result.industry_peer_comparison) missingFields.push("industry_peer_comparison");
    if (!result.market_trend_context) missingFields.push("market_trend_context");

    if (missingFields.length > 0) {
      console.warn(
        `[CompensationInsight] First pass left ${missingFields.length} field(s) null: ${missingFields.join(", ")}. Retrying with gpt-oss-120b.`,
      );

      try {
        const retrySystemPrompt = `${systemPrompt}

<RETRY_CONTEXT>
A prior model already produced a partial analysis but left the following fields empty: ${missingFields.join(", ")}.
The prior model's partial output is provided below. You MUST return a COMPLETE response — filling in ALL fields, including the ones the prior model missed. Use the partial output as a starting point so you do not lose any work already done.

Prior partial output:
${JSON.stringify(result, null, 2)}
</RETRY_CONTEXT>

<STRICT_COMPLETENESS_REQUIREMENT>
You MUST provide non-null values for ALL of these fields:
- negotiation_target: a numeric salary figure (compute from advertised range if needed)
- negotiation_rationale: a text strategy explaining the negotiation approach
- delta_vs_google: numeric difference between this role's midpoint TC and Google TC ($260,672). Positive = role pays more.
- advertised_assessment: text assessment of the advertised salary range
- future_promotion_path: numeric estimated TC at the next promotion level (typically 15-20% above advertised max)
- geographic_positioning: text comparing this role's comp across SF, NYC, Seattle, Austin, and national benchmarks
- remote_discount_analysis: text assessing the remote vs local salary discount for this role type
- industry_peer_comparison: text comparing this company's pay to top H1B filing companies
- market_trend_context: text noting relevant macro trends from the latest market analysis

If salary data is "Not disclosed", estimate based on market data for the role title and company, and note the estimate in your rationale.
</STRICT_COMPLETENESS_REQUIREMENT>`;

        const { AiProvider } = await import("@/backend/ai/providers/index");
        const retryResult = await new AiProvider(env).generateStructuredOutput({
          messages: [
            { role: "system", content: retrySystemPrompt },
            { role: "user", content: userPrompt },
          ],
          schema: CompensationInsightSchema,
          schemaName: "CompensationInsight",
          temperature: 0.1,
          max_tokens: 8096,
          model: getModelRegistry(env).analyze,
        });

        // Merge: prefer retry values for fields that were null, keep originals otherwise
        result = {
          score: retryResult.score ?? result.score,
          rationale: retryResult.rationale || result.rationale,
          negotiation_target: retryResult.negotiation_target ?? result.negotiation_target,
          negotiation_rationale: retryResult.negotiation_rationale || result.negotiation_rationale,
          delta_vs_google: retryResult.delta_vs_google ?? result.delta_vs_google,
          advertised_assessment: retryResult.advertised_assessment || result.advertised_assessment,
          future_promotion_path: retryResult.future_promotion_path ?? result.future_promotion_path,
          geographic_positioning: retryResult.geographic_positioning || result.geographic_positioning,
          remote_discount_analysis: retryResult.remote_discount_analysis || result.remote_discount_analysis,
          industry_peer_comparison: retryResult.industry_peer_comparison || result.industry_peer_comparison,
          market_trend_context: retryResult.market_trend_context || result.market_trend_context,
        };

        const stillMissing = missingFields.filter(
          (f) =>
            result[f as keyof typeof result] == null || result[f as keyof typeof result] === "",
        );
        if (stillMissing.length > 0) {
          console.warn(`[CompensationInsight] Retry still missing: ${stillMissing.join(", ")}`);
        } else {
          console.log("[CompensationInsight] Retry successfully filled all missing fields.");
        }
      } catch (retryError) {
        console.error("[CompensationInsight] Retry with gpt-oss-120b failed:", retryError);
        // Continue with partial result from first pass
      }
    }

    const latest = await this.getLatestInsight(env, roleId, "compensation");
    const nextVersion = (latest?.version ?? 0) + 1;

    const payload: CompensationAnalysisPayload = {
      advertisedMin: role.salaryMin,
      advertisedMax: role.salaryMax,
      currency: role.salaryCurrency ?? "USD",
      googleBaseline: compensationBaseline ?? {},
      negotiationTarget: result.negotiation_target ?? null,
      negotiationRationale: result.negotiation_rationale ?? null,
      deltaVsGoogle: result.delta_vs_google ?? null,
      futurePromotionPath: result.future_promotion_path ?? null,
      geographicPositioning: result.geographic_positioning ?? null,
      remoteDiscountAnalysis: result.remote_discount_analysis ?? null,
      industryPeerComparison: result.industry_peer_comparison ?? null,
      marketTrendContext: result.market_trend_context ?? null,
    };

    const id = crypto.randomUUID();
    const [inserted] = await db
      .insert(roleInsights)
      .values({
        id,
        roleId,
        version: nextVersion,
        type: "compensation",
        inputHash: hash,
        score: result.score,
        rationale: result.rationale,
        analysisPayload: payload as unknown as Record<string, unknown>,
        configSnapshot: {
          compensationBaseline,
          rubrics,
          advertisedAssessment: result.advertised_assessment ?? "Not available",
        },
      })
      .returning();

    return inserted;
  }

  /**
   * Generate a combined insight synthesizing location + compensation.
   */
  async generateCombinedInsight(env: Env, roleId: string): Promise<RoleInsight> {
    const db = getDb(env);
    const { hash } = await this.computeInputHash(env, roleId, "combined");

    const [cached] = await db
      .select()
      .from(roleInsights)
      .where(
        and(
          eq(roleInsights.roleId, roleId),
          eq(roleInsights.type, "combined"),
          eq(roleInsights.inputHash, hash),
        ),
      )
      .limit(1);

    if (cached) return cached;

    // Ensure both sub-insights exist
    const locationInsight = await this.generateLocationInsight(env, roleId);
    const compensationInsight = await this.generateCompensationInsight(env, roleId);

    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) throw new Error(`Role not found: ${roleId}`);

    const rubrics = await db
      .select()
      .from(scoringRubrics)
      .where(and(eq(scoringRubrics.type, "combined"), eq(scoringRubrics.isActive, true)));

    const rubricText = rubrics
      .map((r) => `- ${r.criteria}: ${r.scoreRangeMin}–${r.scoreRangeMax}`)
      .join("\n");

    const CombinedInsightSchema = z.object({
      score: z.number().int().min(0).max(100).describe("Combined value score 0–100"),
      rationale: z.string().describe("Synthesis of location and compensation analysis"),
    });

    const systemPrompt = `You are an expert career analyst synthesizing location and compensation dimensions into a single value score.

Location Score: ${locationInsight.score}/100
Location Rationale: ${locationInsight.rationale}

Compensation Score: ${compensationInsight.score}/100
Compensation Rationale: ${compensationInsight.rationale}

Scoring rubrics:
${rubricText}

Provide a combined score (0–100) that holistically weighs both dimensions. Consider trade-offs — e.g. a great salary might offset a moderate commute.

You must respond with a valid JSON object matching the requested schema. DO NOT wrap your response in markdown fences.`;

    const userPrompt = `Role: ${role.jobTitle} at ${role.companyName}
Synthesize the location and compensation analyses into a single value assessment.`;

    const { AiProvider } = await import("@/backend/ai/providers/index");
    let result: { score: number; rationale: string };
    try {
      result = await new AiProvider(env).generateStructuredOutput({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        schema: CombinedInsightSchema,
        schemaName: "CombinedInsight",
        temperature: 0,
        max_tokens: 8096,
        model: getModelRegistry(env).analyze,
      });
    } catch (err) {
      console.error("[CombinedInsight] AI failed to produce valid score:", err);
      // Fallback: average the two sub-scores so the score is never 0
      result = {
        score: Math.round((locationInsight.score + compensationInsight.score) / 2),
        rationale: `Automatically averaged from location (${locationInsight.score}/100) and compensation (${compensationInsight.score}/100) scores due to AI generation failure. Re-run for a detailed synthesis.`,
      };
    }

    const latest = await this.getLatestInsight(env, roleId, "combined");
    const nextVersion = (latest?.version ?? 0) + 1;

    const id = crypto.randomUUID();
    const [inserted] = await db
      .insert(roleInsights)
      .values({
        id,
        roleId,
        version: nextVersion,
        type: "combined",
        inputHash: hash,
        score: result.score,
        rationale: result.rationale,
        analysisPayload: {
          locationScore: locationInsight.score,
          compensationScore: compensationInsight.score,
          locationId: locationInsight.id,
          compensationId: compensationInsight.id,
        },
        configSnapshot: { rubrics },
      })
      .returning();

    return inserted;
  }

  /**
   * Executes the AI location analysis. Exposed publicly for health check and testing.
   */
  public async executeLocationAI(
    env: Env,
    roleData: { jobTitle: string; companyName: string },
    locationData: { location: string; workplaceType: string; rtoPolicy: string },
    commuteFactualData: string,
    rubrics: any[],
  ) {
    // ─── Try multi-agent pipeline first ─────────────────────────────────
    try {
      console.log(
        "[executeLocationAI] Attempting multi-agent pipeline (CommuteAgent + LocationAnalystAgent)",
      );
      const result = await runLocationAnalysisAgents(env, {
        roleData,
        locationData,
        commuteFactualData,
        rubrics,
      });
      console.log(
        `[executeLocationAI] Multi-agent pipeline succeeded — score: ${result.score}, rows: ${result.commute_table.length}`,
      );
      return result;
    } catch (agentError) {
      console.warn(
        "[executeLocationAI] Multi-agent pipeline failed, falling back to single-prompt:",
        agentError instanceof Error ? agentError.message : agentError,
      );
    }

    // ─── Fallback: existing single-prompt approach ──────────────────────
    const rubricText = rubrics
      .map((r) => `- ${r.criteria}: ${r.scoreRangeMin}–${r.scoreRangeMax}`)
      .join("\n");

    const LocationInsightSchema = z.object({
      score: z.number().int().min(0).max(100).describe("Location score 0–100"),
      rationale: z.string().describe("Detailed rationale for the location score"),
      commute_table: z.array(
        z.object({
          direction: z
            .enum(["to_office", "to_home"])
            .describe("Whether commuting to office or back home"),
          departure_time: z.string().describe("Departure time, e.g. '8:30 AM', '5:00 PM'"),
          mode: z
            .string()
            .describe(
              "Transportation mode, e.g. 'Driving (Tesla Model 3)', 'BART + Walk', 'Muni + Walk'",
            ),
          duration_minutes: z
            .number()
            .nullable()
            .describe("Estimated door-to-door commute duration in minutes"),
          monthly_cost: z
            .number()
            .nullable()
            .describe("Estimated monthly cost for this commute mode at full-time frequency"),
        }),
      ),
      workplace_assessment: z.string().describe("Assessment of WFH/hybrid/onsite fit"),
    });

    const systemPrompt = `You are an expert career location analyst for Justin, a tech professional based in San Francisco (94134, specifically 126 Colby St).

Justin's commute preferences:
- Strongly prefers WFH (work from home)
- Acceptable: hybrid 2 days/week with short commute
- Benchmark: 7 years commuting SF→Mountain View via Google Bus (free transit)
- Currently drives a Tesla Model 3
- Has access to BART and Muni for public transit

Scoring rubrics:
${rubricText}

Analyze the role's location and provide a score (0–100) based on the rubrics above.
Consider: commute time, cost, frequency, and quality of life impact.

You MUST populate commute_table with entries for ALL of the following combinations:

MORNING DEPARTURES (direction: "to_office"):
- Departure times: 8:30 AM, 9:00 AM, 9:30 AM, 10:00 AM
- Modes for EACH time: "Driving (Tesla Model 3)", "BART + Walk", "Muni + Walk"
- Total: 12 morning rows (4 times × 3 modes)

EVENING DEPARTURES (direction: "to_home"):
- Departure times: 4:00 PM, 4:30 PM, 5:00 PM, 5:30 PM, 6:00 PM
- Modes for EACH time: "Driving (Tesla Model 3)", "BART + Walk", "Muni + Walk"
- Total: 15 evening rows (5 times × 3 modes)

All durations must be DOOR-TO-DOOR estimates (include walking to/from stations, waiting, transfers).
Monthly cost should assume 3 days/week in-office frequency.
Use the factual commute data provided as the baseline for driving estimates and adjust for traffic patterns at each departure time.

You must respond with a valid JSON object matching the requested schema. DO NOT wrap your response in markdown fences.`;

    const userPrompt = `Role: ${roleData.jobTitle} at ${roleData.companyName}
Location: ${locationData.location}
Workplace Type: ${locationData.workplaceType}
RTO Policy: ${locationData.rtoPolicy}

Factual Commute Data: ${commuteFactualData}

Provide a comprehensive location analysis with the commute table covering all requested departure times and transportation modes.`;

    const { AiProvider } = await import("@/backend/ai/providers/index");
    return await new AiProvider(env).generateStructuredOutput({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      schema: LocationInsightSchema,
      schemaName: "LocationInsight",
      temperature: 0,
      max_tokens: 8096,
      model: getModelRegistry(env).analyze,
    });
  }
}
