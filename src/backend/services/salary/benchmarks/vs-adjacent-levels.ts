import type { BenchmarkInput, Finding, LadderRow } from "../types";
import {
  type Seniority,
  adjacentSeniorities,
  confidenceFromSample,
  insufficient,
  levelToSeniority,
  offerMidpoint,
  resolveRoleFamily,
  round3,
} from "./_helpers";

const BENCHMARK = "vs_adjacent_levels";

/**
 * Builds a seniority ladder (entry/mid/senior medians) for the role's family and
 * positions the offer against the level above and below. Answers "is this offer
 * paying me at the next level up, or pricing me a level down?"
 */
export async function runAdjacentLevelsCheck(
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
  const currentSeniority = levelToSeniority(fam.level);

  const { results } = await db
    .prepare(
      `SELECT
          c.seniority                    AS level,
          CAST(AVG(c.p25) AS INTEGER)    AS p25,
          CAST(AVG(c.median) AS INTEGER) AS median,
          CAST(AVG(c.p75) AS INTEGER)    AS p75,
          SUM(c.sample_size)             AS sample_size
        FROM market_company_salaries c
        JOIN role_family_taxonomy t ON t.raw_title = c.job_title
       WHERE t.family = ?
       GROUP BY c.seniority`,
    )
    .bind(fam.family)
    .all<{ level: Seniority; p25: number; median: number; p75: number; sample_size: number }>();

  const byLevel = new Map(results.map((r) => [r.level, r]));
  const ladder: LadderRow[] = (["entry", "mid", "senior"] as Seniority[])
    .filter((lvl) => byLevel.has(lvl))
    .map((lvl) => {
      const r = byLevel.get(lvl)!;
      return { level: lvl, median: r.median, p25: r.p25, p75: r.p75 };
    });

  const adjacent = adjacentSeniorities(currentSeniority).filter((lvl) => byLevel.has(lvl));
  if (adjacent.length === 0) {
    return insufficient(BENCHMARK, `No adjacent-level market data for family '${fam.family}'.`);
  }

  // Compare the offer to the median of the level ABOVE the current one when present,
  // else the level below. "above" means the offer reaches the higher level's pay.
  const higher = nextUp(currentSeniority);
  const target = higher && byLevel.has(higher) ? byLevel.get(higher)! : byLevel.get(adjacent[0])!;
  const targetLevel = higher && byLevel.has(higher) ? higher : adjacent[0];

  const magnitude = target.median > 0 ? round3((midpoint - target.median) / target.median) : 0;
  let status: Finding["status"] = "at";
  if (midpoint >= target.median) status = "above";
  else if (midpoint < target.p25) status = "below";

  const totalSample = results.reduce((acc, r) => acc + (r.sample_size ?? 0), 0);
  return {
    benchmark: BENCHMARK,
    status,
    confidence: confidenceFromSample(totalSample),
    magnitude,
    supportingData: {
      offerMidpoint: midpoint,
      family: fam.family,
      currentLevel: currentSeniority,
      comparedAgainstLevel: targetLevel,
      ladder,
    },
    caveats: [
      `Offer compared against the '${targetLevel}' band for ${fam.family}.`,
    ],
  };
}

function nextUp(s: Seniority): Seniority | null {
  if (s === "entry") return "mid";
  if (s === "mid") return "senior";
  return null;
}
