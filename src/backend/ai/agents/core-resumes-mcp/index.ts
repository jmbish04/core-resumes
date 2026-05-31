/**
 * @fileoverview CoreResumesMcpAgent — comprehensive MCP server that exposes
 * the full Core Resumes / Career Orchestrator HTTP API as MCP tools.
 *
 * Mounted at `/mcp` and authenticated with the `WORKER_API_KEY` Bearer token
 * (same secret as `/mcp/notebooklm`). External AI tools — and Claude in chat —
 * can connect and call ~55 tools covering role intake, role lifecycle,
 * pipeline operations, companies, freelance discovery & bidding, salary
 * intelligence, NotebookLM, career memory, config, health, and docs.
 *
 * Every tool dispatches through the existing Hono router via
 * `methods/internal-fetch.ts`, preserving zod-openapi validation and the
 * authMiddleware's Bearer-token fallback.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callable } from "agents";
import { McpAgent } from "agents/mcp";

import { checkHealth as healthProbeImpl } from "./health";
import { initMcpServer } from "./methods/mcp";

export class CoreResumesMcpAgent extends McpAgent<Env, any, any> {
  static docsMetadata() {
    return {
      name: "Core Resumes MCP",
      className: "CoreResumesMcpAgent",
      description:
        "Comprehensive MCP server exposing the full Core Resumes API as Claude-callable tools — role intake (URL → scrape → confirm), role lifecycle (list/get/update/reprocess/generate), pipeline ops, companies, freelance gig discovery & bidding, salary intelligence, NotebookLM, career memory, config, health, and docs. Bearer-token authenticated at /mcp.",
      docsPath: "/docs/agents/core-resumes-mcp",
      methods: [
        {
          name: "init",
          description: "Registers all MCP tool modules on server startup",
          params: "none",
          returns: "void",
        },
        {
          name: "healthProbe",
          description: "Validates bindings and reports MCP server readiness",
          params: "none",
          returns: "{ status, latencyMs, details? | error? }",
        },
      ],
      tools: [
        "Hono router (internal fetch)",
        "RoleStatusService",
        "CareerMemoryService",
        "FreelanceService",
        "SalaryAgent (Durable Object)",
        "HealthCoordinator",
      ],
      mcpTools: [
        // Role intake & lifecycle
        { name: "submit_role_url", description: "Scrape a job posting URL via Browser Rendering and return the unconfirmed extracted preview" },
        { name: "confirm_role_intake", description: "Persist a previously scraped role (with optional edits)" },
        { name: "batch_role_intake", description: "Submit multiple URLs and confirm all in one call" },
        { name: "list_roles", description: "List roles with status/search filters" },
        { name: "get_role", description: "Get a single role with all extracted fields" },
        { name: "get_role_processing_status", description: "Get live orchestrator task state for a role" },
        { name: "get_role_analysis", description: "Get the latest role analysis insights" },
        // Role documents (Drive/Docs)
        { name: "list_role_documents", description: "List a role's Drive/Docs items with content inline" },
        { name: "get_role_document", description: "Get one role document with Drive metadata" },
        { name: "get_role_document_content", description: "Export a doc's markdown body" },
        { name: "sync_role_documents", description: "Scan the role's Drive folder for new files" },
        { name: "revise_role_document", description: "Create a '(revision N)' copy with optional edits" },
        { name: "create_role_document_from_text", description: "Create a new Google Doc from text in the role's folder" },
        { name: "delete_role_document", description: "Delete a role document row from D1 (Drive file kept)" },
        { name: "create_role_manual", description: "Manually create a role row (no scrape)" },
        { name: "update_role", description: "Partial-update a role's scraped fields" },
        { name: "delete_role", description: "Delete a role" },
        { name: "reprocess_role", description: "Retry failed orchestrator tasks or a specific taskId" },
        { name: "generate_role_asset", description: "Enqueue resume or cover_letter generation" },
        { name: "transition_role_status", description: "Atomic role status change with notes" },
        { name: "get_role_status_log", description: "Role status transition history" },
        { name: "get_role_logs", description: "Paginated activity logs for a role" },
        { name: "list_role_statuses", description: "List active role status definitions" },
        // Pipeline
        { name: "list_pipeline_jobs", description: "List recently scraped pipeline jobs" },
        { name: "scan_pipeline_jobs", description: "Trigger a manual Greenhouse scan" },
        { name: "get_pipeline_stats", description: "Aggregate pipeline stats + next run + cron schedule" },
        { name: "list_api_companies", description: "List active upstream aggregator companies" },
        { name: "sync_api_companies", description: "Sync companies from upstream GitHub aggregator" },
        { name: "trigger_api_companies_sync", description: "Dispatch the GitHub Action that runs the sync" },
        { name: "get_api_companies_sync_stats", description: "Historical sync run stats" },
        { name: "get_sync_run_events", description: "Events for a single sync run" },
        { name: "list_board_tokens", description: "List Greenhouse board tokens" },
        { name: "create_board_token", description: "Create a board token" },
        { name: "update_board_token", description: "Update a board token" },
        { name: "delete_board_token", description: "Delete a board token" },
        // Companies
        { name: "list_companies", description: "List all companies" },
        { name: "get_company", description: "Get a company" },
        { name: "create_company", description: "Create a company manually" },
        { name: "update_company", description: "Update a company" },
        { name: "get_company_analytics", description: "Company dashboard analytics" },
        // Freelance
        { name: "list_freelance_opportunities", description: "List freelance gigs with filters" },
        { name: "get_freelance_opportunity", description: "Get gig detail + triage + proposals" },
        { name: "scan_freelance", description: "Trigger a platform scan (upwork/freelancer/both)" },
        { name: "scan_all_freelance", description: "Scan all saved search profiles" },
        { name: "get_freelance_scan_runs", description: "Historical scan runs" },
        { name: "get_freelance_triage", description: "Get AI triage decision" },
        { name: "override_freelance_triage", description: "Manually override triage" },
        { name: "analyze_freelance_opportunity", description: "Deep client/competition/win-% analysis" },
        { name: "generate_freelance_proposal", description: "Generate an AI proposal draft" },
        { name: "list_freelance_proposals", description: "List all proposals with status filter" },
        { name: "get_freelance_proposal", description: "Get one proposal" },
        { name: "update_freelance_proposal", description: "Update a proposal (status, body, etc.)" },
        { name: "promote_freelance_to_role", description: "Promote a freelance gig into the roles table" },
        { name: "get_freelance_profile", description: "Full freelance profile config" },
        { name: "update_freelance_profile", description: "Update a single freelance profile key" },
        { name: "list_freelance_search_profiles", description: "List saved freelance search profiles" },
        { name: "upsert_freelance_search_profile", description: "Create or update a freelance search profile" },
        { name: "delete_freelance_search_profile", description: "Delete a freelance search profile" },
        { name: "get_freelance_stats", description: "Aggregate freelance dashboard stats" },
        // Salary intelligence
        { name: "get_latest_salary_snapshot", description: "Latest aggregated salary snapshot" },
        { name: "analyze_salary_trends", description: "Kick off SalaryAgent broad trend analysis" },
        { name: "get_latest_salary_insight", description: "Latest AI salary insight markdown" },
        { name: "get_role_market_compensation", description: "Market compensation scorecards for a role" },
        { name: "analyze_role_compensation", description: "On-the-fly role salary analysis (Sandbox)" },
        // NotebookLM
        { name: "notebook_query", description: "Query the NotebookLM career knowledge base" },
        // Career memory
        { name: "list_memories", description: "List career memories with filters" },
        { name: "search_memories", description: "Semantic search via Vectorize" },
        { name: "get_memory", description: "Get a single memory + revision chain" },
        { name: "update_memory", description: "Update a memory (soft-delete + revise)" },
        { name: "delete_memory", description: "Soft-delete a memory" },
        { name: "get_memory_stats", description: "Memory counts by category" },
        // Config
        { name: "list_config", description: "List all config keys with defaults flagged" },
        { name: "get_config", description: "Get one config value (with default fallback)" },
        { name: "set_config", description: "Upsert a config value" },
        { name: "seed_default_config", description: "Seed all default config entries" },
        // Health & docs
        { name: "run_health_checks", description: "Run the full HealthCoordinator suite" },
        { name: "list_docs", description: "List documentation pages" },
        { name: "get_doc", description: "Get rendered markdown for a doc slug" },
      ],
    };
  }

  server = new McpServer({
    name: "CoreResumes",
    version: "1.0.0",
  });

  async init() {
    await initMcpServer(this, this.env);
  }

  @callable()
  async healthProbe() {
    return healthProbeImpl(this, this.env);
  }
}
