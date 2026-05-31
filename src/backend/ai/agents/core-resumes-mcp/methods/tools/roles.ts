/**
 * @fileoverview Role intake & lifecycle MCP tools.
 *
 * Covers the entire chat-driven role workflow: submit a URL, review the
 * scraped extraction, confirm it (with optional edits), then manage the
 * resulting role row through its lifecycle — status transitions, asset
 * generation, reprocessing, manual edits, and audit-log review.
 */
import { z } from "zod";

import { consumeSse, internalFetch, internalFetchJson, toolText } from "../internal-fetch";

import type { CoreResumesMcpAgent } from "../../index";

export function registerRoleTools(agent: CoreResumesMcpAgent, env: Env) {
  // ── Intake ────────────────────────────────────────────────────────────
  agent.server.tool(
    "submit_role_url",
    "Scrape a job posting URL via Browser Rendering. Returns the unconfirmed extracted preview (company, title, salary, bullets, narrative) plus the full mapping payload to pass into confirm_role_intake. Use this when the user shares a posting URL in chat — show them the scrape result and ask whether to confirm or edit before persisting.",
    { url: z.string().url() },
    async ({ url }) => {
      const res = await internalFetch(env, "/api/intake/scrape", {
        method: "POST",
        body: { url },
      });
      if (!res.ok) {
        return toolText({ error: true, status: res.status, body: await res.text() });
      }
      const events = await consumeSse(res);
      const mapping = events.find((e) => e.stage === "mapping");
      const error = events.find((e) => e.stage === "error");
      return toolText({
        ok: !error && !!mapping,
        mapping: mapping?.payload ?? null,
        error: error?.payload ?? null,
        stages: events.map((e) => e.stage),
      });
    },
  );

  agent.server.tool(
    "confirm_role_intake",
    "Persist a previously scraped role into the roles table. Pass the `mapping` payload from submit_role_url (optionally edited by the user via chat) plus any extra fields. Creates the role, the associated company, a Google Drive folder, and enqueues background extraction/analysis tasks. Returns the created role row.",
    {
      companyName: z.string(),
      jobTitle: z.string(),
      jobUrl: z.string().url().optional(),
      jobPostingPdfUrl: z.string().optional(),
      scrapedMarkdown: z.string().optional(),
      scrapedHtml: z.string().optional(),
      salaryMin: z.number().optional(),
      salaryMax: z.number().optional(),
      salaryCurrency: z.string().optional(),
      roleInstructions: z.string().optional(),
      responsibilities: z.array(z.string()).optional(),
      requiredQualifications: z.array(z.string()).optional(),
      preferredQualifications: z.array(z.string()).optional(),
      requiredSkills: z.array(z.string()).optional(),
      preferredSkills: z.array(z.string()).optional(),
      location: z.string().optional(),
      workplaceType: z.enum(["remote", "hybrid", "onsite"]).optional(),
      rtoPolicy: z.string().optional(),
      yearsExperienceMin: z.number().optional(),
      yearsExperienceMax: z.number().optional(),
      educationRequirements: z.array(z.string()).optional(),
      department: z.string().optional(),
      reportingTo: z.string().optional(),
      travelRequirements: z.string().optional(),
      securityClearance: z.string().optional(),
      visaSponsorship: z.string().optional(),
      benefits: z.array(z.string()).optional(),
      additionalNotes: z.string().optional(),
      aboutCompany: z.string().optional(),
      aboutRoleNarrative: z.string().optional(),
      otherContent: z.string().optional(),
      companyLogoUrl: z.string().url().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
      source: z.enum(["manual", "greenhouse_scan", "email"]).optional(),
      roleBullets: z
        .array(z.object({ type: z.string(), content: z.string().min(1) }))
        .optional(),
    },
    async (body) => {
      const result = await internalFetchJson(env, "/api/intake/confirm", {
        method: "POST",
        body,
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "batch_role_intake",
    "Scrape and persist multiple URLs in one call. Returns `{ succeeded: Role[], failed: { jobUrl, errorMessage }[] }`. Slower than submit_role_url + confirm_role_intake (sequential per URL) but no per-URL confirmation step.",
    {
      jobs: z.array(
        z.object({
          jobUrl: z.string().url(),
          companyName: z.string().optional(),
          jobTitle: z.string().optional(),
          salaryMin: z.number().optional(),
          salaryMax: z.number().optional(),
          salaryCurrency: z.string().optional(),
          roleInstructions: z.string().optional(),
          metadata: z.record(z.string(), z.unknown()).optional(),
        }),
      ),
    },
    async ({ jobs }) => {
      const result = await internalFetchJson(env, "/api/intake/batch", {
        method: "POST",
        body: { jobs },
      });
      return toolText(result);
    },
  );

  // ── Lifecycle: list / get / create / update / delete ──────────────────
  agent.server.tool(
    "list_roles",
    "List roles. Filter by status, search by company/title (q), or sort by companyName | jobTitle | status | createdAt.",
    {
      status: z.string().optional(),
      q: z.string().optional(),
      sort: z.enum(["companyName", "jobTitle", "status", "createdAt"]).optional(),
    },
    async (query) => {
      const result = await internalFetchJson(env, "/api/roles", { query });
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_role",
    "Get a single role by ID with all extracted fields.",
    { id: z.string() },
    async ({ id }) => {
      const result = await internalFetchJson(env, `/api/roles/${encodeURIComponent(id)}`);
      return toolText(result);
    },
  );

  agent.server.tool(
    "create_role_manual",
    "Manually create a role row (no scrape). Use when the user wants to enter a role's fields directly rather than via URL submission.",
    {
      companyName: z.string(),
      jobTitle: z.string(),
      jobUrl: z.string().url().optional(),
      salaryMin: z.number().optional(),
      salaryMax: z.number().optional(),
      salaryCurrency: z.string().optional(),
      roleInstructions: z.string().optional(),
      status: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    },
    async (body) => {
      const result = await internalFetchJson(env, "/api/roles", {
        method: "POST",
        body,
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "update_role",
    "Partial-update a role's fields. Use this when the user wants to correct something the scrape got wrong (e.g. wrong salary range, missing benefit, fixed company name).",
    {
      id: z.string(),
      patch: z.record(z.string(), z.unknown()),
    },
    async ({ id, patch }) => {
      const result = await internalFetchJson(env, `/api/roles/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: patch,
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "delete_role",
    "Delete a role.",
    { id: z.string() },
    async ({ id }) => {
      const result = await internalFetchJson(env, `/api/roles/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      return toolText(result);
    },
  );

  // ── Reprocess / generate / drive ──────────────────────────────────────
  agent.server.tool(
    "reprocess_role",
    "Retry failed orchestrator tasks for a role, or retry a specific taskId.",
    { id: z.string(), taskId: z.string().optional() },
    async ({ id, taskId }) => {
      const result = await internalFetchJson(env, `/api/roles/${encodeURIComponent(id)}/reprocess`, {
        method: "POST",
        body: taskId ? { taskId } : {},
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "generate_role_asset",
    "Enqueue resume or cover_letter generation for a role.",
    {
      id: z.string(),
      type: z.enum(["resume", "cover_letter"]),
    },
    async ({ id, type }) => {
      const result = await internalFetchJson(env, `/api/roles/${encodeURIComponent(id)}/generate`, {
        method: "POST",
        body: { type },
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "create_role_drive_folder",
    "Create a Google Drive folder for a role (idempotent — returns the existing folderId if already created).",
    { id: z.string() },
    async ({ id }) => {
      const result = await internalFetchJson(env, `/api/roles/${encodeURIComponent(id)}/drive`, {
        method: "POST",
      });
      return toolText(result);
    },
  );

  // ── Processing status, status log, logs, transitions ─────────────────
  agent.server.tool(
    "get_role_processing_status",
    "Query the OrchestratorAgent Durable Object for the live processing state of a role's tasks (running, error, completed).",
    { id: z.string() },
    async ({ id }) => {
      const result = await internalFetchJson(
        env,
        `/api/roles/${encodeURIComponent(id)}/processing-status`,
      );
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_role_status_log",
    "Audit ledger of every status transition for this role, including who triggered it and any notes.",
    { id: z.string() },
    async ({ id }) => {
      const result = await internalFetchJson(env, `/api/roles/${encodeURIComponent(id)}/status-log`);
      return toolText(result);
    },
  );

  agent.server.tool(
    "transition_role_status",
    "Atomically transition a role to a new status, with optional notes and trigger metadata. Use when the user reports 'I just applied to X' or 'I got an offer from X'.",
    {
      id: z.string(),
      newStatus: z.string(),
      notes: z.string().optional(),
      trigger: z.string().optional(),
    },
    async ({ id, ...body }) => {
      const result = await internalFetchJson(
        env,
        `/api/roles/${encodeURIComponent(id)}/status-transition`,
        { method: "POST", body },
      );
      return toolText(result);
    },
  );

  agent.server.tool(
    "list_role_statuses",
    "List all active role status definitions (id, name, group, sortOrder, requiresNotesPrompt).",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/roles/statuses");
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_role_logs",
    "Paginated activity logs for a role (category, action, message, metadata, timestamp).",
    {
      id: z.string(),
      limit: z.number().int().min(1).max(500).optional(),
      offset: z.number().int().min(0).optional(),
    },
    async ({ id, limit, offset }) => {
      const result = await internalFetchJson(env, `/api/roles/${encodeURIComponent(id)}/logs`, {
        query: { limit, offset },
      });
      return toolText(result);
    },
  );

  // ── Analysis report (the key "present an analysis report" capability) ─
  agent.server.tool(
    "get_role_analysis",
    "Get the most recent role-analysis report (alignment scoring, gap analysis, recommended emphasis) so you can present it to the user in chat. Markdown content lives inside the response payload.",
    { id: z.string() },
    async ({ id }) => {
      const result = await internalFetchJson(env, `/api/roles/${encodeURIComponent(id)}/analysis`);
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_role_analysis_history",
    "List historical analysis reports for this role (newest first).",
    { id: z.string() },
    async ({ id }) => {
      const result = await internalFetchJson(
        env,
        `/api/roles/${encodeURIComponent(id)}/analysis/history`,
      );
      return toolText(result);
    },
  );

  agent.server.tool(
    "request_role_analysis",
    "Kick off a new role-analysis run.",
    { id: z.string() },
    async ({ id }) => {
      const result = await internalFetchJson(env, `/api/roles/${encodeURIComponent(id)}/analysis`, {
        method: "POST",
      });
      return toolText(result);
    },
  );
}
