import type { ModuleResult } from "@/backend/health/types";

import { checkNotebookLMSession } from "@/ai/tools/notebooklm/notebooklm";
import { getNotebookLMCookieSigningKey } from "@/utils/secrets";

import type { NotebookLMMcpAgent } from "./index";

/**
 * Agent-level health probe — validates bindings and session presence
 * without making any outbound requests to Google.
 *
 * **No live queries:** The SDK's `connect()` call fetches the live
 * NotebookLM page from the Worker edge, which causes Google to flag
 * and expire the session prematurely (~1 hour instead of ~1 month).
 */
export async function checkHealth(agent: NotebookLMMcpAgent, env: Env) {
  const start = Date.now();
  try {
    // Verify necessary bindings for the tools exist
    const signingKey = await getNotebookLMCookieSigningKey(env);
    if (!signingKey) {
      throw new Error("Missing NotebookLM cookie signing key");
    }

    // Verify session is available (passive — no outbound requests)
    const session = await checkNotebookLMSession(env);
    if (!session.available) {
      throw new Error("No active NotebookLM session. Update from Config → NotebookLM Session.");
    }

    return {
      status: "ok",
      latencyMs: Date.now() - start,
      details: { sessionSource: session.source },
    };
  } catch (error) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: `NotebookLMMcpAgent health check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function checkNotebookLMMcpAgentRPC(env: Env): Promise<ModuleResult> {
  const start = Date.now();
  try {
    // McpAgent requires MCP transport — cannot use getAgentByName RPC.
    // Instead, verify the underlying NotebookLM bindings are present.
    const signingKey = await getNotebookLMCookieSigningKey(env);
    if (!signingKey) {
      throw new Error("Missing NotebookLM cookie signing key in KV");
    }
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (e) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: `NotebookLMMcpAgent RPC failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
