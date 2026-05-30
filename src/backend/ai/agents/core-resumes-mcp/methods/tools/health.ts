/**
 * @fileoverview Health MCP tools — run the full HealthCoordinator suite
 * or fetch the latest scheduled run.
 */
import { internalFetchJson, toolText } from "../internal-fetch";

import type { CoreResumesMcpAgent } from "../../index";

export function registerHealthTools(agent: CoreResumesMcpAgent, env: Env) {
  agent.server.tool(
    "get_latest_health_check",
    "Fetch the most recent scheduled health check run (D1, KV, R2, AI, agents, etc.).",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/health/latest");
      return toolText(result);
    },
  );

  agent.server.tool(
    "run_health_checks",
    "Run the full health check suite on-demand. Returns per-module status, latencies, and any errors.",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/health/run", { method: "POST" });
      return toolText(result);
    },
  );

  agent.server.tool(
    "check_health",
    "Quick liveness check — runs the default health probe and returns aggregate status.",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/health");
      return toolText(result);
    },
  );
}
