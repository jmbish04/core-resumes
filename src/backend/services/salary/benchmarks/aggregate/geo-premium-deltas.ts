import type { AggregateInsight } from "../../types";

/**
 * Geographic pay premiums. The market models geography via market_salary_stats
 * (metric_key = local_market | top_hubs, metric_label = the metro/region name),
 * NOT a metro column on company salaries. We rank metro bands by median and
 * attach a cost-of-living index where the label matches cost_of_living_index.metro.
 */
export async function runGeoPremiumDeltas(db: D1Database): Promise<AggregateInsight> {
  const snapshot = await db
    .prepare(
      "SELECT id FROM market_salary_snapshots WHERE status = 'success' ORDER BY run_timestamp DESC LIMIT 1",
    )
    .first<{ id: number }>();

  if (!snapshot) {
    return {
      benchmark: "geo_premium_deltas",
      status: "insufficient_data",
      payload: null,
      reason: "No snapshots available",
    };
  }

  // National baseline to express each metro as a premium/discount.
  const national = await db
    .prepare(
      `SELECT AVG(median) AS median FROM market_salary_stats
        WHERE snapshot_id = ? AND metric_key = 'national'`,
    )
    .bind(snapshot.id)
    .first<{ median: number }>();
  const baseline = national?.median && national.median > 0 ? national.median : null;

  const { results: geoStats } = await db
    .prepare(
      `SELECT m.metric_label AS metro,
              AVG(m.median)   AS median,
              col.col_index   AS col_index
         FROM market_salary_stats m
         LEFT JOIN cost_of_living_index col ON col.metro = m.metric_label
        WHERE m.snapshot_id = ? AND m.metric_key IN ('local_market', 'top_hubs')
        GROUP BY m.metric_label, col.col_index
        ORDER BY median DESC
        LIMIT 10`,
    )
    .bind(snapshot.id)
    .all<{ metro: string; median: number; col_index: number | null }>();

  if (!geoStats || geoStats.length < 2) {
    return {
      benchmark: "geo_premium_deltas",
      status: "insufficient_data",
      payload: null,
      reason: "Not enough metro-level stats to compute premium deltas.",
    };
  }

  return {
    benchmark: "geo_premium_deltas",
    status: "success",
    payload: {
      kind: "ranking",
      ranking: geoStats.map((g) => ({
        label: g.metro,
        score: Math.round(g.median),
        colIndex: g.col_index ?? null,
        premiumVsNational:
          baseline != null ? Math.round((g.median / baseline - 1) * 1000) / 1000 : null,
      })),
    },
    caveats: [
      "Top-tier metros command a nominal premium that frequently lags true cost-of-living parity.",
    ],
  };
}
