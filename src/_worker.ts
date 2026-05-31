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

import { createOAuthProvider } from "./backend/oauth";

import { RoleChatAgent } from "./backend/ai/agents/chat";
import { CoreResumesMcpAgent } from "./backend/ai/agents/core-resumes-mcp";
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
  CoreResumesMcpAgent,
};

/**
 * Mount the Core Resumes MCP server with two transports:
 *
 *   1. `/mcp` — Streamable HTTP transport (modern, recommended).
 *   2. `/sse` — legacy SSE transport (required by older Claude CLI / Desktop
 *      versions that don't yet speak Streamable HTTP, e.g. claude CLI v0.2.x).
 *
 * Both handlers dispatch to the same `CORE_RESUMES_MCP_AGENT` Durable Object
 * binding — the agent itself is transport-agnostic.
 */
const coreResumesMcpHandler = CoreResumesMcpAgent.serve("/mcp", {
  binding: "CORE_RESUMES_MCP_AGENT",
});
const coreResumesMcpSseHandler = CoreResumesMcpAgent.serveSSE("/sse", {
  binding: "CORE_RESUMES_MCP_AGENT",
});

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

    // Layer 1a: Comprehensive Core Resumes MCP server.
    //
    // Two transports — both backed by the same CoreResumesMcpAgent DO:
    //   - `/mcp`  — Streamable HTTP (modern)
    //   - `/sse`  — legacy SSE (older Claude CLI / Desktop)
    //
    // Two auth schemes — both accepted on either transport:
    //   - `Authorization: Bearer $WORKER_API_KEY`  (pre-shared key fast path)
    //   - OAuth 2.1 dynamic-client-registration via the OAuthProvider
    //     (required by Claude Chat web/iOS and any client without a
    //     pre-shared key)
    //
    // `/mcp` and `/sse` are RESERVED for MCP protocol — there is no browser
    // fallback. The human-facing install/docs page lives at `/docs/mcp`.
    const isMcpUnderRoot =
      url.pathname === "/mcp" ||
      (url.pathname.startsWith("/mcp/") && !url.pathname.startsWith("/mcp/notebooklm"));
    const isSseRoute =
      url.pathname === "/sse" || url.pathname.startsWith("/sse/");

    // OAuth meta + flow endpoints — always handled by the OAuthProvider.
    const isOAuthMeta =
      url.pathname === "/.well-known/oauth-authorization-server" ||
      url.pathname === "/.well-known/oauth-protected-resource" ||
      url.pathname === "/oauth/authorize" ||
      url.pathname === "/oauth/token" ||
      url.pathname === "/oauth/register";

    if (isOAuthMeta) {
      const oauthProvider = createOAuthProvider(url.origin, {
        mcp: coreResumesMcpHandler,
        sse: coreResumesMcpSseHandler,
      });
      return oauthProvider.fetch(request, env, ctx);
    }

    if (isMcpUnderRoot || isSseRoute) {
      // Pre-shared key fast path — accepts WORKER_API_KEY Bearer directly,
      // skipping the OAuth provider entirely for CLI / scripts that have
      // the secret.
      const authHeader = request.headers.get("Authorization") ?? "";
      const expectedKey = await env.WORKER_API_KEY.get();
      if (expectedKey && authHeader === `Bearer ${expectedKey}`) {
        if (isSseRoute) return coreResumesMcpSseHandler.fetch(request, env, ctx);
        return coreResumesMcpHandler.fetch(request, env, ctx);
      }

      // OAuth path — provider validates the access token. On 401 it emits
      // a WWW-Authenticate header pointing MCP clients at the OAuth
      // metadata so they can run the dynamic-registration / authorization
      // / token-exchange dance.
      const oauthProvider = createOAuthProvider(url.origin, {
        mcp: coreResumesMcpHandler,
        sse: coreResumesMcpSseHandler,
      });
      return oauthProvider.fetch(request, env, ctx);
    }

    // Layer 1b: MCP server for NotebookLM (Bearer token auth)
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
   * - `0 *\/4 * * *` -- 4-hour health check + RapidAPI salary refresh (spaced).
   * - `0 *\/6 * * *` -- 6-hour Greenhouse pipeline scan.
   * - `0 *\/12 * * *` -- 12-hour freelance pipeline scan.
   */
  const scheduled = async (controller: any, env: any, ctx: any) => {
    const cronExpression = controller.cron ?? "";

    // 6-hour Greenhouse pipeline scan
    if (cronExpression === "0 */6 * * *") {
      try {
        const { getAgentByName } = await import("agents");
        const agent = await getAgentByName(env.JOB_SCANNER_AGENT as any, "global");
        await (agent as any).scanAll();
        console.log("[cron:greenhouse] Greenhouse scan triggered");
      } catch (e) {
        console.error("[cron:greenhouse] Failed to trigger Greenhouse scan:", e);
      }
      return;
    }

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

    // Default: health check (4-hour cron) + RapidAPI salary refresh
    try {
      const coordinator = new HealthCoordinator(env);
      const { run } = await coordinator.runAllChecks("scheduled");
      console.log(
        `[cron:health] Screening complete — status: ${run.status}, duration: ${run.durationMs}ms`,
      );
    } catch (e) {
      console.error("[cron:health] Failed to run health screening:", e);
    }

    // RapidAPI salary refresh — shouldRunOnCron() spaces calls evenly across
    // the month within the configured budget (default: 50 calls/month).
    try {
      const { runSalaryCron } = await import(
        "./backend/cron/rapidapi-salary-refresh"
      );
      const result = await runSalaryCron(env, cronExpression);
      if (!result.skipped && result.refreshed) {
        console.log(
          `[cron:salary] Refreshed "${result.refreshed.jobTitle}" -- ` +
            `${result.refreshed.jobSalaryCount} job + ${result.refreshed.companySalaryCount} company estimates`,
        );
      }
    } catch (e) {
      console.error("[cron:salary] Failed to run salary refresh:", e);
    }

    // GitHub repository watching alert for poteto/hiring-without-whiteboards
    try {
      const { runGithubWatchCron } = await import(
        "./backend/cron/github-watch-alert"
      );
      const result = await runGithubWatchCron(env);
      if (result.checked && result.shaChanged) {
        console.log(
          `[cron:github-watch] Synchronized with poteto/hiring-without-whiteboards -- ` +
            `Discovered ${result.newCompaniesCount} new companies`,
        );
      }
    } catch (e) {
      console.error("[cron:github-watch] Failed to run GitHub watch alert:", e);
    }

    // Discovery scorer — keyword + location heuristic matching for
    // is_recommended on api_companies and jobs_postings.
    try {
      const { runDiscoveryScorer } = await import(
        "./backend/cron/discovery-scorer"
      );
      const result = await runDiscoveryScorer(env);
      if (result.jobsScored > 0 || result.companiesScored > 0) {
        console.log(
          `[cron:discovery] Scored ${result.jobsScored} jobs (${result.jobsRecommended} recommended), ` +
            `${result.companiesScored} companies (${result.companiesRecommended} recommended)`,
        );
      }
    } catch (e) {
      console.error("[cron:discovery] Failed to run discovery scorer:", e);
    }

    // Discovery analyzer — batch AI deep analysis for recommended jobs
    try {
      const { runDiscoveryAnalyzer } = await import(
        "./backend/cron/discovery-analyzer"
      );
      const result = await runDiscoveryAnalyzer(env);
      if (result.analyzed > 0 || result.failed > 0) {
        console.log(
          `[cron:discovery-analyzer] Deep analyzed ${result.analyzed} jobs, ${result.failed} failed`,
        );
      }
    } catch (e) {
      console.error("[cron:discovery-analyzer] Failed to run discovery analyzer:", e);
    }

    // Company profile enrichment — populates missing names on api_companies
    // by querying Greenhouse/Ashby/Lever board APIs (25 per run).
    try {
      const { runCompanyEnrichment } = await import(
        "./backend/cron/company-enrichment"
      );
      const result = await runCompanyEnrichment(env);
      if (result.enriched > 0 || result.failed > 0) {
        console.log(
          `[cron:enrichment] Enriched ${result.enriched}/${result.queried} companies, ` +
            `${result.failed} failed, ${result.skipped} skipped`,
        );
      }
    } catch (e) {
      console.error("[cron:enrichment] Failed to run company enrichment:", e);
    }
  };

  return {
    default: { fetch, email, scheduled },
    OrchestratorAgent,
    NotebookLMAgent,
    NotebookLMMcpAgent,
    CoreResumesMcpAgent,
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
