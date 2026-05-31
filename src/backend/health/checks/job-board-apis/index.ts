/**
 * @fileoverview Unified Job Board API health check entrypoint.
 *
 * Aggregates the 4 modular job board API health checks (Greenhouse board
 * tokens, AshbyHQ API, Gem API, RSS feeds) into a single `HealthStepResult`.
 *
 * Each check runs in parallel via `Promise.allSettled`. The unified result
 * includes a per-provider breakdown in `details.providers` and an overall
 * pass/fail status.
 *
 * To add a new provider health check:
 * 1. Create `<provider>-api.ts` in this directory
 * 2. Import and add it to the `Promise.allSettled` array below
 */

import type { HealthStepResult } from "@/backend/health/types";

import { checkAshbyApi } from "./ashby-api";
import { checkBoardTokenConfig } from "./board-token-config";
import { checkGemApi } from "./gem-api";
import { checkRssFeeds } from "./rss-feeds";

// ---------------------------------------------------------------------------
// Provider check descriptor
// ---------------------------------------------------------------------------

interface ProviderCheck {
  name: string;
  fn: (env: Env) => Promise<HealthStepResult>;
}

const PROVIDER_CHECKS: ProviderCheck[] = [
  { name: "greenhouse", fn: checkBoardTokenConfig },
  { name: "ashby", fn: checkAshbyApi },
  { name: "gem", fn: checkGemApi },
  { name: "rss_feeds", fn: checkRssFeeds },
];

// ---------------------------------------------------------------------------
// Unified check
// ---------------------------------------------------------------------------

/**
 * Run all job board API health checks and aggregate into a single result.
 *
 * Output shape in `details`:
 * ```json
 * {
 *   "providers": {
 *     "greenhouse": { "status": "ok", "latencyMs": 123, ... },
 *     "ashby":      { "status": "warn", "latencyMs": 456, "error": "..." },
 *     "gem":        { "status": "ok", "latencyMs": 789, ... },
 *     "rss_feeds":  { "status": "ok", "latencyMs": 234, ... }
 *   },
 *   "providerCount": 4,
 *   "passCount": 3,
 *   "warnCount": 1,
 *   "failCount": 0
 * }
 * ```
 */
export async function checkJobBoardApiConnectivity(
  env: Env,
): Promise<HealthStepResult> {
  const start = Date.now();
  const providers: Record<string, HealthStepResult> = {};

  // Run all provider checks in parallel
  const results = await Promise.allSettled(
    PROVIDER_CHECKS.map(async (check) => {
      const result = await check.fn(env);
      return { name: check.name, result };
    }),
  );

  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (const settled of results) {
    if (settled.status === "fulfilled") {
      const { name, result } = settled.value;
      providers[name] = result;

      if (result.status === "ok") passCount++;
      else if (result.status === "warn" || result.status === "skipped") warnCount++;
      else failCount++;
    } else {
      // Promise rejected — treat as fail
      const idx = results.indexOf(settled);
      const checkName = PROVIDER_CHECKS[idx]?.name ?? "unknown";
      providers[checkName] = {
        status: "fail",
        latencyMs: Date.now() - start,
        error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
      };
      failCount++;
    }
  }

  // Compute overall status
  const overallStatus =
    failCount > 0 ? "fail"
    : warnCount > 0 ? "warn"
    : "ok";

  const issues: string[] = [];
  for (const [name, result] of Object.entries(providers)) {
    if (result.status === "fail") {
      issues.push(`${name}: ${result.error ?? "failed"}`);
    }
  }

  return {
    status: overallStatus,
    latencyMs: Date.now() - start,
    error: issues.length > 0 ? issues.join("; ") : undefined,
    details: {
      providers,
      providerCount: PROVIDER_CHECKS.length,
      passCount,
      warnCount,
      failCount,
    },
  };
}
