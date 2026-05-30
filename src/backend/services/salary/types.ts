/**
 * @file Types for Salary Agent deterministic benchmark battery and leverage scorer.
 */


// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface BenchmarkInput {
  roleId: string;
  companyName: string | null;
  jobTitle: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  geoId: number | null;
  metro: string | null;
  latestSnapshotId: number;
}

export interface CrossMarketInput {
  baseMetro: string;
  targetMetros: string[];
}

export interface TrackInput {
  roleId: string;
  historyMonths: number;
}

export interface PivotTrajectoryInput {
  currentRoleTitle: string;
  currentSalary: number;
  targetRoleTitle: string;
  projectionYears: number;
}

// ---------------------------------------------------------------------------
// Outputs: Single-Role Battery
// ---------------------------------------------------------------------------

export type FindingStatus = "below" | "at" | "above" | "insufficient_data";
export type FindingConfidence = "high" | "medium" | "low";

export interface Finding {
  benchmark: string;
  status: FindingStatus;
  confidence: FindingConfidence;
  magnitude: number | null; // e.g., 0.15 for 15% above, -0.05 for 5% below
  supportingData: Record<string, unknown>;
  caveats?: string[];
  reason?: string;
}

// ---------------------------------------------------------------------------
// Outputs: Aggregate Insights
// ---------------------------------------------------------------------------

export type AggregateInsightPayload =
  | { kind: "series"; series: Record<string, any>[] }
  | { kind: "ranking"; ranking: Record<string, any>[] }
  | { kind: "projection"; curves: { name: string; data: Record<string, any>[] }[] }
  | { kind: "distribution"; buckets: Record<string, any>[] };

export interface AggregateInsight {
  benchmark: string;
  status: "success" | "insufficient_data";
  payload: AggregateInsightPayload | null;
  caveats?: string[];
  reason?: string; // used when status is insufficient_data
}

// ---------------------------------------------------------------------------
// Outputs: Leverage Scorer
// ---------------------------------------------------------------------------

export type LeverageScoreCategory = "strong" | "moderate" | "weak" | "insufficient_data";

export interface LeverageScore {
  score: LeverageScoreCategory;
  primaryLevers: string[];
  vulnerabilities: string[];
  caveats: string[];
}

// ---------------------------------------------------------------------------
// Sub-types
// ---------------------------------------------------------------------------

export interface YearPoint {
  year: number;
  projectedSalary: number;
  cumulativeEarnings: number;
}

export interface Track {
  name: string;
  points: YearPoint[];
}

export interface MetroRow {
  geoId: number;
  metro: string;
  colIndex: number;
  medianSalary: number;
  adjustedSalary: number;
}

export interface LadderRow {
  level: string;
  median: number;
  p25: number;
  p75: number;
}
