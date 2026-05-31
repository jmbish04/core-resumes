import type { BenchmarkInput, Finding } from "../types";

export async function runGoogleAnchorCheck(db: D1Database, input: BenchmarkInput): Promise<Finding> {
  const result = await db.prepare("SELECT value FROM career_model_assumptions WHERE key = 'baseline_anchor_salary'").first<{value: number}>();
  const anchor = result?.value;

  if (!anchor || !input.salaryMin) {
    return {
      benchmark: "vs_google_anchor",
      status: "insufficient_data",
      confidence: "low",
      magnitude: null,
      supportingData: {},
      caveats: ["No baseline anchor or offer salary provided."],
    };
  }

  const midpoint = input.salaryMax ? (input.salaryMin + input.salaryMax) / 2 : input.salaryMin;
  const magnitude = (midpoint - anchor) / anchor;
  let status: Finding["status"] = "at";
  if (magnitude > 0.05) status = "above";
  else if (magnitude < -0.05) status = "below";

  return {
    benchmark: "vs_google_anchor",
    status,
    confidence: "high",
    magnitude,
    supportingData: { anchor, midpoint },
  };
}
