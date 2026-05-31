/**
 * @fileoverview Health check: Gem API availability (multi-token sampling).
 *
 * Verifies that the Gem public Job Board API is reachable and returning
 * valid job data. Samples up to 5 tokens from `health_check_config`
 * (key: `gem_tokens`) or falls back to `api_companies` where
 * `system = 'gem'` and applies a 1/5 pass threshold.
 *
 * Endpoint: GET https://api.gem.com/job_board/v0/{vanity_slug}/job_posts
 * (public, no authentication required for public boards)
 *
 * Sub-checks (per token):
 * 1. API reachability — GET request with timeout
 * 2. JSON parse — validate response structure
 * 3. Job count — at least 1 job returned
 */

import { eq, and } from "drizzle-orm";

import type { GemJob, HealthStepResult } from "@/backend/health/types";

import { getDb } from "@/backend/db";
import { apiCompanies, globalConfig } from "@/backend/db/schema";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SAMPLE_SIZE = 5;
const PER_TOKEN_TIMEOUT_MS = 5_000;
const BASE_URL = "https://api.gem.com/job_board/v0";

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

/** Collect unique Gem tokens from config or api_companies. */
async function collectGemTokens(env: Env): Promise<string[]> {
  const tokens: string[] = [];
  const seen = new Set<string>();

  try {
    const db = getDb(env);

    /**
     * SELF-SERVICE HEALTH CHECK CONFIGURATION INGESTION
     *
     * If configured via the GUI, the health service tests ONLY these
     * known valid, active public Gem boards (e.g. gc-ai).
     */
    const configRows = await db
      .select({ value: globalConfig.value })
      .from(globalConfig)
      .where(eq(globalConfig.key, "health_check_config"))
      .limit(1);

    if (configRows.length > 0 && configRows[0].value) {
      const config = configRows[0].value as { gem_tokens?: string[] };
      if (Array.isArray(config.gem_tokens) && config.gem_tokens.length > 0) {
        for (const token of config.gem_tokens) {
          const t = token.trim();
          if (t && !seen.has(t)) {
            seen.add(t);
            tokens.push(t);
          }
        }
        return tokens;
      }
    }

    // Fallback: query api_companies for gem system entries
    const rows = await db
      .select({ token: apiCompanies.jobBoardToken })
      .from(apiCompanies)
      .where(
        and(
          eq(apiCompanies.system, "gem"),
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
 * Gem job board API response shape.
 * The public endpoint returns `{ job_posts: [...] }` where each post has
 * `id`, `title`, `location`, `department`, `is_remote`, `published_at`, etc.
 */
interface GemBoardResponse {
  job_posts?: GemJob[];
}

/** Test a single Gem board token. */
async function testToken(token: string): Promise<TokenTestResult> {
  const start = Date.now();
  try {
    const url = `${BASE_URL}/${token}/job_posts`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
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

    const body = (await res.json()) as GemBoardResponse;

    if (!Array.isArray(body.job_posts)) {
      return {
        token,
        status: res.status,
        ok: false,
        jobCount: 0,
        error: "Response missing 'job_posts' array",
        latencyMs: Date.now() - start,
      };
    }

    const sample = body.job_posts[0];
    return {
      token,
      status: res.status,
      ok: true,
      jobCount: body.job_posts.length,
      sampleJob: sample
        ? {
            id: sample.id,
            title: sample.title,
            location: sample.location?.name ?? (sample.is_remote ? "Remote" : "unknown"),
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

export async function checkGemApi(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const details: Record<string, unknown> = {};

  try {
    // Collect Gem tokens from config or api_companies
    const pool = await collectGemTokens(env);
    details.tokenPoolSize = pool.length;

    if (pool.length === 0) {
      return {
        status: "warn",
        latencyMs: Date.now() - start,
        error: "No Gem tokens found in health_check_config or api_companies (system='gem', is_active=true). Gem health check skipped.",
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
        error: `All ${results.length} sampled Gem tokens failed API validation`,
        details,
      };
    }

    // Some failed but at least one passed
    if (failed.length > 0) {
      return {
        status: "warn",
        latencyMs: Date.now() - start,
        error: `${failed.length}/${results.length} Gem tokens failed: ${failed.map((f) => `${f.token} (${f.error})`).join(", ")}`,
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
