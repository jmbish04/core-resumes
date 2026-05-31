import type { Finding, FindingConfidence, LeverageScore, LeverageScoreCategory } from "./types";

// Confidence weighting: a high-confidence finding carries full weight; a
// low-confidence one barely moves the score (and is surfaced only as a caveat,
// never as a primary lever or vulnerability). This implements the spec rule
// "strong if below peers *with high confidence*".
const CONFIDENCE_WEIGHT: Record<FindingConfidence, number> = {
  high: 1,
  medium: 0.5,
  low: 0.15,
};

const pct = (m: number | null): string =>
  m != null ? `${Math.abs(m * 100).toFixed(0)}%` : "an unknown margin";

export function scoreLeverage(findings: Finding[]): LeverageScore {
  const validFindings = findings.filter((f) => f.status !== "insufficient_data");

  if (validFindings.length === 0) {
    return {
      score: "insufficient_data",
      primaryLevers: [],
      vulnerabilities: [],
      caveats: ["No valid market data available to score leverage."],
    };
  }

  const primaryLevers: string[] = [];
  const vulnerabilities: string[] = [];
  const caveats: string[] = [];

  // Weighted accumulators — confidence scales each finding's contribution.
  let strongWeight = 0;
  let weakWeight = 0;

  for (const f of validFindings) {
    const weight = CONFIDENCE_WEIGHT[f.confidence];

    if (f.status === "below") {
      strongWeight += weight;
      // Only high/medium-confidence findings earn a stated lever.
      if (f.confidence !== "low") {
        primaryLevers.push(
          `Offer sits below market for ${f.benchmark} by ${pct(f.magnitude)} (${f.confidence} confidence).`,
        );
      } else {
        caveats.push(`Possible upside on ${f.benchmark}, but data confidence is low.`);
      }
    } else if (f.status === "above") {
      weakWeight += weight;
      if (f.confidence !== "low") {
        vulnerabilities.push(
          `Offer already exceeds market for ${f.benchmark} by ${pct(f.magnitude)} (${f.confidence} confidence).`,
        );
      } else {
        caveats.push(`Offer may exceed market on ${f.benchmark}, but data confidence is low.`);
      }
    } else {
      // "at" — inline with market.
      if (f.confidence !== "low") {
        caveats.push(`Offer is inline with ${f.benchmark}.`);
      }
    }
  }

  // Categorize on the weighted net, requiring meaningful (≈ high-confidence)
  // signal rather than a pile of low-confidence noise.
  const net = strongWeight - weakWeight;
  let score: LeverageScoreCategory;
  if (strongWeight >= 1 && net >= 1) {
    score = "strong";
  } else if (weakWeight >= 1 && net <= -1) {
    score = "weak";
  } else {
    score = "moderate";
  }

  return {
    score,
    primaryLevers,
    vulnerabilities,
    caveats,
  };
}
