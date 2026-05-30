import type { AggregateInsight, PivotTrajectoryInput } from "../../types";

/**
 * Projects two earnings curves — staying on the current path vs pivoting to a
 * target role. Growth rates come from career_model_assumptions (within_level_raise),
 * not hardcoded constants. The target curve is anchored to the target role's
 * national market median when available.
 */
export async function runPivotTrajectory(
  db: D1Database,
  input: PivotTrajectoryInput,
): Promise<AggregateInsight> {
  const { currentRoleTitle, currentSalary, targetRoleTitle, projectionYears } = input;

  if (projectionYears < 1 || projectionYears > 10) {
    return {
      benchmark: "pivot_trajectory",
      status: "insufficient_data",
      payload: null,
      reason: "Projection years must be between 1 and 10",
    };
  }

  // Assumption-driven growth. within_level_raise is the annual merit increase.
  const assumptions = await loadAssumptions(db, ["within_level_raise"]);
  const currentGrowth = assumptions["within_level_raise"] ?? 0.035;
  // A pivot to a higher-leverage track historically compounds faster; model it as
  // current growth plus a modest pivot premium until it reaches the target band.
  const pivotGrowth = currentGrowth + 0.025;

  // Target role market median (national band) via taxonomy family → market_salary_stats.
  const targetMedian = await targetRoleMedian(db, targetRoleTitle);
  const targetSalaryBase = targetMedian && targetMedian > 0 ? targetMedian : currentSalary;

  const currentCurve: { year: number; salary: number }[] = [];
  const targetCurve: { year: number; salary: number }[] = [];

  let currentVal = currentSalary;
  let targetVal = targetSalaryBase * 0.9; // pivots typically start below the target median

  for (let year = 1; year <= projectionYears; year++) {
    currentCurve.push({ year, salary: Math.round(currentVal) });
    targetCurve.push({ year, salary: Math.round(targetVal) });
    currentVal *= 1 + currentGrowth;
    targetVal *= 1 + pivotGrowth;
  }

  return {
    benchmark: "pivot_trajectory",
    status: "success",
    payload: {
      kind: "projection",
      curves: [
        { name: currentRoleTitle || "Current Path", data: currentCurve },
        { name: targetRoleTitle || "Pivot Path", data: targetCurve },
      ],
    },
    caveats: [
      `Growth from career_model_assumptions: current ${(currentGrowth * 100).toFixed(1)}%/yr, pivot ${(pivotGrowth * 100).toFixed(1)}%/yr.`,
      targetMedian
        ? `Target anchored to market median ${Math.round(targetMedian)} for '${targetRoleTitle}'.`
        : `No market median for '${targetRoleTitle}'; anchored to current salary.`,
    ],
  };
}

async function loadAssumptions(
  db: D1Database,
  keys: string[],
): Promise<Record<string, number>> {
  const placeholders = keys.map(() => "?").join(", ");
  const { results } = await db
    .prepare(`SELECT key, value FROM career_model_assumptions WHERE key IN (${placeholders})`)
    .bind(...keys)
    .all<{ key: string; value: number }>();
  const out: Record<string, number> = {};
  for (const r of results ?? []) out[r.key] = r.value;
  return out;
}

async function targetRoleMedian(db: D1Database, targetTitle: string): Promise<number | null> {
  const title = (targetTitle ?? "").toLowerCase().trim();
  if (!title) return null;
  const row = await db
    .prepare(
      `SELECT m.median AS median
         FROM market_salary_stats m
         JOIN role_family_taxonomy t ON LOWER(m.role_type) = LOWER(t.family)
        WHERE t.raw_title = ?
          AND m.snapshot_id = (
                SELECT MAX(s.id) FROM market_salary_snapshots s WHERE s.status = 'success'
              )
        ORDER BY CASE m.metric_key WHEN 'national' THEN 0 ELSE 1 END
        LIMIT 1`,
    )
    .bind(title)
    .first<{ median: number }>();
  return row?.median ?? null;
}
