import type { BenchmarkInput, Finding } from "../types";
import { insufficient, norm, round3 } from "./_helpers";

const BENCHMARK = "vs_company_trend";

/**
 * Detects the company's market-salary trend across snapshots. Compares the
 * company's median salary in its earliest vs latest snapshot (must span ≥3
 * snapshots and ≥~3 months). Status reflects trajectory: rising → "above".
 */
export async function runCompanyTrendCheck(
  db: D1Database,
  input: BenchmarkInput,
): Promise<Finding> {
  if (!input.companyName) {
    return insufficient(BENCHMARK, "No company name provided.");
  }
  const company = norm(input.companyName);

  // Distinct snapshots that contain rows for this company, oldest → newest.
  const { results: snapshots } = await db
    .prepare(
      `SELECT s.id AS id, s.run_timestamp AS run_timestamp
         FROM market_company_salaries c
         JOIN market_salary_snapshots s ON s.id = c.snapshot_id
        WHERE c.company_name = ? AND s.status = 'success'
        GROUP BY s.id, s.run_timestamp
        ORDER BY s.run_timestamp ASC`,
    )
    .bind(company)
    .all<{ id: number; run_timestamp: number }>();

  if (!snapshots || snapshots.length < 3) {
    return insufficient(BENCHMARK, "Need ≥3 snapshots for this company.");
  }

  // run_timestamp is stored as unix seconds (Drizzle timestamp mode).
  const oldest = snapshots[0];
  const newest = snapshots[snapshots.length - 1];
  const monthsSpan = (newest.run_timestamp - oldest.run_timestamp) / (60 * 60 * 24 * 30);
  if (monthsSpan < 3) {
    return insufficient(BENCHMARK, "Snapshots span <3 months.");
  }

  const medianFor = async (snapshotId: number) =>
    db
      .prepare(
        `SELECT CAST(AVG(median) AS INTEGER) AS median, SUM(sample_size) AS sample_size
           FROM market_company_salaries
          WHERE company_name = ? AND snapshot_id = ?`,
      )
      .bind(company, snapshotId)
      .first<{ median: number; sample_size: number }>();

  const earliest = await medianFor(oldest.id);
  const latest = await medianFor(newest.id);
  if (!earliest?.median || !latest?.median) {
    return insufficient(BENCHMARK, "Median missing in boundary snapshots.");
  }

  const magnitude = round3((latest.median - earliest.median) / earliest.median);
  let status: Finding["status"] = "at";
  if (magnitude > 0.05) status = "above";
  else if (magnitude < -0.05) status = "below";

  return {
    benchmark: BENCHMARK,
    status,
    confidence: snapshots.length >= 5 ? "high" : "medium",
    magnitude,
    supportingData: {
      company,
      snapshotCount: snapshots.length,
      monthsSpan: round3(monthsSpan),
      earliestMedian: earliest.median,
      latestMedian: latest.median,
    },
  };
}
