/**
 * @fileoverview Health check: Freelance pipeline data quality.
 *
 * Validates semantic correctness, data freshness, logical constraints,
 * pipeline metrics, and triage distribution for the freelance pipeline.
 *
 * Sub-checks:
 * 1. Counts of core freelance tables
 * 2. Triage coverage (percentage of opportunities triaged)
 * 3. Proposal generation rate (percentage of "bid" decisions drafted)
 * 4. Scan success analytics and recent failure rates
 * 5. Freshness / scheduling check (last successful scan within 24h)
 * 6. Mathematical sanity checks (budget bounds, client rating out-of-bounds)
 * 7. Decision distribution skew checking
 */

import type { HealthStepResult, CheckStatus } from "@/backend/health/types";

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

export async function checkFreelanceDataQuality(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const details: Record<string, unknown> = {};
  const issues: string[] = [];
  const warnings: string[] = [];

  try {
    // 1. Core table row counts
    const oppsCount = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM freelance_opportunities`
    ).first<{ cnt: number }>();

    const triageCount = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM freelance_triage`
    ).first<{ cnt: number }>();

    const proposalsCount = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM freelance_proposals`
    ).first<{ cnt: number }>();

    const scanRunsCount = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM freelance_scan_runs`
    ).first<{ cnt: number }>();

    const profileSettingsCount = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM freelance_profile`
    ).first<{ cnt: number }>();

    details.opportunitiesCount = oppsCount?.cnt ?? 0;
    details.triageCount = triageCount?.cnt ?? 0;
    details.proposalsCount = proposalsCount?.cnt ?? 0;
    details.scanRunsCount = scanRunsCount?.cnt ?? 0;
    details.profileSettingsCount = profileSettingsCount?.cnt ?? 0;

    // If there is no freelance data yet, return clean state (early lifecycle)
    if ((oppsCount?.cnt ?? 0) === 0) {
      return {
        status: "ok" as CheckStatus,
        latencyMs: Date.now() - start,
        details: {
          ...details,
          note: "No freelance opportunities scraped yet — all clear.",
        },
      };
    }

    // 2. Triage coverage
    const triagedOpps = await env.DB.prepare(
      `SELECT COUNT(DISTINCT opportunity_id) as cnt FROM freelance_triage`
    ).first<{ cnt: number }>();

    const triageCoveragePct = ((triagedOpps?.cnt ?? 0) / (oppsCount?.cnt ?? 1)) * 100;
    details.triageCoveragePct = Math.round(triageCoveragePct * 10) / 10;

    if ((oppsCount?.cnt ?? 0) > 10 && triageCoveragePct < 50) {
      warnings.push(
        `Only ${details.triageCoveragePct}% of scraped freelance opportunities have been triaged — agent may be lagging`
      );
    }

    // 3. Proposal draft generation rate
    const bidVerdicts = await env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM freelance_triage WHERE decision = 'bid'`
    ).first<{ cnt: number }>();

    const bidProposals = await env.DB.prepare(
      `SELECT COUNT(DISTINCT opportunity_id) as cnt FROM freelance_proposals`
    ).first<{ cnt: number }>();

    details.totalBidVerdicts = bidVerdicts?.cnt ?? 0;
    details.proposalsDraftedCount = bidProposals?.cnt ?? 0;

    if (bidVerdicts && bidVerdicts.cnt > 0) {
      const proposalDraftRatePct = (bidProposals!.cnt / bidVerdicts.cnt) * 100;
      details.proposalDraftRatePct = Math.round(proposalDraftRatePct * 10) / 10;
      
      if (bidVerdicts.cnt > 5 && proposalDraftRatePct < 25) {
        warnings.push(
          `Proposal draft rate is low: only ${details.proposalDraftRatePct}% of 'bid' recommendations have drafts`
        );
      }
    } else {
      details.proposalDraftRatePct = 0;
    }

    // 4. Scan success analytics and recent failure rates
    if ((scanRunsCount?.cnt ?? 0) > 0) {
      try {
        const recentRuns = await env.DB.prepare(
          `SELECT status FROM freelance_scan_runs ORDER BY created_at DESC LIMIT 20`
        ).all<{ status: string }>();

        const runsList = recentRuns.results ?? [];
        const totalRecent = runsList.length;
        const failedRecent = runsList.filter((r) => r.status === "failed").length;
        const failureRatePct = totalRecent > 0 ? (failedRecent / totalRecent) * 100 : 0;

        details.recentScansTotal = totalRecent;
        details.recentScansFailed = failedRecent;
        details.recentScanFailureRatePct = Math.round(failureRatePct * 10) / 10;

        if (totalRecent > 5 && failureRatePct > 20) {
          warnings.push(
            `High scan failure rate: ${details.recentScanFailureRatePct}% of recent freelance scans have failed`
          );
        }
      } catch (err) {
        warnings.push(`Could not calculate recent scan failure analytics: ${String(err)}`);
      }
    }

    // 5. Freshness / scheduling check
    try {
      const latestSuccess = await env.DB.prepare(
        `SELECT created_at FROM freelance_scan_runs WHERE status = 'completed' ORDER BY created_at DESC LIMIT 1`
      ).first<{ created_at: string | number }>();

      if (latestSuccess) {
        const rawDate = latestSuccess.created_at;
        const lastSuccessDate = typeof rawDate === "number"
          ? new Date(rawDate * 1000)
          : new Date(rawDate);

        const ageMs = Date.now() - lastSuccessDate.getTime();
        const ageHours = Math.round((ageMs / (1000 * 60 * 60)) * 10) / 10;
        details.lastSuccessfulScanAgeHours = ageHours;

        if (ageHours > 24) {
          warnings.push(
            `Stale freelance scans: The last successful scanner run completed ${ageHours} hours ago (expected <24h)`
          );
        }
      } else {
        details.lastSuccessfulScanAgeHours = null;
        if ((oppsCount?.cnt ?? 0) > 0) {
          warnings.push("No successful freelance scan runs found in database history");
        }
      }
    } catch (err) {
      warnings.push(`Failed to perform data freshness check: ${String(err)}`);
    }

    // 6. Logical and semantic boundary checks
    try {
      // Bounds 1: budgetMin > budgetMax
      const invalidBudgets = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM freelance_opportunities
         WHERE budget_min IS NOT NULL AND budget_max IS NOT NULL AND budget_min > budget_max`
      ).first<{ cnt: number }>();

      details.invalidBudgetRangeRows = invalidBudgets?.cnt ?? 0;
      if ((invalidBudgets?.cnt ?? 0) > 0) {
        warnings.push(
          `${invalidBudgets!.cnt} rows in freelance_opportunities have budget_min greater than budget_max`
        );
      }

      // Bounds 2: out-of-bounds client scores
      const invalidScores = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM freelance_opportunities
         WHERE client_score IS NOT NULL AND (client_score < 0.0 OR client_score > 5.0)`
      ).first<{ cnt: number }>();

      details.invalidClientScoreRows = invalidScores?.cnt ?? 0;
      if ((invalidScores?.cnt ?? 0) > 0) {
        warnings.push(
          `${invalidScores!.cnt} opportunities have invalid client reputation ratings (score outside [0.0, 5.0])`
        );
      }
    } catch (err) {
      warnings.push(`Bounds constraints verification failed: ${String(err)}`);
    }

    // 7. Decision distribution skew checking
    if ((triageCount?.cnt ?? 0) > 0) {
      try {
        const decisionsDist = await env.DB.prepare(
          `SELECT decision, COUNT(*) as cnt FROM freelance_triage GROUP BY decision ORDER BY cnt DESC`
        ).all<{ decision: string; cnt: number }>();

        const dist: Record<string, number> = {};
        for (const row of decisionsDist.results ?? []) {
          dist[row.decision] = row.cnt;
        }
        details.triageDecisionDistribution = dist;

        const totalDecided = Object.values(dist).reduce((a, b) => a + b, 0);
        const maxDecisionVal = Math.max(...Object.values(dist));
        if (totalDecided > 10 && maxDecisionVal / totalDecided > 0.95) {
          const dominant = Object.entries(dist).find(([, v]) => v === maxDecisionVal)?.[0];
          warnings.push(
            `Triage decision skew: dominant decision "${dominant}" comprises ${Math.round((maxDecisionVal / totalDecided) * 100)}% of all verdicts (possible parsing anomaly)`
          );
        }
      } catch (err) {
        warnings.push(`Decision distribution aggregation failed: ${String(err)}`);
      }
    }

    // Compute status
    const status: CheckStatus = issues.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "ok";

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
      status: "fail" as CheckStatus,
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
      details,
    };
  }
}
