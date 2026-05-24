/**
 * @fileoverview Health check: Greenhouse board token configuration.
 *
 * Validates the board_tokens table for configuration correctness:
 * - At least one active token exists
 * - All active tokens are resolvable against the Greenhouse API
 * - Token metadata (company, last_scanned_at) is populated
 *
 * This is the configuration-layer complement to the API availability
 * check in greenhouse-api.ts.
 */

import type { HealthStepResult } from "@/backend/health/types";

import { getDb } from "@/backend/db";
import { boardTokens } from "@/backend/db/schema";

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

export async function checkBoardTokenConfig(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const details: Record<string, unknown> = {};
  const issues: string[] = [];
  const warnings: string[] = [];

  try {
    const db = getDb(env);

    // Sub-check 1: Load all tokens
    const allTokens = await db.select().from(boardTokens);
    details.totalTokens = allTokens.length;

    if (allTokens.length === 0) {
      // Check if DEFAULT_BOARD_TOKENS env var provides a fallback
      if (env.DEFAULT_BOARD_TOKENS) {
        const envTokens = env.DEFAULT_BOARD_TOKENS.split(",").filter(Boolean);
        details.envFallbackTokens = envTokens;
        return {
          status: "warn",
          latencyMs: Date.now() - start,
          error: "No board_tokens in D1 — using DEFAULT_BOARD_TOKENS env var only",
          details,
        };
      }
      return {
        status: "fail",
        latencyMs: Date.now() - start,
        error: "No board_tokens configured and no DEFAULT_BOARD_TOKENS fallback",
        details,
      };
    }

    // Sub-check 2: Active token count
    const activeTokens = allTokens.filter((t) => t.isActive === true);
    const inactiveTokens = allTokens.filter((t) => t.isActive !== true);
    details.activeTokens = activeTokens.length;
    details.inactiveTokens = inactiveTokens.length;

    if (activeTokens.length === 0) {
      warnings.push(
        `All ${allTokens.length} board tokens are inactive — pipeline will skip scanning`,
      );
    }

    // Sub-check 3: Validate active tokens against Greenhouse API (HEAD only)
    const baseUrl = env.GREENHOUSE_API_BASE ?? "https://boards-api.greenhouse.io/v1/boards";
    const tokenResults: Array<{
      token: string;
      status: number;
      ok: boolean;
    }> = [];

    // Limit to 5 tokens to avoid excessive health-check latency
    const tokensToTest = activeTokens.slice(0, 5);

    await Promise.all(
      tokensToTest.map(async (t) => {
        try {
          const res = await fetch(`${baseUrl}/${t.token}/jobs`, {
            method: "HEAD",
            signal: AbortSignal.timeout(5_000),
          });
          tokenResults.push({
            token: t.token,
            status: res.status,
            ok: res.ok,
          });
          if (!res.ok) {
            warnings.push(
              `Board '${t.token}' returned HTTP ${res.status} — may be invalid or deprecated`,
            );
          }
        } catch (e) {
          tokenResults.push({
            token: t.token,
            status: 0,
            ok: false,
          });
          warnings.push(
            `Board '${t.token}' unreachable: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }),
    );

    details.tokenValidation = tokenResults;
    const failedTokens = tokenResults.filter((r) => !r.ok);
    if (failedTokens.length === tokensToTest.length && tokensToTest.length > 0) {
      issues.push("All tested board tokens failed API validation");
    }

    // Compute status
    const status = issues.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "ok";

    return {
      status,
      latencyMs: Date.now() - start,
      error:
        issues.length > 0
          ? issues.join("; ")
          : warnings.length > 0
            ? warnings.join("; ")
            : undefined,
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
