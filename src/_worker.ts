/**
 * @fileoverview Unified Cloudflare Worker entry point for the Career
 * Orchestrator application.
 *
 * This module wires together four routing layers in priority order:
 *  1. **MCP endpoint** (`/mcp/notebooklm`) — Bearer-token-auth'd MCP server
 *     for external AI tools to query the NotebookLM career knowledge base.
 *  2. **Agents SDK** (`routeAgentRequest`) — WebSocket and RPC routing for
 *     Durable Object agents (OrchestratorAgent, NotebookLMAgent).
 *  3. **Hono API** (`/api/*`, `/openapi.json`, `/scalar`, `/swagger`) — the
 *     REST API with OpenAPI documentation.
 *  4. **Astro SSR** — all remaining requests are handled by the Astro
 *     frontend (pages, assets, etc.).
 *
 * Durable Object classes must be named exports from this module so the
 * Cloudflare runtime can instantiate them.  They are listed in the
 * `createExports` return object and mirrored in `astro.config.ts`
 * `namedExports` and `wrangler.jsonc` `durable_objects.bindings`.
 *
 * The `email()` handler delegates inbound recruiting email to
 * `src/backend/email/handler.ts` for parsing, role-matching, and storage.
 */

import { handle } from "@astrojs/cloudflare/handler";
// Required re-export for Sandbox container deployment
import { Sandbox } from "@cloudflare/sandbox";
import { routeAgentRequest } from "agents";
import { App } from "astro/app";

import { RoleChatAgent } from "./backend/ai/agents/chat";
import { JobAnalysisAgent } from "./backend/ai/agents/job/analysis";
import { JobScannerAgent } from "./backend/ai/agents/job/scanner";
import { NotebookLMAgent } from "./backend/ai/agents/notebooklm";
import { NotebookLMMcpAgent } from "./backend/ai/agents/notebooklm-mcp";
import { OrchestratorAgent } from "./backend/ai/agents/orchestrator";
import { SyncBroadcastAgent } from "./backend/ai/agents/sync-broadcast";
import { TranscriptionAgent } from "./backend/ai/agents/transcription";
import { SalaryAgent } from "./backend/ai/agents/salary";
import { FreelanceScannerAgent } from "./backend/ai/agents/job/freelance-scanner";
import { app as honoApp } from "./backend/api";
import { handleInboundEmail } from "./backend/email/handler";
import { HealthCoordinator } from "./backend/health";
import { RoleAssetsWorkflow, RoleAnalysisWorkflow } from "./backend/workflows";
export {
  Sandbox,
  RoleAssetsWorkflow,
  RoleAnalysisWorkflow,
  JobScannerAgent,
  JobAnalysisAgent,
  SyncBroadcastAgent,
  RoleChatAgent,
  SalaryAgent,
  FreelanceScannerAgent,
};

/**
 * Create the Worker's default and named exports from the Astro build manifest.
 *
 * @param manifest - The Astro SSR manifest generated at build time.
 * @returns An object containing:
 *   - `default.fetch` — the main request handler
 *   - `default.email` — the inbound email handler
 *   - `OrchestratorAgent` — primary orchestrator Durable Object class
 *   - `NotebookLMAgent` — knowledge-retrieval Durable Object class
 *   - `NotebookLMMcpAgent` — MCP server Durable Object class
 *   - `TranscriptionAgent` — audio transcription orchestrator Durable Object
 *   - `RoleAssetsWorkflow` — durable role asset and podcast pipeline
 *   - `Sandbox` — Sandbox container class (re-exported from @cloudflare/sandbox)
 */
export function createExports(manifest: any) {
  const astroApp = new App(manifest);

  /**
   * Main fetch handler — routes requests through MCP, Agents SDK, Hono API,
   * and Astro SSR in priority order.
   */
  const fetch = async (request: Request, env: any, ctx: any) => {
    const url = new URL(request.url);

    // Layer 1: MCP server for NotebookLM (Bearer token auth)
    if (url.pathname.startsWith("/mcp/notebooklm")) {
      const authHeader = request.headers.get("Authorization");
      const expectedKey = await env.WORKER_API_KEY.get();
      if (authHeader !== `Bearer ${expectedKey}`) {
        return new Response("Unauthorized", { status: 401 });
      }
      return routeAgentRequest(request, env, ctx);
    }

    // Layer 2: Agents SDK (WebSocket / RPC for Durable Objects)
    const agentResponse = await routeAgentRequest(request, env);
    if (agentResponse) {
      return agentResponse;
    }

    // Layer 3: Hono REST API
    if (shouldHandleWithApi(url.pathname)) {
      return honoApp.fetch(request, env, ctx);
    }

    // Layer 4: Astro SSR (frontend pages and static assets)
    return await handle(manifest, astroApp, request as any, env, ctx);
  };

  /**
   * Inbound email handler — delegates to `handleInboundEmail()` for parsing,
   * role-matching, and D1 storage.
   */
  const email = async (message: any, env: any, ctx: any) => {
    return handleInboundEmail(message, env, ctx);
  };

  /**
   * Cron-triggered handler.
   *
   * - `0 *\/4 * * *` — 4-hour health check.
   * - `0 *\/6 * * *` — 6-hour Greenhouse pipeline scan.
   * - `0 *\/12 * * *` — 12-hour freelance pipeline scan.
   */
  const scheduled = async (controller: any, env: any, ctx: any) => {
    const cronExpression = controller.cron ?? "";

    // 12-hour freelance pipeline scan
    if (cronExpression === "0 */12 * * *") {
      try {
        const { getAgentByName } = await import("agents");
        const agent = await getAgentByName(env.FREELANCE_SCANNER_AGENT, "global");
        const sessionIds = await (agent as any).scanAll();
        console.log(
          `[cron:freelance] Scan triggered — ${sessionIds.length} session(s) started`,
        );
      } catch (e) {
        console.error("[cron:freelance] Failed to trigger freelance scan:", e);
      }
      return;
    }

    // Default: health check (4-hour cron)
    try {
      const coordinator = new HealthCoordinator(env);
      const { run } = await coordinator.runAllChecks("scheduled");
      console.log(
        `[cron:health] Screening complete — status: ${run.status}, duration: ${run.durationMs}ms`,
      );
    } catch (e) {
      console.error("[cron:health] Failed to run health screening:", e);
    }
  };

  return {
    default: { fetch, email, scheduled },
    OrchestratorAgent,
    NotebookLMAgent,
    NotebookLMMcpAgent,
    TranscriptionAgent,
    RoleAssetsWorkflow,
    RoleAnalysisWorkflow,
    JobScannerAgent,
    JobAnalysisAgent,
    SyncBroadcastAgent,
    RoleChatAgent,
    SalaryAgent,
    FreelanceScannerAgent,
    Sandbox,
  };
}

/**
 * Determine whether a request path should be handled by the Hono API
 * rather than Astro SSR.
 *
 * @param pathname - The URL pathname to check.
 * @returns `true` if the path belongs to the API layer.
 */
function shouldHandleWithApi(pathname: string) {
  return (
    pathname.startsWith("/api/") ||
    pathname === "/openapi.json" ||
    pathname === "/swagger" ||
    pathname === "/scalar"
  );
}
