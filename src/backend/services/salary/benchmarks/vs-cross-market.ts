/**
 * @fileoverview Cross-market salary comparison benchmark.
 *
 * The market data models geography through `market_salary_stats.metric_key`
 * (remote | local_market | top_hubs | national) per `role_type` — NOT a metro
 * column on company salaries. This benchmark positions the offer against the
 * national band for the role family and reports the remote-vs-hub spread so the
 * narrative can reason about relocation / remote trade-offs.
 */

import type { BenchmarkInput, Finding } from "../types";
import {
  type PercentileRow,
  confidenceFromSample,
  insufficient,
  offerMidpoint,
  positionAgainstBand,
  resolveRoleFamily,
} from "./_helpers";

const BENCHMARK = "vs_cross_market";

type MetricRow = PercentileRow & { metric_key: string; metric_label: string };

export async function runCrossMarketCheck(
  db: D1Database,
  input: BenchmarkInput,
): Promise<Finding> {
  const midpoint = offerMidpoint(input);
  if (midpoint == null || midpoint <= 0) {
    return insufficient(BENCHMARK, "No usable offer salary.");
  }

  const fam = await resolveRoleFamily(db, input.jobTitle);
  if (!fam) {
    return insufficient(BENCHMARK, "Role family not found in taxonomy.");
  }

  // Latest successful snapshot that has stats for this role_type.
  const { results: rows } = await db
    .prepare(
      `SELECT metric_key, metric_label, p25, median, p75, sample_size
         FROM market_salary_stats
        WHERE snapshot_id = (
                SELECT MAX(s.id) FROM market_salary_snapshots s WHERE s.status = 'success'
              )
          AND LOWER(role_type) = LOWER(?)`,
    )
    .bind(fam.family)
    .all<MetricRow>();

  if (!rows || rows.length === 0) {
    return insufficient(BENCHMARK, `No market_salary_stats for role_type '${fam.family}'.`);
  }

  const byKey = new Map(rows.map((r) => [r.metric_key, r]));
  // Reference band: prefer national, then local_market, then any.
  const reference = byKey.get("national") ?? byKey.get("local_market") ?? rows[0];

  const { status, magnitude } = positionAgainstBand(midpoint, reference);

  const remote = byKey.get("remote");
  const hubs = byKey.get("top_hubs");
  const remoteVsHubDelta =
    remote && hubs && hubs.median > 0
      ? Math.round(((remote.median - hubs.median) / hubs.median) * 1000) / 1000
      : null;

  return {
    benchmark: BENCHMARK,
    status,
    confidence: confidenceFromSample(reference.sample_size),
    magnitude,
    supportingData: {
      offerMidpoint: midpoint,
      family: fam.family,
      referenceMetric: reference.metric_key,
      bands: rows.map((r) => ({
        metric: r.metric_key,
        label: r.metric_label,
        p25: r.p25,
        median: r.median,
        p75: r.p75,
      })),
      remoteVsHubDelta,
    },
    caveats: [
      `Offer positioned against the '${reference.metric_key}' band for ${fam.family}.`,
    ],
  };
}
