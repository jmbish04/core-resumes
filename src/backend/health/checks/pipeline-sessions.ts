/**
 * @fileoverview Health check: Pipeline session consistency.
 *
 * Examines the `session_runs` table for signs of unhealthy pipeline
 * execution: stuck sessions, abnormally high failure rates, or stale
 * scan data. This is a "canary in the coal mine" check that surfaces
 * systemic issues before they become user-visible.
 *
 * Sub-checks:
 * 1. Most recent session run exists and is not ancient
 * 2. Latest session failure rate is below threshold
 * 3. No sessions stuck in "running" status longer than 30 minutes
 * 4. Total pipeline execution count (observability metric)
 */

import type { HealthStepResult } from "@/backend/health/types";

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/** Maximum acceptable failure rate per session (%) */
const MAX_FAILURE_RATE_PCT = 50;
/** Maximum age of the latest session before warning (hours) */
const MAX_STALE_HOURS = 48;
/** Maximum time a session can be in "running" state (minutes) */
const MAX_RUNNING_MINUTES = 30;

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

export async function checkPipelineSessions(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const details: Record<string, unknown> = {};
  const issues: string[] = [];
  const warnings: string[] = [];

  try {
    // Sub-check 1: Latest session
    const latestSession = await env.DB.prepare(
      `SELECT *
       FROM session_runs
       ORDER BY timestamp DESC
       LIMIT 1`,
    ).first<{
      id: number;
      session_uuid: string;
      timestamp: number;
      total_scraped: number;
      total_triaged: number;
      total_analyzed: number;
      total_failed: number;
      total_cost_usd: number;
    }>();

    if (!latestSession) {
      // Check if sync stats has entries to avoid false positive warning when session_runs is cleared
      const syncStats = await env.DB.prepare(
        `SELECT * FROM api_company_sync_stats ORDER BY run_timestamp DESC LIMIT 1`
      ).first<{
        id: number;
        run_timestamp: number;
        status: string;
        files_processed: number;
      }>();

      if (syncStats) {
        details.latestSessionUuid = `sync-run-${syncStats.id}`;
        details.latestTimestamp = new Date(syncStats.run_timestamp * 1000).toISOString();
        const sessionAgeHours = (Date.now() / 1000 - syncStats.run_timestamp) / 3600;
        details.sessionAgeHours = Math.round(sessionAgeHours * 10) / 10;
        
        details.latestStats = {
          scraped: syncStats.files_processed,
          triaged: 0,
          analyzed: 0,
          failed: syncStats.status === "failed" ? 1 : 0,
          costUsd: 0,
          failureRatePct: syncStats.status === "failed" ? 100 : 0,
        };
        
        const totalSessions = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM api_company_sync_stats`).first<{
          cnt: number;
        }>();
        details.totalSessions = totalSessions?.cnt ?? 0;
      } else {
        return {
          status: "warn",
          latencyMs: Date.now() - start,
          error: "No pipeline sessions found — scanner has never run",
          details: { sessionCount: 0 },
        };
      }
    } else {
      details.latestSessionUuid = latestSession.session_uuid;
      details.latestTimestamp = new Date(latestSession.timestamp * 1000).toISOString();

      // Age check
      const sessionAgeHours = (Date.now() / 1000 - latestSession.timestamp) / 3600;
      details.sessionAgeHours = Math.round(sessionAgeHours * 10) / 10;

      if (sessionAgeHours > MAX_STALE_HOURS) {
        warnings.push(
          `Latest session is ${details.sessionAgeHours}h old (threshold: ${MAX_STALE_HOURS}h)`,
        );
      }

      // Sub-check 2: Failure rate
      const totalProcessed = latestSession.total_triaged + latestSession.total_analyzed;
      const failureRate =
        totalProcessed > 0 ? (latestSession.total_failed / totalProcessed) * 100 : 0;

      details.latestStats = {
        scraped: latestSession.total_scraped,
        triaged: latestSession.total_triaged,
        analyzed: latestSession.total_analyzed,
        failed: latestSession.total_failed,
        costUsd: latestSession.total_cost_usd,
        failureRatePct: Math.round(failureRate * 10) / 10,
      };

      if (failureRate > MAX_FAILURE_RATE_PCT) {
        issues.push(
          `Latest session failure rate ${Math.round(failureRate)}% exceeds ${MAX_FAILURE_RATE_PCT}% threshold`,
        );
      }
    }

    // Sub-check 3: Stuck sessions — sessions with no end timestamp
    // (timestamp + reasonable-max-duration exceeded)
    const cutoffEpoch = Math.floor(Date.now() / 1000) - MAX_RUNNING_MINUTES * 60;
    const stuckSessions = await env.DB.prepare(
      `SELECT COUNT(*) as cnt
       FROM session_runs
       WHERE total_scraped = 0
         AND total_triaged = 0
         AND total_analyzed = 0
         AND total_failed = 0
         AND timestamp < ?`,
    )
      .bind(cutoffEpoch)
      .first<{ cnt: number }>();

    details.stuckSessions = stuckSessions?.cnt ?? 0;

    if ((stuckSessions?.cnt ?? 0) > 0) {
      warnings.push(
        `${stuckSessions!.cnt} session(s) appear stuck (started >${MAX_RUNNING_MINUTES}min ago, zero results)`,
      );
    }

    // Sub-check 4: Total session count
    const totalSessions = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM session_runs`).first<{
      cnt: number;
    }>();

    details.totalSessions = totalSessions?.cnt ?? 0;

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
