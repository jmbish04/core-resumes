import type { ModuleResult } from "@/backend/health/types";

import { getDb } from "@/db";
import { roles } from "@/db/schema";
import { getWorkerApiKey } from "@/utils/secrets";

import type { CoreResumesMcpAgent } from "./index";

/**
 * Agent-level health probe — validates D1 + WORKER_API_KEY availability.
 *
 * Stays passive: no agent RPC calls, no NotebookLM session checks. The
 * surface this agent exposes is huge (~55 tools), but the failure modes
 * all reduce to "can we reach the internal Hono router" — which requires
 * D1 + the worker API key.
 */
export async function checkHealth(agent: CoreResumesMcpAgent, env: Env) {
  const start = Date.now();
  try {
    const apiKey = await getWorkerApiKey(env);
    if (!apiKey) {
      throw new Error("WORKER_API_KEY secret unavailable — MCP cannot authenticate internal fetches");
    }

    // Cheap D1 probe — count a single row from a small table.
    const db = getDb(env);
    await db.select({ id: roles.id }).from(roles).limit(1);

    return {
      status: "ok",
      latencyMs: Date.now() - start,
      details: { dbReachable: true, hasWorkerApiKey: true },
    };
  } catch (error) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: `CoreResumesMcpAgent health check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function checkCoreResumesMcpAgentRPC(env: Env): Promise<ModuleResult> {
  const start = Date.now();
  try {
    const apiKey = await getWorkerApiKey(env);
    if (!apiKey) {
      throw new Error("Missing WORKER_API_KEY");
    }
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (e) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: `CoreResumesMcpAgent RPC failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
