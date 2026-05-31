/**
 * @fileoverview Salary intelligence MCP tools — query the
 * pipeline-aggregated salary snapshots, kick off SalaryAgent analysis,
 * and pull per-role market compensation insights.
 */
import { z } from "zod";

import { internalFetchJson, toolText } from "../internal-fetch";

import type { CoreResumesMcpAgent } from "../../index";

export function registerSalaryTools(agent: CoreResumesMcpAgent, env: Env) {
  agent.server.tool(
    "get_latest_salary_snapshot",
    "Latest aggregated salary snapshot from the pipeline — broad market percentiles plus per-company lookup data.",
    {},
    async () => {
      const result = await internalFetchJson(
        env,
        "/api/pipeline/api-companies/salary-stats/latest",
      );
      return toolText(result);
    },
  );

  agent.server.tool(
    "analyze_salary_trends",
    "Kick off SalaryAgent broad trend analysis (uses SQL and deterministic benchmarks). Returns the run ID; poll latest_salary_insight for the markdown report.",
    {},
    async () => {
      const result = await internalFetchJson(
        env,
        "/api/pipeline/salary/analyze-aggregate",
        { method: "POST", body: JSON.stringify({ input: {} }) },
      );
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_latest_salary_insight",
    "Latest AI salary insight (markdown report). Use this to present salary trends to the user.",
    {},
    async () => {
      const result = await internalFetchJson(
        env,
        "/api/pipeline/api-companies/salary-stats/trends/latest",
      );
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_role_market_compensation",
    "Market compensation scorecards for a specific role — local, remote, and company-specific percentile comparisons.",
    { roleId: z.string() },
    async ({ roleId }) => {
      const result = await internalFetchJson(
        env,
        `/api/roles/${encodeURIComponent(roleId)}/insights/market-compensation`,
      );
      return toolText(result);
    },
  );

  agent.server.tool(
    "analyze_role_compensation",
    "Run on-the-fly market compensation analysis for a specific role via SalaryAgent.",
    { roleId: z.string() },
    async ({ roleId }) => {
      const result = await internalFetchJson(
        env,
        "/api/pipeline/salary/analyze-role",
        { method: "POST", body: JSON.stringify({ roleId }) },
      );
      return toolText(result);
    },
  );
}
