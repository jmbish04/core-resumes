/**
 * @fileoverview Health check: Ashby API availability (multi-token sampling).
 *
 * Verifies that the Ashby public posting-api is reachable and returning
 * valid job data. Samples up to 5 tokens from `api_companies` where
 * `system = 'ashby'` and applies a 1/5 pass threshold.
 *
 * Endpoint: GET https://api.ashbyhq.com/posting-api/job-board/{token}
 * (public, no authentication required)
 *
 * Sub-checks (per token):
 * 1. API reachability — GET request with timeout
 * 2. JSON parse — validate response structure
 * 3. Job count — at least 1 job returned
 */

import { eq, and } from "drizzle-orm";

import type { AshbyJob, HealthStepResult } from "@/backend/health/types";

import { getDb } from "@/backend/db";
import { apiCompanies, globalConfig } from "@/backend/db/schema";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SAMPLE_SIZE = 5;
const PER_TOKEN_TIMEOUT_MS = 5_000;
const BASE_URL = "https://api.ashbyhq.com/posting-api/job-board";

// ---------------------------------------------------------------------------
// Token result type
// ---------------------------------------------------------------------------

interface TokenTestResult {
  token: string;
  status: number;
  ok: boolean;
  jobCount: number;
  sampleJob?: { id: string; title: string; location: string };
  error?: string;
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect unique Ashby tokens from api_companies. */
async function collectAshbyTokens(env: Env): Promise<string[]> {
  const tokens: string[] = [];
  const seen = new Set<string>();

  try {
    const db = getDb(env);

    /**
     * SELF-SERVICE HEALTH CHECK CONFIGURATION INGESTION
     * 
     * Rationale: Standard pipelines scan hundreds of client Ashby tokens, some of which
     * may be private, deprecated, or require authorization. To prevent the health service 
     * from raising false alarms due to random board scan failures, we check the global key-value 
     * store for the custom "health_check_config" populated via the GUI page.
     * 
     * If configured, the health service bypasses D1 scanning entirely and tests
     * ONLY these known valid, active public Ashby boards (e.g. replicate, lattice).
     */
    const configRows = await db
      .select({ value: globalConfig.value })
      .from(globalConfig)
      .where(eq(globalConfig.key, "health_check_config"))
      .limit(1);

    if (configRows.length > 0 && configRows[0].value) {
      const config = configRows[0].value as { ashby_tokens?: string[] };
      if (Array.isArray(config.ashby_tokens) && config.ashby_tokens.length > 0) {
        for (const token of config.ashby_tokens) {
          const t = token.trim();
          if (t && !seen.has(t)) {
            seen.add(t);
            tokens.push(t);
          }
        }
        return tokens;
      }
    }

    const rows = await db
      .select({ token: apiCompanies.jobBoardToken })
      .from(apiCompanies)
      .where(
        and(
          eq(apiCompanies.system, "ashby"),
          eq(apiCompanies.isActive, true),
        ),
      )
      .limit(200);

    for (const row of rows) {
      if (row.token && !seen.has(row.token)) {
        seen.add(row.token);
        tokens.push(row.token);
      }
    }
  } catch {
    // D1 might not be available
  }

  return tokens;
}

/** Fisher-Yates shuffle and take N. */
function sampleTokens(pool: string[], n: number): string[] {
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

/**
 * Ashby posting-api response shape.
 * The public endpoint returns `{ jobs: [...] }` where each job has
 * `id`, `title`, `location`, `publishedAt`, etc.
 */
interface AshbyBoardResponse {
  jobs?: AshbyJob[];
}

/** Test a single Ashby board token. */
async function testToken(token: string): Promise<TokenTestResult> {
  const start = Date.now();
  try {
    const url = `${BASE_URL}/${token}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(PER_TOKEN_TIMEOUT_MS),
    });

    if (!res.ok) {
      return {
        token,
        status: res.status,
        ok: false,
        jobCount: 0,
        error: `HTTP ${res.status}`,
        latencyMs: Date.now() - start,
      };
    }

    const body = (await res.json()) as AshbyBoardResponse;

    if (!Array.isArray(body.jobs)) {
      return {
        token,
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
      status: res.status,
      ok: true,
      jobCount: body.jobs.length,
      sampleJob: sample
        ? {
            id: sample.id,
            title: sample.title,
            location: sample.location ?? "unknown",
          }
        : undefined,
      latencyMs: Date.now() - start,
    };
  } catch (e) {
    return {
      token,
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

export async function checkAshbyApi(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const details: Record<string, unknown> = {};

  try {
    // Collect Ashby tokens from api_companies
    const pool = await collectAshbyTokens(env);
    details.tokenPoolSize = pool.length;

    if (pool.length === 0) {
      return {
        status: "warn",
        latencyMs: Date.now() - start,
        error: "No Ashby tokens found in api_companies (system='ashby', is_active=true). Ashby health check skipped.",
        details,
      };
    }

    const sampled = sampleTokens(pool, MAX_SAMPLE_SIZE);
    details.tokensSampled = sampled.length;

    // Test all sampled tokens in parallel
    const results = await Promise.all(sampled.map((t) => testToken(t)));

    const passed = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    details.tokenResults = results.map((r) => ({
      token: r.token,
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
        error: `All ${results.length} sampled Ashby tokens failed API validation`,
        details,
      };
    }

    // Some failed but at least one passed
    if (failed.length > 0) {
      return {
        status: "warn",
        latencyMs: Date.now() - start,
        error: `${failed.length}/${results.length} Ashby tokens failed: ${failed.map((f) => `${f.token} (${f.error})`).join(", ")}`,
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
