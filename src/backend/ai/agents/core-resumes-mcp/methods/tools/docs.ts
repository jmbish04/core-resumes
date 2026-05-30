/**
 * @fileoverview Docs MCP tools — list known docs and pull structured doc
 * payloads from the existing /api/docs/* endpoints.
 *
 * Note: the markdown source for frontend docs lives in
 * src/frontend/content/docs/*.md and is rendered by Astro at /docs/:slug.
 * Those routes are HTML and not exposed via the Hono router, so the MCP
 * tools below surface (a) a curated list of known doc slugs + URLs and
 * (b) the structured /api/docs/* payloads that already exist (schema,
 * agents, notebooklm).
 */
import { z } from "zod";

import { internalFetchJson, toolText } from "../internal-fetch";

import type { CoreResumesMcpAgent } from "../../index";

const KNOWN_DOCS: Array<{ slug: string; title: string; group: string }> = [
  { slug: "overview", title: "Overview", group: "Overview" },
  { slug: "api", title: "API", group: "Overview" },
  { slug: "architecture", title: "Architecture", group: "Overview" },
  { slug: "database", title: "Database", group: "Overview" },
  { slug: "health", title: "Health Checks", group: "Overview" },
  { slug: "configuration", title: "Configuration", group: "Overview" },
  { slug: "agents", title: "Agents", group: "Agents" },
  { slug: "agents/orchestrator", title: "OrchestratorAgent", group: "Agents" },
  { slug: "agents/notebooklm", title: "NotebookLMAgent", group: "Agents" },
  { slug: "agents/notebooklm-mcp", title: "NotebookLM MCP", group: "Agents" },
  { slug: "agents/core-resumes-mcp", title: "Core Resumes MCP", group: "Agents" },
  { slug: "role-intake", title: "Role Intake", group: "Features" },
  { slug: "role-insights", title: "Role Insights", group: "Features" },
  { slug: "role-viewport", title: "Role Viewport", group: "Features" },
  { slug: "active-board-tracker", title: "Active Board Tracker", group: "Features" },
  { slug: "discovery-board-aggregator", title: "Discovery Board Aggregator", group: "Features" },
  { slug: "documents-generation", title: "Documents Generation", group: "Features" },
  { slug: "email-pipeline", title: "Email Pipeline", group: "Features" },
  { slug: "cover-letter-template", title: "Cover Letter Template", group: "Features" },
  { slug: "resume-template", title: "Resume Template", group: "Features" },
  { slug: "integrations/google-docs", title: "Google Docs", group: "Integrations" },
  { slug: "integrations/google-drive", title: "Google Drive", group: "Integrations" },
  { slug: "integrations/job-boards", title: "Job Boards", group: "Integrations" },
  { slug: "integrations/notebooklm", title: "NotebookLM", group: "Integrations" },
  { slug: "integrations/openroute", title: "OpenRoute", group: "Integrations" },
  { slug: "integrations/vpc-tunnel", title: "VPC Tunnel", group: "Integrations" },
  { slug: "notebooklm", title: "NotebookLM (main)", group: "NotebookLM" },
];

export function registerDocsTools(agent: CoreResumesMcpAgent, env: Env) {
  agent.server.tool(
    "list_docs",
    "List all known documentation pages with their slugs, titles, and groups. Each doc is viewable in the browser at /docs/{slug}.",
    {},
    async () => {
      return toolText({
        docs: KNOWN_DOCS.map((d) => ({ ...d, url: `/docs/${d.slug}` })),
        note: "Markdown source lives in src/frontend/content/docs/*.md. Use get_doc_meta for structured per-area payloads (schema, agents, notebooklm) served by /api/docs/*.",
      });
    },
  );

  agent.server.tool(
    "get_doc_meta",
    "Fetch a structured payload from /api/docs/* — choose 'schema' (DB schema), 'agents' (agent registry), or 'notebooklm' (NotebookLM agent metadata).",
    { topic: z.enum(["schema", "agents", "notebooklm"]) },
    async ({ topic }) => {
      const result = await internalFetchJson(env, `/api/docs/${topic}`);
      return toolText(result);
    },
  );
}
