/**
 * @fileoverview Pipeline ops MCP tools — Greenhouse job scanning, board
 * tokens, upstream company aggregator sync, and pipeline statistics.
 */
import { z } from "zod";

import { internalFetchJson, toolText } from "../internal-fetch";

import type { CoreResumesMcpAgent } from "../../index";

export function registerPipelineTools(agent: CoreResumesMcpAgent, env: Env) {
  // ── Jobs ──────────────────────────────────────────────────────────────
  agent.server.tool(
    "list_pipeline_jobs",
    "List the most recently scraped pipeline jobs (last 50).",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/pipeline/jobs");
      return toolText(result);
    },
  );

  agent.server.tool(
    "scan_pipeline_jobs",
    "Trigger a manual Greenhouse pipeline scan. Pass `token` to scan a single board, or omit to scan all active boards. Returns the session IDs that were started.",
    { token: z.string().optional() },
    async ({ token }) => {
      const result = await internalFetchJson(env, "/api/pipeline/jobs/scan", {
        method: "POST",
        body: token ? { token } : {},
      });
      return toolText(result);
    },
  );

  // ── Stats ─────────────────────────────────────────────────────────────
  agent.server.tool(
    "get_pipeline_stats",
    "Aggregated pipeline statistics — total sessions, active companies, jobs scraped/triaged/analyzed, last scrape timestamp, next scheduled run, cron schedule, and session history.",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/pipeline/stats");
      return toolText(result);
    },
  );

  // ── Board tokens ──────────────────────────────────────────────────────
  agent.server.tool(
    "list_board_tokens",
    "List all Greenhouse board tokens (active and inactive).",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/pipeline/board-tokens");
      return toolText(result);
    },
  );

  agent.server.tool(
    "create_board_token",
    "Create a new Greenhouse board token. Active by default.",
    {
      token: z.string().min(1),
      companyName: z.string().optional(),
      companyUrl: z.string().optional(),
      emailDomain: z.string().optional(),
      isActive: z.boolean().optional(),
    },
    async (body) => {
      const result = await internalFetchJson(env, "/api/pipeline/board-tokens", {
        method: "POST",
        body,
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "update_board_token",
    "Update a Greenhouse board token by id.",
    {
      id: z.number().int(),
      token: z.string().optional(),
      companyName: z.string().nullable().optional(),
      companyUrl: z.string().nullable().optional(),
      emailDomain: z.string().nullable().optional(),
      isActive: z.boolean().optional(),
    },
    async ({ id, ...body }) => {
      const result = await internalFetchJson(env, `/api/pipeline/board-tokens/${id}`, {
        method: "PUT",
        body,
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "delete_board_token",
    "Delete a Greenhouse board token by id.",
    { id: z.number().int() },
    async ({ id }) => {
      const result = await internalFetchJson(env, `/api/pipeline/board-tokens/${id}`, {
        method: "DELETE",
      });
      return toolText(result);
    },
  );

  // ── Upstream API companies aggregator ─────────────────────────────────
  agent.server.tool(
    "list_api_companies",
    "List active upstream aggregator companies (with greenhouse/lever/etc. tokens).",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/pipeline/api-companies");
      return toolText(result);
    },
  );

  agent.server.tool(
    "sync_api_companies",
    "Sync companies from the upstream GitHub aggregator into the local DB. Pass the aggregator's company array.",
    {
      companies: z.array(
        z.object({
          token: z.string(),
          system: z.string(),
          source: z.string(),
          isRecommended: z.boolean().optional(),
          recommendationReason: z.string().nullable().optional(),
          recommendedJobs: z
            .array(
              z.object({
                id: z.string(),
                title: z.string(),
                location: z.string(),
              }),
            )
            .optional(),
        }),
      ),
    },
    async (body) => {
      const result = await internalFetchJson(env, "/api/pipeline/api-companies/sync", {
        method: "POST",
        body,
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "trigger_api_companies_sync",
    "Dispatch the GitHub Action that runs the upstream company sync. Returns the workflow run ID + URL.",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/pipeline/api-companies/trigger-sync", {
        method: "POST",
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_api_companies_sync_stats",
    "Historical sync run statistics (durations, event counts, success rates).",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/pipeline/api-companies/sync-stats");
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_sync_run_events",
    "Detailed step-by-step events for a single sync run.",
    { id: z.number().int() },
    async ({ id }) => {
      const result = await internalFetchJson(
        env,
        `/api/pipeline/api-companies/sync-stats/${id}/events`,
      );
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_api_companies_steps",
    "List the workflow step definitions used to track sync progress.",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/pipeline/api-companies/steps");
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_api_companies_search_terms",
    "Get the title/location keywords used for matching upstream postings.",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/pipeline/api-companies/search-terms");
      return toolText(result);
    },
  );

  agent.server.tool(
    "reject_api_company_recommendation",
    "Dismiss a single upstream-company recommendation by id.",
    { id: z.number().int() },
    async ({ id }) => {
      const result = await internalFetchJson(
        env,
        `/api/pipeline/api-companies/${id}/reject`,
        { method: "POST" },
      );
      return toolText(result);
    },
  );

  agent.server.tool(
    "reject_all_api_company_recommendations",
    "Dismiss all pending upstream-company recommendations.",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/pipeline/api-companies/reject-all", {
        method: "POST",
      });
      return toolText(result);
    },
  );
}
