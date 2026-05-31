import type { BenchmarkInput, Finding } from "../types";
import { insufficient, round3 } from "./_helpers";

const BENCHMARK = "recency_check";

/**
 * How fresh is the market data backing this analysis? Reads the latest successful
 * snapshot's run_timestamp and ages it against now. Fresh data → high confidence;
 * stale data → degrade confidence and warn. Status is "at" (freshness signal).
 */
export async function runRecencyCheck(
  db: D1Database,
  input: BenchmarkInput,
): Promise<Finding> {
  const snapshotId = input.latestSnapshotId;
  const row = snapshotId
    ? await db
        .prepare("SELECT run_timestamp FROM market_salary_snapshots WHERE id = ? AND status = 'success'")
        .bind(snapshotId)
        .first<{ run_timestamp: number }>()
    : await db
        .prepare(
          "SELECT run_timestamp FROM market_salary_snapshots WHERE status = 'success' ORDER BY run_timestamp DESC LIMIT 1",
        )
        .first<{ run_timestamp: number }>();

  if (!row?.run_timestamp) {
    return insufficient(BENCHMARK, "No successful market snapshot found.");
  }

  // run_timestamp is unix seconds.
  const ageDays = round3((Date.now() / 1000 - row.run_timestamp) / (60 * 60 * 24));
  let confidence: Finding["confidence"] = "high";
  if (ageDays > 180) confidence = "low";
  else if (ageDays > 90) confidence = "medium";

  return {
    benchmark: BENCHMARK,
    status: "at",
    confidence,
    magnitude: ageDays,
    supportingData: {
      snapshotId: snapshotId || null,
      runTimestamp: row.run_timestamp,
      ageDays,
    },
    caveats: [
      ageDays > 180
        ? `Market data is ${Math.round(ageDays)} days old — findings may be stale.`
        : `Market data is ${Math.round(ageDays)} days old.`,
    ],
  };
}
