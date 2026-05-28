import { Finding, LeverageScore, LeverageScoreCategory } from "./types";

export function scoreLeverage(findings: Finding[]): LeverageScore {
  const validFindings = findings.filter(f => f.status !== "insufficient_data");
  
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

  // Rules based on findings
  let score: LeverageScoreCategory = "moderate";
  let strongPoints = 0;
  let weakPoints = 0;

  for (const f of validFindings) {
    if (f.status === "below") {
      strongPoints++;
      primaryLevers.push(`Current offer is below market anchor for ${f.benchmark} by ${f.magnitude ? Math.abs(f.magnitude * 100).toFixed(0) : "unknown"}%`);
    } else if (f.status === "above") {
      weakPoints++;
      vulnerabilities.push(`Current offer is already above market anchor for ${f.benchmark} by ${f.magnitude ? (f.magnitude * 100).toFixed(0) : "unknown"}%`);
    } else {
      caveats.push(`Offer is inline with ${f.benchmark}.`);
    }

    if (f.confidence === "low") {
      caveats.push(`Low confidence data for ${f.benchmark}.`);
    }
  }

  if (strongPoints >= 2 && weakPoints === 0) {
    score = "strong";
  } else if (weakPoints >= 2 && strongPoints === 0) {
    score = "weak";
  } else if (strongPoints > weakPoints) {
    score = "strong";
  } else if (weakPoints > strongPoints) {
    score = "weak";
  }

  return {
    score,
    primaryLevers,
    vulnerabilities,
    caveats,
  };
}
