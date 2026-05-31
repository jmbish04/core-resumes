import type { BenchmarkInput, Finding } from "../types";
import {
  type PercentileRow,
  confidenceFromSample,
  insufficient,
  resolveRoleFamily,
  round3,
} from "./_helpers";

const BENCHMARK = "vs_offer_range_position";

/**
 * Where does the market median fall within the offer's own [min, max] range?
 *  - market median above the offer max  → offer is "below" market
 *  - market median below the offer min  → offer is "above" market
 *  - market median inside the range     → "at"
 * Reference median is the national band for the role family.
 */
export async function runOfferRangePositionCheck(
  db: D1Database,
  input: BenchmarkInput,
): Promise<Finding> {
  const { salaryMin, salaryMax } = input;
  if (salaryMin == null || salaryMax == null || salaryMax <= 0) {
    return insufficient(BENCHMARK, "Offer needs both a min and max to position a range.");
  }

  const fam = await resolveRoleFamily(db, input.jobTitle);
  if (!fam) {
    return insufficient(BENCHMARK, "Role family not found in taxonomy.");
  }

  const market = await db
    .prepare(
      `SELECT p25, median, p75, sample_size
         FROM market_salary_stats
        WHERE snapshot_id = (
                SELECT MAX(s.id) FROM market_salary_snapshots s WHERE s.status = 'success'
              )
          AND LOWER(role_type) = LOWER(?)
        ORDER BY CASE metric_key WHEN 'national' THEN 0 ELSE 1 END
        LIMIT 1`,
    )
    .bind(fam.family)
    .first<PercentileRow>();

  if (!market || !market.median) {
    return insufficient(BENCHMARK, `No national band for role_type '${fam.family}'.`);
  }

  const midpoint = (salaryMin + salaryMax) / 2;
  let status: Finding["status"] = "at";
  if (market.median > salaryMax) status = "below";
  else if (market.median < salaryMin) status = "above";

  // Fractional position of the market median within the offer range (0 = min, 1 = max).
  const span = salaryMax - salaryMin;
  const rangePosition = span > 0 ? round3((market.median - salaryMin) / span) : null;
  const magnitude = round3((midpoint - market.median) / market.median);

  return {
    benchmark: BENCHMARK,
    status,
    confidence: confidenceFromSample(market.sample_size),
    magnitude,
    supportingData: {
      offerMin: salaryMin,
      offerMax: salaryMax,
      offerMidpoint: midpoint,
      family: fam.family,
      marketMedian: market.median,
      rangePosition,
    },
  };
}
