import type { AggregateInsight } from "../../types";

/**
 * Industry-wide compensation trend: average market_salary_stats.median per
 * successful snapshot, oldest → newest. Needs ≥3 snapshots spanning ≥3 months.
 */
export async function runIndustryCompTrends(db: D1Database): Promise<AggregateInsight> {
  const { results: snapshots } = await db
    .prepare(
      "SELECT id, run_timestamp FROM market_salary_snapshots WHERE status = 'success' ORDER BY run_timestamp ASC",
    )
    .all<{ id: number; run_timestamp: number }>();

  if (!snapshots || snapshots.length < 3) {
    return {
      benchmark: "industry_comp_trends",
      status: "insufficient_data",
      payload: null,
      reason: "need ≥3 snapshots spanning ≥3 months",
    };
  }

  // run_timestamp is unix seconds.
  const monthsSpan =
    (snapshots[snapshots.length - 1].run_timestamp - snapshots[0].run_timestamp) /
    (60 * 60 * 24 * 30);
  if (monthsSpan < 3) {
    return {
      benchmark: "industry_comp_trends",
      status: "insufficient_data",
      payload: null,
      reason: "need ≥3 snapshots spanning ≥3 months",
    };
  }

  const { results: trends } = await db
    .prepare(
      `SELECT s.run_timestamp AS run_timestamp, AVG(m.median) AS avg_median
         FROM market_salary_stats m
         JOIN market_salary_snapshots s ON m.snapshot_id = s.id
        WHERE s.status = 'success'
        GROUP BY s.id
        ORDER BY s.run_timestamp ASC`,
    )
    .all<{ run_timestamp: number; avg_median: number }>();

  return {
    benchmark: "industry_comp_trends",
    status: "success",
    payload: {
      kind: "series",
      series: trends.map((t) => ({
        date: new Date(t.run_timestamp * 1000).toISOString().slice(0, 10),
        value: Math.round(t.avg_median),
      })),
    },
  };
}
