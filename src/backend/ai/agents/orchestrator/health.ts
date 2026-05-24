import { getAgentByName } from "agents";
import { sql } from "drizzle-orm";

import { getDb } from "@/db";
import { roles } from "@/db/schema";

import type { OrchestratorAgent } from "./index";

export async function checkHealth(agent: OrchestratorAgent, env: Env) {
  const start = Date.now();
  try {
    const db = getDb(env);
    await db
      .select({ count: sql`count(*)` })
      .from(roles)
      .limit(1);

    return {
      status: "ok",
      latencyMs: Date.now() - start,
      details: {
        pendingTasks: agent.state.pendingTasks.length,
        activeRoleId: agent.state.roleId,
      },
    };
  } catch (error) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: `OrchestratorAgent health check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function checkOrchestratorAgentRPC(env: Env) {
  const start = Date.now();
  try {
    const stub = await getAgentByName(env.ORCHESTRATOR_AGENT, "global");
    const result = await stub.healthProbe();
    if (!result || typeof result !== "object" || !("status" in result)) {
      return {
        status: "fail",
        latencyMs: Date.now() - start,
        error: `Invalid response from OrchestratorAgent: ${String(result)}`,
      };
    }
    return result;
  } catch (e) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: `OrchestratorAgent RPC failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
