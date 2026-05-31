import type { BenchmarkInput, Finding } from "../types";
import { insufficient, resolveRoleFamily, round3 } from "./_helpers";

const BENCHMARK = "variance_check";

/**
 * Measures dispersion of market pay for the role family: spread = (p75 - p25)/median.
 * A tight spread means the market is well-defined (high confidence); a wide spread
 * means pay is noisy (low confidence). Status is always "at" — this is a confidence
 * signal, not a position — unless there is no data.
 */
export async function runVarianceCheck(
  db: D1Database,
  input: BenchmarkInput,
): Promise<Finding> {
  const fam = await resolveRoleFamily(db, input.jobTitle);
  if (!fam) {
    return insufficient(BENCHMARK, "Role family not found in taxonomy.");
  }

  const row = await db
    .prepare(
      `SELECT
          CAST(AVG(c.p25) AS INTEGER)    AS p25,
          CAST(AVG(c.median) AS INTEGER) AS median,
          CAST(AVG(c.p75) AS INTEGER)    AS p75,
          SUM(c.sample_size)             AS sample_size,
          COUNT(*)                       AS rows_count
        FROM market_company_salaries c
        JOIN role_family_taxonomy t ON t.raw_title = c.job_title
       WHERE t.family = ?`,
    )
    .bind(fam.family)
    .first<{ p25: number; median: number; p75: number; sample_size: number; rows_count: number }>();

  if (!row || !row.median || (row.rows_count ?? 0) < 2) {
    return insufficient(BENCHMARK, `Not enough market rows to assess variance for '${fam.family}'.`);
  }

  const spread = round3((row.p75 - row.p25) / row.median);
  // Tight band → confident; wide band → noisy.
  let confidence: Finding["confidence"] = "medium";
  if (spread <= 0.25) confidence = "high";
  else if (spread >= 0.6) confidence = "low";

  return {
    benchmark: BENCHMARK,
    status: "at",
    confidence,
    magnitude: spread,
    supportingData: {
      family: fam.family,
      p25: row.p25,
      median: row.median,
      p75: row.p75,
      spreadRatio: spread,
      rows: row.rows_count,
    },
    caveats: [
      spread >= 0.6
        ? "Wide market dispersion — treat point comparisons with caution."
        : "Market band is reasonably tight.",
    ],
  };
}
