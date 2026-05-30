/**
 * @fileoverview Health check: Greenhouse API availability (multi-token sampling).
 *
 * Verifies that the Greenhouse public boards API is reachable and returning
 * valid job data. Samples up to 5 tokens from three sources (api_companies,
 * board_tokens, env fallback) and applies a 1/5 pass threshold.
 *
 * Sub-checks (per token):
 * 1. API reachability — GET request to the boards endpoint
 * 2. JSON parse — validate response structure
 * 3. Job count — at least 1 job returned
 */

import { eq, and, sql } from "drizzle-orm";

import type { GreenhouseJob, HealthStepResult } from "@/backend/health/types";

import { getDb } from "@/backend/db";
import { apiCompanies, boardTokens, globalConfig } from "@/backend/db/schema";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SAMPLE_SIZE = 5;
const PER_TOKEN_TIMEOUT_MS = 5_000;
const BASE_URL = "https://boards-api.greenhouse.io/v1/boards";

// ---------------------------------------------------------------------------
// Token result type
// ---------------------------------------------------------------------------

interface TokenTestResult {
  token: string;
  source: "api_companies" | "board_tokens" | "env";
  status: number;
  ok: boolean;
  jobCount: number;
  sampleJob?: { id: number; title: string; location: string };
  error?: string;
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect unique Greenhouse tokens from all available sources. */
async function collectTokenPool(
  env: Env,
): Promise<Array<{ token: string; source: TokenTestResult["source"] }>> {
  const pool: Array<{ token: string; source: TokenTestResult["source"] }> = [];
  const seen = new Set<string>();

  try {
    const db = getDb(env);

    /**
     * SELF-SERVICE HEALTH CHECK CONFIGURATION INGESTION
     * 
     * Rationale: Standard pipelines scan hundreds of client Greenhouse tokens, some of which
     * may be private, deprecated, or require authorization. To prevent the health service 
     * from raising false alarms due to random board scan failures, we check the global key-value 
     * store for the custom "health_check_config" populated via the GUI page.
     * 
     * If configured, the health service bypasses D1 scanning/env defaults entirely and tests
     * ONLY these known valid, active public Greenhouse boards (e.g. cloudflare, anthropic).
     */
    const configRows = await db
      .select({ value: globalConfig.value })
      .from(globalConfig)
      .where(eq(globalConfig.key, "health_check_config"))
      .limit(1);

    if (configRows.length > 0 && configRows[0].value) {
      const config = configRows[0].value as { greenhouse_tokens?: string[] };
      if (Array.isArray(config.greenhouse_tokens) && config.greenhouse_tokens.length > 0) {
        for (const token of config.greenhouse_tokens) {
          const t = token.trim();
          if (t && !seen.has(t)) {
            seen.add(t);
            pool.push({ token: t, source: "env" });
          }
        }
        return pool;
      }
    }

    // Source 1: api_companies (greenhouse system, active)
    const apiRows = await db
      .select({ token: apiCompanies.jobBoardToken })
      .from(apiCompanies)
      .where(
        and(
          eq(apiCompanies.system, "greenhouse"),
          eq(apiCompanies.isActive, true),
        ),
      )
      .limit(200);

    for (const row of apiRows) {
      if (row.token && !seen.has(row.token)) {
        seen.add(row.token);
        pool.push({ token: row.token, source: "api_companies" });
      }
    }

    // Source 2: board_tokens (active)
    const boardRows = await db
      .select({ token: boardTokens.token })
      .from(boardTokens)
      .where(eq(boardTokens.isActive, true));

    for (const row of boardRows) {
      if (row.token && !seen.has(row.token)) {
        seen.add(row.token);
        pool.push({ token: row.token, source: "board_tokens" });
      }
    }
  } catch {
    // D1 might not be available — fall through to env
  }

  // Source 3: env fallback
  const envTokens = (env.DEFAULT_BOARD_TOKENS ?? "cloudflare").split(",");
  for (const raw of envTokens) {
    const t = raw.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      pool.push({ token: t, source: "env" });
    }
  }

  return pool;
}

/** Fisher-Yates shuffle and take N. */
function sampleTokens<T>(pool: T[], n: number): T[] {
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

/** Test a single Greenhouse board token. */
async function testToken(
  token: string,
  source: TokenTestResult["source"],
  baseUrl: string,
): Promise<TokenTestResult> {
  const start = Date.now();
  try {
    const url = `${baseUrl}/${token}/jobs`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(PER_TOKEN_TIMEOUT_MS),
    });

    if (!res.ok) {
      return {
        token,
        source,
        status: res.status,
        ok: false,
        jobCount: 0,
        error: `HTTP ${res.status}`,
        latencyMs: Date.now() - start,
      };
    }

    const body = (await res.json()) as { jobs?: GreenhouseJob[] };

    if (!Array.isArray(body.jobs)) {
      return {
        token,
        source,
        status: res.status,
        ok: false,
        jobCount: 0,
        error: "Response missing 'jobs' array",
        latencyMs: Date.now() - start,
      };
    }

    const sample = body.jobs[0];
    return {
      token,
      source,
      status: res.status,
      ok: true,
      jobCount: body.jobs.length,
      sampleJob: sample
        ? {
            id: sample.id,
            title: sample.title,
            location: sample.location?.name ?? "unknown",
          }
        : undefined,
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    return {
      token,
      source,
      status: 0,
      ok: false,
      jobCount: 0,
      error: e instanceof Error ? e.message : String(e),
      latencyMs: Date.now() - start,
    };
  }
}

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

export async function checkGreenhouseApi(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const details: Record<string, unknown> = {};

  try {
    const baseUrl = env.GREENHOUSE_API_BASE ?? BASE_URL;

    // Collect and sample tokens
    const pool = await collectTokenPool(env);
    details.tokenPoolSize = pool.length;

    if (pool.length === 0) {
      return {
        status: "fail",
        latencyMs: Date.now() - start,
        error: "No Greenhouse tokens available from any source (api_companies, board_tokens, env)",
        details,
      };
    }

    const sampled = sampleTokens(pool, MAX_SAMPLE_SIZE);
    details.tokensSampled = sampled.length;

    // Test all sampled tokens in parallel
    const results = await Promise.all(
      sampled.map((s) => testToken(s.token, s.source, baseUrl)),
    );

    const passed = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    details.tokenResults = results.map((r) => ({
      token: r.token,
      source: r.source,
      ok: r.ok,
      status: r.status,
      jobCount: r.jobCount,
      latencyMs: r.latencyMs,
      error: r.error,
      sampleJob: r.sampleJob,
    }));
    details.passedCount = passed.length;
    details.failedCount = failed.length;
    details.passRate = `${passed.length}/${results.length}`;

    // 1/5 pass threshold
    if (passed.length === 0) {
      return {
        status: "fail",
        latencyMs: Date.now() - start,
        error: `All ${results.length} sampled Greenhouse tokens failed API validation`,
        details,
      };
    }

    // Some failed but at least one passed
    if (failed.length > 0) {
      return {
        status: "warn",
        latencyMs: Date.now() - start,
        error: `${failed.length}/${results.length} Greenhouse tokens failed: ${failed.map((f) => `${f.token} (${f.error})`).join(", ")}`,
        details,
      };
    }

    return {
      status: "ok",
      latencyMs: Date.now() - start,
      details,
    };
  } catch (e) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
      details,
    };
  }
}
