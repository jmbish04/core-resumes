import { getDb } from "../../../db";
import { sql } from "drizzle-orm";
import { querySalaryData } from "../../../services/salary/sql-tool";
import { runBenchmarkBattery } from "../../../services/salary/benchmark-battery";
import type { SalaryAgent } from "./index";

/**
 * Health check runner for SalaryAgent.
 *
 * Verifies that:
 * 1. D1 Database connection is active.
 * 2. The SQL tool (querySalaryData) parses + executes a guarded SELECT.
 * 3. The benchmark battery runs end-to-end without throwing (smoke test).
 */
export async function checkHealth(_agent: SalaryAgent, env: Env) {
  const start = Date.now();
  try {
    const db = getDb(env);

    // 1. Basic D1 ping.
    await db.run(sql`SELECT 1`);

    // 2. SQL tool probe — exercises the parser/allowlist guard + execution path.
    const probe = await querySalaryData(env.DB, "SELECT 1 AS ok", {
      roleId: null,
      mode: "health",
      auditDb: env.DB,
    });
    if (!probe.ok) {
      throw new Error(`querySalaryData probe failed (${probe.code}): ${probe.error}`);
    }

    // 3. Battery smoke test — runs every benchmark against a sentinel input.
    //    A missing role yields insufficient_data findings, not throws; any
    //    thrown error here means a benchmark has a real (e.g. schema) defect.
    const findings = await runBenchmarkBattery(env.DB, {
      roleId: "__healthcheck__",
      companyName: null,
      jobTitle: null,
      salaryMin: null,
      salaryMax: null,
      geoId: null,
      metro: null,
      latestSnapshotId: 0,
    });

    return {
      status: "ok" as const,
      latencyMs: Date.now() - start,
      details: {
        d1: "ok",
        sqlTool: "ok",
        battery: `${findings.length} benchmarks executed`,
      },
    };
  } catch (error) {
    return {
      status: "fail" as const,
      latencyMs: Date.now() - start,
      error: `SalaryAgent health check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
