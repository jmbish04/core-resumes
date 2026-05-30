import type { AggregateInsight } from "../../types";

/**
 * Role-demand heat: how many company salary rows exist per role family in the
 * latest snapshot — a proxy for how broadly each family is hiring/benchmarked.
 * Family comes from role_family_taxonomy (joined on raw_title = job_title); the
 * market table has no role_id.
 */
export async function runRoleDemandHeat(db: D1Database): Promise<AggregateInsight> {
  const snapshot = await db
    .prepare(
      "SELECT id FROM market_salary_snapshots WHERE status = 'success' ORDER BY run_timestamp DESC LIMIT 1",
    )
    .first<{ id: number }>();

  if (!snapshot) {
    return {
      benchmark: "role_demand_heat",
      status: "insufficient_data",
      payload: null,
      reason: "No snapshots available",
    };
  }

  const { results: demand } = await db
    .prepare(
      `SELECT t.family AS category, COUNT(*) AS mentions, SUM(c.sample_size) AS sample_size
         FROM market_company_salaries c
         JOIN role_family_taxonomy t ON t.raw_title = c.job_title
        WHERE c.snapshot_id = ?
        GROUP BY t.family
        ORDER BY mentions DESC
        LIMIT 10`,
    )
    .bind(snapshot.id)
    .all<{ category: string; mentions: number; sample_size: number }>();

  if (!demand || demand.length === 0) {
    return {
      benchmark: "role_demand_heat",
      status: "insufficient_data",
      payload: null,
      reason: "No taxonomy-mapped company salary rows in the latest snapshot.",
    };
  }

  return {
    benchmark: "role_demand_heat",
    status: "success",
    payload: {
      kind: "ranking",
      ranking: demand.map((d) => ({
        label: d.category || "Unknown",
        score: d.mentions,
        sampleSize: d.sample_size,
      })),
    },
  };
}
