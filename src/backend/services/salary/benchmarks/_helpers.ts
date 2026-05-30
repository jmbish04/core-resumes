/**
 * @file Shared helpers for the single-role benchmark battery.
 *
 * Market data lives in three snake_case D1 tables (see
 * `src/backend/db/schemas/applications/salary-stats.ts`):
 *   - market_company_salaries: company_name, job_title, seniority, p25, median, p75
 *   - market_salary_stats:     role_type, metric_key, p25, median, p75
 *   - market_salary_snapshots: run_timestamp (unix seconds), status
 * Benchmarks receive the raw D1 binding and query with prepared statements.
 */

import type { BenchmarkInput, Finding, FindingConfidence, FindingStatus } from "../types";

/** Percentile triple returned by the market tables. */
export interface PercentileRow {
  p25: number;
  median: number;
  p75: number;
  sample_size: number;
}

/** Seniority buckets used by market_company_salaries. */
export type Seniority = "entry" | "mid" | "senior";

/** Offer midpoint, or a single bound if only one is present, else null. */
export function offerMidpoint(input: BenchmarkInput): number | null {
  const { salaryMin, salaryMax } = input;
  if (salaryMin != null && salaryMax != null) return (salaryMin + salaryMax) / 2;
  if (salaryMin != null) return salaryMin;
  if (salaryMax != null) return salaryMax;
  return null;
}

/** Lowercased, trimmed title/company for matching against seeded market rows. */
export function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

/**
 * Status of an offer value against a market percentile band.
 * Below p25 → "below", above p75 → "above", inside the band → "at".
 * Magnitude is the fractional gap to the median (e.g. -0.08 = 8% under median).
 */
export function positionAgainstBand(
  value: number,
  row: PercentileRow,
): { status: FindingStatus; magnitude: number } {
  const magnitude = row.median > 0 ? (value - row.median) / row.median : 0;
  let status: FindingStatus = "at";
  if (value < row.p25) status = "below";
  else if (value > row.p75) status = "above";
  return { status, magnitude: round3(magnitude) };
}

/** Confidence derived from market sample size. */
export function confidenceFromSample(sampleSize: number): FindingConfidence {
  if (sampleSize >= 30) return "high";
  if (sampleSize >= 10) return "medium";
  return "low";
}

/** Round to 3 decimal places. */
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Standard insufficient_data finding. */
export function insufficient(benchmark: string, reason: string): Finding {
  return {
    benchmark,
    status: "insufficient_data",
    confidence: "low",
    magnitude: null,
    supportingData: {},
    reason,
  };
}

/** Maps a taxonomy level to the entry/mid/senior bucket used by company salaries. */
export function levelToSeniority(level: string | null | undefined): Seniority {
  switch (norm(level)) {
    case "junior":
    case "entry":
      return "entry";
    case "mid":
      return "mid";
    default:
      // senior, staff, principal, lead, distinguished → senior bucket
      return "senior";
  }
}

/** Adjacent seniority buckets for a given level (one step up and/or down). */
export function adjacentSeniorities(s: Seniority): Seniority[] {
  switch (s) {
    case "entry":
      return ["mid"];
    case "mid":
      return ["entry", "senior"];
    case "senior":
      return ["mid"];
  }
}

/**
 * Resolves a role's normalized family + level via the role_family_taxonomy table
 * (raw_title is the lowercased PK). Returns null when the title is unseeded.
 */
export async function resolveRoleFamily(
  db: D1Database,
  jobTitle: string | null,
): Promise<{ family: string; level: string } | null> {
  const title = norm(jobTitle);
  if (!title) return null;
  const row = await db
    .prepare("SELECT family, level FROM role_family_taxonomy WHERE raw_title = ? LIMIT 1")
    .bind(title)
    .first<{ family: string; level: string }>();
  return row ?? null;
}
