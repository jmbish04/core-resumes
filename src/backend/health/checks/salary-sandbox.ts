import { getAgentByName } from "agents";
import type { HealthStepResult } from "@/backend/health/types";

/**
 * Health check diagnostics for the SalaryAgent and its secure Python sandbox.
 *
 * Resolves the stateful SalaryAgent DO, triggers its internal healthProbe RPC
 * to provision an ephemeral sandbox container, and validates both standard Python
 * and on-demand script compilation capabilities.
 */
export async function checkSalarySandbox(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  try {
    if (!env.SALARY_AGENT) {
      throw new Error("Missing SALARY_AGENT Durable Object binding in wrangler.jsonc.");
    }

    // Resolve stub and cast to any to prevent compiler TS2589 type recursion limits
    const stub = await getAgentByName(env.SALARY_AGENT as any, "global");
    const result = await (stub as any).healthProbe();

    if (!result || typeof result !== "object" || !("status" in result)) {
      return {
        status: "fail",
        latencyMs: Date.now() - start,
        error: `Invalid response shape from SalaryAgent health probe: ${JSON.stringify(result)}`,
      };
    }

    return result as HealthStepResult;
  } catch (error) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: `SalaryAgent sandbox verification failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
