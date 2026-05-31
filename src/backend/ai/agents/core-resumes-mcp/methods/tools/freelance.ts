/**
 * @fileoverview Freelance gig discovery & bidding MCP tools — Upwork +
 * Freelancer opportunities, AI triage, AI proposal drafting, deep
 * opportunity analysis, saved search profiles, and freelance profile config.
 */
import { z } from "zod";

import { internalFetchJson, toolText } from "../internal-fetch";

import type { CoreResumesMcpAgent } from "../../index";

export function registerFreelanceTools(agent: CoreResumesMcpAgent, env: Env) {
  // ── Opportunities ─────────────────────────────────────────────────────
  agent.server.tool(
    "list_freelance_opportunities",
    "List freelance opportunities with filters. Use this to surface gigs the user might want to bid on.",
    {
      platform: z.enum(["upwork", "freelancer"]).optional(),
      is_active: z.boolean().optional(),
      budget_type: z.enum(["fixed", "hourly"]).optional(),
      limit: z.number().int().min(1).max(200).optional(),
      offset: z.number().int().min(0).optional(),
    },
    async (query) => {
      const result = await internalFetchJson(env, "/api/freelance/opportunities", { query });
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_freelance_opportunity",
    "Get a single freelance opportunity with its triage decision and all generated proposals.",
    { id: z.number().int() },
    async ({ id }) => {
      const result = await internalFetchJson(env, `/api/freelance/opportunities/${id}`);
      return toolText(result);
    },
  );

  agent.server.tool(
    "promote_freelance_to_role",
    "Promote a freelance opportunity into the roles table (treat it as a real role to track).",
    { id: z.number().int() },
    async ({ id }) => {
      const result = await internalFetchJson(env, `/api/freelance/opportunities/${id}/promote`, {
        method: "POST",
      });
      return toolText(result);
    },
  );

  // ── Scanning ──────────────────────────────────────────────────────────
  agent.server.tool(
    "scan_freelance",
    "Trigger a manual scan on a platform. Pass platform='both' to scan everything. Optional query, skills, and platform-specific filters.",
    {
      platform: z.enum(["upwork", "freelancer", "both"]),
      query: z.string().optional(),
      skills: z.string().optional(),
      filters: z.record(z.string(), z.unknown()).optional(),
    },
    async (body) => {
      const result = await internalFetchJson(env, "/api/freelance/scan", {
        method: "POST",
        body,
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "scan_all_freelance",
    "Trigger all saved search profiles across both platforms.",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/freelance/scan-all", { method: "POST" });
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_freelance_scan_runs",
    "Historical freelance scan run summaries.",
    { limit: z.number().int().min(1).max(200).optional() },
    async ({ limit }) => {
      const result = await internalFetchJson(env, "/api/freelance/scan-runs", { query: { limit } });
      return toolText(result);
    },
  );

  // ── Triage ────────────────────────────────────────────────────────────
  agent.server.tool(
    "triage_pending_freelance",
    "Run AI triage on all pending freelance opportunities (background job).",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/freelance/triage", { method: "POST" });
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_freelance_triage",
    "Get the AI triage decision for one opportunity (bid / skip / pending / manual_review + rationale).",
    { id: z.number().int() },
    async ({ id }) => {
      const result = await internalFetchJson(env, `/api/freelance/opportunities/${id}/triage`);
      return toolText(result);
    },
  );

  agent.server.tool(
    "override_freelance_triage",
    "Manually override the AI triage decision for an opportunity. Use when the user disagrees with the AI's recommendation.",
    {
      id: z.number().int(),
      decision: z.enum(["bid", "skip", "pending", "manual_review"]),
      rationale: z.string(),
    },
    async ({ id, decision, rationale }) => {
      const result = await internalFetchJson(env, `/api/freelance/opportunities/${id}/triage`, {
        method: "PATCH",
        body: { decision, rationale },
      });
      return toolText(result);
    },
  );

  // ── Proposals (AI bid drafting) ───────────────────────────────────────
  agent.server.tool(
    "generate_freelance_proposal",
    "Generate an AI proposal draft for a freelance opportunity. Persists the proposal as 'draft' status. Use when the user says 'help me bid on this gig'.",
    { id: z.number().int() },
    async ({ id }) => {
      const result = await internalFetchJson(env, `/api/freelance/opportunities/${id}/proposal`, {
        method: "POST",
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "list_freelance_proposals",
    "List freelance proposals. Filter by status (draft, submitted, won, lost, etc.).",
    {
      status: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional(),
      offset: z.number().int().min(0).optional(),
    },
    async (query) => {
      const result = await internalFetchJson(env, "/api/freelance/proposals", { query });
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_freelance_proposal",
    "Get a single freelance proposal (cover letter, bid amount, selling points, timeline).",
    { id: z.string() },
    async ({ id }) => {
      const result = await internalFetchJson(env, `/api/freelance/proposals/${encodeURIComponent(id)}`);
      return toolText(result);
    },
  );

  agent.server.tool(
    "update_freelance_proposal",
    "Update a freelance proposal — change status (submitted/won/lost), edit cover letter, adjust bid amount.",
    {
      id: z.string(),
      patch: z.record(z.string(), z.unknown()),
    },
    async ({ id, patch }) => {
      const result = await internalFetchJson(env, `/api/freelance/proposals/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: patch,
      });
      return toolText(result);
    },
  );

  // ── Deep analysis ─────────────────────────────────────────────────────
  agent.server.tool(
    "analyze_freelance_opportunity",
    "Deep AI analysis of a freelance opportunity — client quality, competition, win probability, recommended angle.",
    { id: z.number().int() },
    async ({ id }) => {
      const result = await internalFetchJson(env, `/api/freelance/opportunities/${id}/analyze`, {
        method: "POST",
      });
      return toolText(result);
    },
  );

  // ── Profile & saved searches ──────────────────────────────────────────
  agent.server.tool(
    "get_freelance_profile",
    "Get the full freelance profile config (skills, hourly rate, experience level, etc.).",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/freelance/profile");
      return toolText(result);
    },
  );

  agent.server.tool(
    "update_freelance_profile",
    "Update a single freelance profile config key (e.g. hourly_min, skills, experience).",
    {
      key: z.string(),
      value: z.unknown(),
    },
    async ({ key, value }) => {
      const result = await internalFetchJson(env, `/api/freelance/profile/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: { value },
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "list_freelance_search_profiles",
    "List saved freelance search profiles (each profile = query + filters scanned on a schedule).",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/freelance/search-profiles");
      return toolText(result);
    },
  );

  agent.server.tool(
    "upsert_freelance_search_profile",
    "Create or update a saved freelance search profile.",
    {
      profile: z.record(z.string(), z.unknown()),
    },
    async ({ profile }) => {
      const result = await internalFetchJson(env, "/api/freelance/search-profiles", {
        method: "POST",
        body: profile,
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "delete_freelance_search_profile",
    "Delete a saved freelance search profile.",
    { id: z.string() },
    async ({ id }) => {
      const result = await internalFetchJson(env, `/api/freelance/search-profiles/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      return toolText(result);
    },
  );

  // ── Stats ─────────────────────────────────────────────────────────────
  agent.server.tool(
    "get_freelance_stats",
    "Aggregate freelance dashboard stats — pipeline counts, win rate, recent activity.",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/freelance/stats");
      return toolText(result);
    },
  );
}
