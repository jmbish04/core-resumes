import { getAgentByName } from "agents";

import type { HealthStepResult } from "@/backend/health/types";

/**
 * Validates the SQL-based SalaryAgent by invoking its healthProbe RPC, which
 * runs a guarded SELECT and a benchmark-battery smoke test inside the DO.
 */
export async function checkSalarySql(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  try {
    const agent = (await getAgentByName(env.SALARY_AGENT as any, "global")) as any;
    const res = await agent.healthProbe();

    if (res.status === "ok") {
      return {
        status: "ok",
        latencyMs: res.latencyMs ?? Date.now() - start,
        details: res.details,
      };
    }

    return {
      status: "fail",
      latencyMs: res.latencyMs ?? Date.now() - start,
      error: res.error,
      details: { aiSuggestion: "Check D1 bindings or salary table definitions." },
    };
  } catch (error) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
      details: {
        aiSuggestion: "Ensure the SalaryAgent is deployed and the SALARY_AGENT binding is correct.",
      },
    };
  }
}
