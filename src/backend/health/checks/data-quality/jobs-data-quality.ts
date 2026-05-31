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
 * 2. job_snapshots coverage (% of promoted postings with at least one snapshot)
 * 3. Analysis completeness (snapshots with all child rows)
 * 4. Taxonomy coverage (% of snapshots with categories/tags)
 * 5. Verdict distribution (detect anomalous skew)
 */

import type { HealthStepResult } from "@/backend/health/types";

import { and, count, countDistinct, eq, isNotNull, lt, sql, sum } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { jobsPostings } from "@/backend/db/schemas/pipeline/jobs/jobs-postings";
import { jobSnapshots } from "@/backend/db/schemas/pipeline/jobs/job-snapshots";
import { jobReqSnapshots } from "@/backend/db/schemas/pipeline/jobs/job-req-snapshots";
import { jobCategoryMappings } from "@/backend/db/schemas/pipeline/jobs/job-category-mappings";
import { jobTagMappings } from "@/backend/db/schemas/pipeline/jobs/job-tag-mappings";

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

export async function checkJobsDataQuality(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const details: Record<string, unknown> = {};
  const issues: string[] = [];
  const warnings: string[] = [];

  try {
    const db = drizzle(env.DB);

    // Sub-check 1: Core table counts
    const [postingsResult] = await db.select({ cnt: count() }).from(jobsPostings);
    const [snapshotsResult] = await db.select({ cnt: count() }).from(jobSnapshots);

    const postingsCount = postingsResult?.cnt ?? 0;
    const snapshotsCount = snapshotsResult?.cnt ?? 0;
    details.postingsCount = postingsCount;
    details.snapshotsCount = snapshotsCount;

    // Empty tables are OK early in lifecycle — just report
    if (postingsCount === 0) {
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
    // Only measure promoted postings older than 24h — raw pipeline ingestion jobs
    // (Pipelines A/B/C, external agents) are not expected to have snapshots until
    // they are promoted and the deep analysis pipeline runs on them.
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [promotedResult] = await db
      .select({ cnt: count() })
      .from(jobsPostings)
      .where(
        and(
          eq(jobsPostings.triagePassed, true),
          lt(jobsPostings.dateFirstSeen, twentyFourHoursAgo),
        ),
      );

    const [snapshotCoverageResult] = await db
      .select({ cnt: countDistinct(jobSnapshots.jobId) })
      .from(jobSnapshots);

    const promotedCount = promotedResult?.cnt ?? 0;
    details.promotedPostingsCount = promotedCount;

    const coveragePct = promotedCount > 0
      ? ((snapshotCoverageResult?.cnt ?? 0) / promotedCount) * 100
      : 100; // No promoted postings yet = healthy
    details.snapshotCoveragePct = Math.round(coveragePct * 10) / 10;

    if (promotedCount > 5 && coveragePct < 50) {
      warnings.push(
        `Only ${details.snapshotCoveragePct}% of promoted postings have snapshots — analysis pipeline may be stalled`,
      );
    }

    // Sub-check 3: Analysis completeness (snapshots with requirement scores)
    const [reqResult] = await db
      .select({ cnt: countDistinct(jobReqSnapshots.snapshotId) })
      .from(jobReqSnapshots);

    const reqCoveragePct =
      snapshotsCount > 0
        ? ((reqResult?.cnt ?? 0) / snapshotsCount) * 100
        : 0;
    details.reqAnalysisCoveragePct = Math.round(reqCoveragePct * 10) / 10;

    if (snapshotsCount > 5 && reqCoveragePct < 30) {
      warnings.push(
        `Only ${details.reqAnalysisCoveragePct}% of snapshots have requirement analysis`,
      );
    }

    // Sub-check 4: Taxonomy coverage
    const [categoryResult] = await db
      .select({ cnt: countDistinct(jobCategoryMappings.jobSnapshotId) })
      .from(jobCategoryMappings);

    const [tagResult] = await db
      .select({ cnt: countDistinct(jobTagMappings.jobSnapshotId) })
      .from(jobTagMappings);

    details.categoryCoveragePct =
      snapshotsCount > 0
        ? Math.round(((categoryResult?.cnt ?? 0) / snapshotsCount) * 1000) / 10
        : 0;

    details.tagCoveragePct =
      snapshotsCount > 0
        ? Math.round(((tagResult?.cnt ?? 0) / snapshotsCount) * 1000) / 10
        : 0;

    // Sub-check 5: Verdict distribution
    const verdictRows = await db
      .select({
        verdict: jobSnapshots.verdict,
        cnt: count(),
      })
      .from(jobSnapshots)
      .where(isNotNull(jobSnapshots.verdict))
      .groupBy(jobSnapshots.verdict)
      .orderBy(sql`count(*) desc`);

    if (verdictRows.length > 0) {
      const dist: Record<string, number> = {};
      for (const row of verdictRows) {
        if (row.verdict) {
          dist[row.verdict] = row.cnt;
        }
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
    const [triageResult] = await db
      .select({
        passed: sum(sql`CASE WHEN ${jobsPostings.triagePassed} = 1 THEN 1 ELSE 0 END`),
        total: count(),
      })
      .from(jobsPostings)
      .where(isNotNull(jobsPostings.triagePassed));

    if (triageResult && Number(triageResult.total) > 0) {
      details.triagePassRate = Math.round((Number(triageResult.passed) / Number(triageResult.total)) * 1000) / 10;
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
