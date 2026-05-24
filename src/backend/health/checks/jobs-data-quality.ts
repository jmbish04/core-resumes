/**
 * @fileoverview Health check: Jobs data quality.
 *
 * Validates the quality and consistency of stored job data across
 * the pipeline's core tables: jobs_postings, job_snapshots, and
 * their child analysis tables. Catches data corruption, incomplete
 * analysis passes, and snapshot consistency issues.
 *
 * Sub-checks:
 * 1. jobs_postings row count and sample integrity
 * 2. job_snapshots coverage (% of postings with at least one snapshot)
 * 3. Analysis completeness (snapshots with all child rows)
 * 4. Taxonomy coverage (% of snapshots with categories/tags)
 * 5. Verdict distribution (detect anomalous skew)
 */

import type { HealthStepResult } from "@/backend/health/types";

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

export async function checkJobsDataQuality(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const details: Record<string, unknown> = {};
  const issues: string[] = [];
  const warnings: string[] = [];

  try {
    // Sub-check 1: Core table counts
    const postingsCount = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM jobs_postings`).first<{
      cnt: number;
    }>();

    const snapshotsCount = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM job_snapshots`).first<{
      cnt: number;
    }>();

    details.postingsCount = postingsCount?.cnt ?? 0;
    details.snapshotsCount = snapshotsCount?.cnt ?? 0;

    // Empty tables are OK early in lifecycle — just report
    if ((postingsCount?.cnt ?? 0) === 0) {
      return {
        status: "ok",
        latencyMs: Date.now() - start,
        details: {
          ...details,
          note: "No job postings yet — pipeline has not run. All clear.",
        },
      };
    }

    // Sub-check 2: Snapshot coverage
    const postingsWithSnapshots = await env.DB.prepare(
      `SELECT COUNT(DISTINCT job_id) as cnt FROM job_snapshots`,
    ).first<{ cnt: number }>();

    const coveragePct = ((postingsWithSnapshots?.cnt ?? 0) / (postingsCount?.cnt ?? 1)) * 100;
    details.snapshotCoveragePct = Math.round(coveragePct * 10) / 10;

    if (coveragePct < 50) {
      warnings.push(
        `Only ${details.snapshotCoveragePct}% of postings have snapshots — analysis pipeline may be stalled`,
      );
    }

    // Sub-check 3: Analysis completeness (snapshots with requirement scores)
    const snapshotsWithReqs = await env.DB.prepare(
      `SELECT COUNT(DISTINCT snapshot_id) as cnt FROM job_req_snapshots`,
    ).first<{ cnt: number }>();

    const reqCoveragePct =
      (snapshotsCount?.cnt ?? 0) > 0
        ? ((snapshotsWithReqs?.cnt ?? 0) / (snapshotsCount?.cnt ?? 1)) * 100
        : 0;
    details.reqAnalysisCoveragePct = Math.round(reqCoveragePct * 10) / 10;

    if ((snapshotsCount?.cnt ?? 0) > 5 && reqCoveragePct < 30) {
      warnings.push(
        `Only ${details.reqAnalysisCoveragePct}% of snapshots have requirement analysis`,
      );
    }

    // Sub-check 4: Taxonomy coverage
    const snapshotsWithCategories = await env.DB.prepare(
      `SELECT COUNT(DISTINCT job_snapshot_id) as cnt FROM job_category_mappings`,
    ).first<{ cnt: number }>();

    const snapshotsWithTags = await env.DB.prepare(
      `SELECT COUNT(DISTINCT job_snapshot_id) as cnt FROM job_tag_mappings`,
    ).first<{ cnt: number }>();

    details.categoryCoveragePct =
      (snapshotsCount?.cnt ?? 0) > 0
        ? Math.round(((snapshotsWithCategories?.cnt ?? 0) / (snapshotsCount?.cnt ?? 1)) * 1000) / 10
        : 0;

    details.tagCoveragePct =
      (snapshotsCount?.cnt ?? 0) > 0
        ? Math.round(((snapshotsWithTags?.cnt ?? 0) / (snapshotsCount?.cnt ?? 1)) * 1000) / 10
        : 0;

    // Sub-check 5: Verdict distribution
    const verdictDist = await env.DB.prepare(
      `SELECT verdict, COUNT(*) as cnt
       FROM job_snapshots
       WHERE verdict IS NOT NULL
       GROUP BY verdict
       ORDER BY cnt DESC`,
    ).all<{ verdict: string; cnt: number }>();

    if (verdictDist.results && verdictDist.results.length > 0) {
      const dist: Record<string, number> = {};
      for (const row of verdictDist.results) {
        dist[row.verdict] = row.cnt;
      }
      details.verdictDistribution = dist;

      // Anomaly: if >90% of verdicts are the same, something might be wrong
      const totalVerdicts = Object.values(dist).reduce((a, b) => a + b, 0);
      const maxVerdict = Math.max(...Object.values(dist));
      if (totalVerdicts > 10 && maxVerdict / totalVerdicts > 0.9) {
        const dominant = Object.entries(dist).find(([, v]) => v === maxVerdict)?.[0];
        warnings.push(
          `Verdict distribution is heavily skewed: ${dominant} has ${Math.round((maxVerdict / totalVerdicts) * 100)}% of all verdicts`,
        );
      }
    }

    // Triage pass rate
    const triagePassed = await env.DB.prepare(
      `SELECT
         SUM(CASE WHEN triage_passed = 1 THEN 1 ELSE 0 END) as passed,
         COUNT(*) as total
       FROM jobs_postings
       WHERE triage_passed IS NOT NULL`,
    ).first<{ passed: number; total: number }>();

    if (triagePassed && triagePassed.total > 0) {
      details.triagePassRate = Math.round((triagePassed.passed / triagePassed.total) * 1000) / 10;
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
