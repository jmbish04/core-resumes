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

import { and, count, desc, eq, lt } from "drizzle-orm";
import { getDb } from "@/backend/db";
import { sessionRuns, apiCompanySyncStats } from "@/backend/db/schema";
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
    const db = getDb(env);

    // Sub-check 1: Latest session
    const [latestSession] = await db
      .select()
      .from(sessionRuns)
      .orderBy(desc(sessionRuns.timestamp))
      .limit(1);

    if (!latestSession) {
      // Check if sync stats has entries to avoid false positive warning when session_runs is cleared
      const [syncStats] = await db
        .select()
        .from(apiCompanySyncStats)
        .orderBy(desc(apiCompanySyncStats.runTimestamp))
        .limit(1);

      if (syncStats) {
        details.latestSessionUuid = `sync-run-${syncStats.id}`;
        details.latestTimestamp = syncStats.runTimestamp.toISOString();
        const sessionAgeHours = (Date.now() - syncStats.runTimestamp.getTime()) / 3600000;
        details.sessionAgeHours = Math.round(sessionAgeHours * 10) / 10;
        
        details.latestStats = {
          scraped: syncStats.filesProcessed,
          triaged: 0,
          analyzed: 0,
          failed: syncStats.status === "failed" ? 1 : 0,
          costUsd: 0,
          failureRatePct: syncStats.status === "failed" ? 100 : 0,
        };
        
        const [totalSessionsRow] = await db
          .select({ cnt: count() })
          .from(apiCompanySyncStats);
        details.totalSessions = totalSessionsRow?.cnt ?? 0;
      } else {
        return {
          status: "warn",
          latencyMs: Date.now() - start,
          error: "No pipeline sessions found — scanner has never run",
          details: { sessionCount: 0 },
        };
      }
    } else {
      details.latestSessionUuid = latestSession.sessionUuid;
      details.latestTimestamp = latestSession.timestamp.toISOString();

      // Age check
      const sessionAgeHours = (Date.now() - latestSession.timestamp.getTime()) / 3600000;
      details.sessionAgeHours = Math.round(sessionAgeHours * 10) / 10;

      if (sessionAgeHours > MAX_STALE_HOURS) {
        warnings.push(
          `Latest session is ${details.sessionAgeHours}h old (threshold: ${MAX_STALE_HOURS}h)`,
        );
      }

      // Sub-check 2: Failure rate
      const totalProcessed = latestSession.totalTriaged + latestSession.totalAnalyzed;
      const failureRate =
        totalProcessed > 0 ? (latestSession.totalFailed / totalProcessed) * 100 : 0;

      details.latestStats = {
        scraped: latestSession.totalScraped,
        triaged: latestSession.totalTriaged,
        analyzed: latestSession.totalAnalyzed,
        failed: latestSession.totalFailed,
        costUsd: parseFloat(latestSession.totalCost || "0.0"),
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
    const cutoffDate = new Date(Date.now() - MAX_RUNNING_MINUTES * 60 * 1000);
    const [stuckSessionsRow] = await db
      .select({ cnt: count() })
      .from(sessionRuns)
      .where(
        and(
          eq(sessionRuns.totalScraped, 0),
          eq(sessionRuns.totalTriaged, 0),
          eq(sessionRuns.totalAnalyzed, 0),
          eq(sessionRuns.totalFailed, 0),
          lt(sessionRuns.timestamp, cutoffDate)
        )
      );

    details.stuckSessions = stuckSessionsRow?.cnt ?? 0;

    if ((stuckSessionsRow?.cnt ?? 0) > 0) {
      warnings.push(
        `${stuckSessionsRow!.cnt} session(s) appear stuck (started >${MAX_RUNNING_MINUTES}min ago, zero results)`,
      );
    }

    // Sub-check 4: Total session count
    const [totalSessionsRow] = await db
      .select({ cnt: count() })
      .from(sessionRuns);

    details.totalSessions = totalSessionsRow?.cnt ?? 0;

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
