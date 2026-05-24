import { getAgentByName } from "agents";

import type { ModuleResult } from "@/backend/health/types";

import { checkNotebookLMSession } from "@/ai/tools/notebooklm/notebooklm";

/**
 * Agent RPC health check — verifies the NotebookLMAgent Durable Object is
 * reachable and can respond to RPC calls.
 *
 * This intentionally does NOT call `consultNotebook()`. The full end-to-end
 * query test is handled separately by `notebooklm_query` in
 * `health/checks/notebooklm-query.ts`.
 */
export async function checkNotebookLMAgentRPC(env: Env): Promise<ModuleResult> {
  const start = Date.now();
  try {
    const stub = await getAgentByName(env.NOTEBOOKLM_AGENT, "global");
    const result = await stub.healthProbe();
    if (!result || typeof result !== "object" || !("status" in result)) {
      throw new Error("Invalid response from agent");
    }
    return result as ModuleResult;
  } catch (e) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: `NotebookLMAgent RPC failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * System-level check for NotebookLM bindings and session availability.
 * Delegates to the centralized auth module — no direct KV/secret access.
 */
export async function checkNotebookLMSystem(env: Env): Promise<ModuleResult> {
  const start = Date.now();
  const issues: string[] = [];

  if (!env.CAREER_NOTEBOOKLM_ID) issues.push("CAREER_NOTEBOOKLM_ID not set");

  const session = await checkNotebookLMSession(env);
  if (!session.available) {
    issues.push("No active NotebookLM session (checked KV + Worker Secret)");
  }

  try {
    const signingKey = await env.KV.get("NOTEBOOKLM_COOKIE_SIGNING_KEY");
    if (!signingKey) issues.push("NOTEBOOKLM_COOKIE_SIGNING_KEY not in KV");
  } catch {
    issues.push("Failed to read NOTEBOOKLM_COOKIE_SIGNING_KEY from KV");
  }

  return {
    status: issues.length === 0 ? "ok" : "fail",
    latencyMs: Date.now() - start,
    error: issues.length > 0 ? issues.join("; ") : undefined,
    details: {
      notebookId: env.CAREER_NOTEBOOKLM_ID || "missing",
      sessionSource: session.source,
      issueCount: issues.length,
    },
  };
}
