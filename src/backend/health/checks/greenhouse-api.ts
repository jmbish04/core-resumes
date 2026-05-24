/**
 * @fileoverview Health check: Greenhouse API availability.
 *
 * Verifies that the Greenhouse public boards API is reachable and returning
 * valid job data. Tests against the first active board_token stored in D1,
 * falling back to the DEFAULT_BOARD_TOKENS env var split.
 *
 * Sub-checks:
 * 1. API reachability — HEAD request to the boards endpoint
 * 2. JSON parse — full GET + validate response structure
 * 3. Job count — at least 1 job returned
 */

import { eq } from "drizzle-orm";

import type { GreenhouseJob, HealthStepResult } from "@/backend/health/types";

import { getDb } from "@/backend/db";
import { boardTokens } from "@/backend/db/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the first usable board token from D1 or env fallback. */
async function resolveTestToken(env: Env): Promise<{ token: string; source: "d1" | "env" }> {
  try {
    const db = getDb(env);
    const [row] = await db
      .select({ token: boardTokens.token })
      .from(boardTokens)
      .where(eq(boardTokens.isActive, true))
      .limit(1);

    if (row?.token) return { token: row.token, source: "d1" };
  } catch {
    // D1 might not be available — fall through
  }

  // Env-var fallback: comma-separated list
  const tokens = (env.DEFAULT_BOARD_TOKENS ?? "cloudflare").split(",");
  return { token: tokens[0].trim(), source: "env" };
}

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

export async function checkGreenhouseApi(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const details: Record<string, unknown> = {};

  try {
    const { token, source } = await resolveTestToken(env);
    details.boardToken = token;
    details.tokenSource = source;

    const baseUrl = env.GREENHOUSE_API_BASE ?? "https://boards-api.greenhouse.io/v1/boards";
    const url = `${baseUrl}/${token}/jobs`;

    // Sub-check 1: Reachability (HEAD with timeout)
    const headStart = Date.now();
    const headRes = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(5_000),
    });
    details.headLatencyMs = Date.now() - headStart;
    details.headStatus = headRes.status;

    if (!headRes.ok) {
      return {
        status: "fail",
        latencyMs: Date.now() - start,
        error: `Greenhouse API HEAD returned ${headRes.status} for board '${token}'`,
        details,
      };
    }

    // Sub-check 2: Full GET + JSON parse
    const getStart = Date.now();
    const getRes = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    details.getLatencyMs = Date.now() - getStart;

    if (!getRes.ok) {
      return {
        status: "fail",
        latencyMs: Date.now() - start,
        error: `Greenhouse API GET returned ${getRes.status}`,
        details,
      };
    }

    const body = (await getRes.json()) as { jobs?: GreenhouseJob[] };

    // Sub-check 3: Valid structure
    if (!Array.isArray(body.jobs)) {
      return {
        status: "fail",
        latencyMs: Date.now() - start,
        error: "Greenhouse API response missing 'jobs' array",
        details,
      };
    }

    details.jobCount = body.jobs.length;

    if (body.jobs.length === 0) {
      return {
        status: "warn",
        latencyMs: Date.now() - start,
        error: `Board '${token}' returned 0 jobs (board may be empty or deprecated)`,
        details,
      };
    }

    // Sample first job for details
    const sample = body.jobs[0];
    details.sampleJob = {
      id: sample.id,
      title: sample.title,
      location: sample.location?.name ?? "unknown",
    };

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
