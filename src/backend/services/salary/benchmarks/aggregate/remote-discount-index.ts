import type { AggregateInsight } from "../../types";

/**
 * Remote vs in-market pay gap. Geography lives in market_salary_stats.metric_key,
 * so we compare the 'remote' band against the 'top_hubs' / 'local_market' bands
 * for the latest snapshot. A positive discount means remote pays less than hubs.
 */
export async function runRemoteDiscountIndex(db: D1Database): Promise<AggregateInsight> {
  const snapshot = await db
    .prepare(
      "SELECT id FROM market_salary_snapshots WHERE status = 'success' ORDER BY run_timestamp DESC LIMIT 1",
    )
    .first<{ id: number }>();

  if (!snapshot) {
    return {
      benchmark: "remote_discount_index",
      status: "insufficient_data",
      payload: null,
      reason: "No snapshots available",
    };
  }

  const medianForKeys = async (keys: string[]) => {
    const placeholders = keys.map(() => "?").join(", ");
    const row = await db
      .prepare(
        `SELECT AVG(median) AS median, SUM(sample_size) AS sample_size
           FROM market_salary_stats
          WHERE snapshot_id = ? AND metric_key IN (${placeholders})`,
      )
      .bind(snapshot.id, ...keys)
      .first<{ median: number; sample_size: number }>();
    return row;
  };

  const remote = await medianForKeys(["remote"]);
  const inMarket = await medianForKeys(["top_hubs", "local_market"]);

  if (!remote?.median || !inMarket?.median) {
    return {
      benchmark: "remote_discount_index",
      status: "insufficient_data",
      payload: null,
      reason: "Snapshot lacks both remote and in-market bands.",
    };
  }

  const discount = Math.round((1 - remote.median / inMarket.median) * 100);

  return {
    benchmark: "remote_discount_index",
    status: "success",
    payload: {
      kind: "distribution",
      buckets: [
        { label: "Remote", median: Math.round(remote.median) },
        { label: "In-Hub/Local", median: Math.round(inMarket.median) },
      ],
    },
    caveats: [
      discount >= 0
        ? `Remote roles show a ${discount}% discount relative to in-hub/local bands.`
        : `Remote roles show a ${Math.abs(discount)}% premium relative to in-hub/local bands.`,
    ],
  };
}
