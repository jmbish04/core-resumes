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

const BENCHMARK = "vs_peer_companies";

/**
 * Positions the offer against peer companies in the SAME segment (company_segments)
 * for the SAME role family (role_family_taxonomy), excluding the role's own company.
 */
export async function runPeerCompaniesCheck(
  db: D1Database,
  input: BenchmarkInput,
): Promise<Finding> {
  const midpoint = offerMidpoint(input);
  if (!input.companyName || !input.jobTitle || midpoint == null) {
    return insufficient(BENCHMARK, "Missing company, title, or offer salary.");
  }

  const company = norm(input.companyName);

  const seg = await db
    .prepare("SELECT segment FROM company_segments WHERE company_name = ? LIMIT 1")
    .bind(company)
    .first<{ segment: string }>();
  if (!seg || seg.segment === "unknown") {
    return insufficient(BENCHMARK, "Company segment unknown — cannot identify peers.");
  }

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
          COUNT(DISTINCT c.company_name) AS peer_count
        FROM market_company_salaries c
        JOIN company_segments s     ON s.company_name = c.company_name
        JOIN role_family_taxonomy t ON t.raw_title  = c.job_title
       WHERE s.segment = ? AND t.family = ? AND c.company_name != ?`,
    )
    .bind(seg.segment, fam.family, company)
    .first<PercentileRow & { peer_count: number }>();

  if (!row || !row.median || (row.peer_count ?? 0) < 1) {
    return insufficient(
      BENCHMARK,
      `No peer salary rows for segment '${seg.segment}', family '${fam.family}'.`,
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
      segment: seg.segment,
      family: fam.family,
      peerCompanies: row.peer_count,
      market: { p25: row.p25, median: row.median, p75: row.p75 },
      sampleSize: row.sample_size,
    },
  };
}
