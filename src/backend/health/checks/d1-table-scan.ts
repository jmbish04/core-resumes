import type { HealthStepResult } from "@/backend/health/types";

/**
 * Scan sqlite_master for all tables and perform per-table row counts.
 * Reports a warning for tables expected to have data that are empty.
 */
export async function checkD1TableScan(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  try {
    // Get all tables
    const tablesResult = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name != 'd1_migrations' ORDER BY name`,
    ).all<{ name: string }>();

    const tables = tablesResult.results ?? [];

    // Per-table row counts
    const counts: Record<string, number> = {};
    const emptyExpected: string[] = [];

    // Tables we expect to have data in a healthy system
    const expectedPopulated = new Set(["roles", "global_config"]);

    for (const table of tables) {
      try {
        const countResult = await env.DB.prepare(
          `SELECT COUNT(*) as cnt FROM "${table.name}"`,
        ).first<{ cnt: number }>();
        counts[table.name] = countResult?.cnt ?? 0;
        if (expectedPopulated.has(table.name) && (countResult?.cnt ?? 0) === 0) {
          emptyExpected.push(table.name);
        }
      } catch {
        counts[table.name] = -1; // Error reading
      }
    }

    return {
      status: emptyExpected.length > 0 ? "warn" : "ok",
      latencyMs: Date.now() - start,
      error:
        emptyExpected.length > 0
          ? `Expected-populated tables are empty: ${emptyExpected.join(", ")}`
          : undefined,
      details: { tableCount: tables.length, rowCounts: counts, emptyExpected },
    };
  } catch (e) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
