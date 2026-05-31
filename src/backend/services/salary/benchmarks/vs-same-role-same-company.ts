import type { BenchmarkInput, Finding } from "../types";
import {
  type PercentileRow,
  confidenceFromSample,
  insufficient,
  norm,
  offerMidpoint,
  positionAgainstBand,
  resolveRoleFamily,
} from "./_helpers";

const BENCHMARK = "vs_same_role_same_company";

/**
 * Positions the offer against market salary data for the SAME company and role.
 * Prefers an exact (company, title) match in market_company_salaries; falls back
 * to the company's rows in the same role family (via role_family_taxonomy).
 */
export async function runSameRoleSameCompanyCheck(
  db: D1Database,
  input: BenchmarkInput,
): Promise<Finding> {
  const midpoint = offerMidpoint(input);
  if (!input.companyName || !input.jobTitle || midpoint == null) {
    return insufficient(BENCHMARK, "Missing company, title, or offer salary.");
  }

  const company = norm(input.companyName);
  const title = norm(input.jobTitle);

  // 1. Exact (company, title) match.
  let row = await db
    .prepare(
      `SELECT p25, median, p75, sample_size
         FROM market_company_salaries
        WHERE company_name = ? AND job_title = ?
        ORDER BY sample_size DESC
        LIMIT 1`,
    )
    .bind(company, title)
    .first<PercentileRow>();

  let matchKind = "exact_title";

  // 2. Fallback: same company, same role family.
  if (!row) {
    const fam = await resolveRoleFamily(db, input.jobTitle);
    if (fam) {
      row = await db
        .prepare(
          `SELECT
              CAST(AVG(c.p25) AS INTEGER)    AS p25,
              CAST(AVG(c.median) AS INTEGER) AS median,
              CAST(AVG(c.p75) AS INTEGER)    AS p75,
              SUM(c.sample_size)             AS sample_size
            FROM market_company_salaries c
            JOIN role_family_taxonomy t ON t.raw_title = c.job_title
           WHERE c.company_name = ? AND t.family = ?`,
        )
        .bind(company, fam.family)
        .first<PercentileRow>();
      matchKind = "family_avg";
      if (row && !row.median) row = null;
    }
  }

  if (!row || !row.median) {
    return insufficient(BENCHMARK, `No market salary rows for ${input.companyName}.`);
  }

  const { status, magnitude } = positionAgainstBand(midpoint, row);
  return {
    benchmark: BENCHMARK,
    status,
    confidence: confidenceFromSample(row.sample_size),
    magnitude,
    supportingData: {
      offerMidpoint: midpoint,
      company,
      matchKind,
      market: { p25: row.p25, median: row.median, p75: row.p75 },
      sampleSize: row.sample_size,
    },
  };
}
