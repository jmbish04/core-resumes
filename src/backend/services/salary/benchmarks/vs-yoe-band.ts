import type { BenchmarkInput, Finding } from "../types";
import {
  type PercentileRow,
  confidenceFromSample,
  insufficient,
  levelToSeniority,
  offerMidpoint,
  positionAgainstBand,
  resolveRoleFamily,
} from "./_helpers";

const BENCHMARK = "vs_yoe_band";

/**
 * Positions the offer against the MARKET-WIDE band for the role's seniority/YOE
 * level — i.e. what every company pays someone at this level in this family.
 * Distinct from vs_adjacent_levels (cross-level ladder) and vs_peer_companies
 * (segment-scoped).
 */
export async function runYoeBandCheck(
  db: D1Database,
  input: BenchmarkInput,
): Promise<Finding> {
  const midpoint = offerMidpoint(input);
  if (!input.jobTitle || midpoint == null) {
    return insufficient(BENCHMARK, "Missing title or offer salary.");
  }

  const fam = await resolveRoleFamily(db, input.jobTitle);
  if (!fam) {
    return insufficient(BENCHMARK, "Role family not found in taxonomy.");
  }
  const seniority = levelToSeniority(fam.level);

  const row = await db
    .prepare(
      `SELECT
          CAST(AVG(c.p25) AS INTEGER)    AS p25,
          CAST(AVG(c.median) AS INTEGER) AS median,
          CAST(AVG(c.p75) AS INTEGER)    AS p75,
          SUM(c.sample_size)             AS sample_size
        FROM market_company_salaries c
        JOIN role_family_taxonomy t ON t.raw_title = c.job_title
       WHERE t.family = ? AND c.seniority = ?`,
    )
    .bind(fam.family, seniority)
    .first<PercentileRow>();

  if (!row || !row.median) {
    return insufficient(
      BENCHMARK,
      `No market data for ${fam.family} at '${seniority}' level.`,
    );
  }

  const { status, magnitude } = positionAgainstBand(midpoint, row);
  return {
    benchmark: BENCHMARK,
    status,
    confidence: confidenceFromSample(row.sample_size),
    magnitude,
    supportingData: {
      offerMidpoint: midpoint,
      family: fam.family,
      seniority,
      market: { p25: row.p25, median: row.median, p75: row.p75 },
      sampleSize: row.sample_size,
    },
  };
}
