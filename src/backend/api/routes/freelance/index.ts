/**
 * @fileoverview API routes for the freelance pipeline.
 *
 * Mounts at `/api/freelance` and provides endpoints for:
 * - Opportunity discovery and filtering
 * - Manual scan triggers
 * - AI triage and overrides
 * - Proposal generation and management
 * - Profile configuration
 * - Dashboard stats
 */

import { Hono } from "hono";
import { z } from "zod";

import { FreelanceService } from "@/backend/services/jobs/freelance/freelance-service";

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const freelanceRoutes = new Hono<{ Bindings: Env }>();

// =========================================================================
// Opportunities
// =========================================================================

/**
 * GET /api/freelance/opportunities
 * List opportunities with optional filters.
 */
freelanceRoutes.get("/opportunities", async (c) => {
  const service = new FreelanceService(c.env);

  const platform = c.req.query("platform") as "upwork" | "freelancer" | undefined;
  const isActive = c.req.query("is_active");
  const budgetType = c.req.query("budget_type") as "fixed" | "hourly" | undefined;
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const opportunities = await service.getOpportunities({
    platform,
    isActive: isActive !== undefined ? isActive === "true" : undefined,
    budgetType,
    limit,
    offset,
  });

  return c.json({ data: opportunities, count: opportunities.length });
});

/**
 * GET /api/freelance/opportunities/:id
 * Single opportunity detail with triage and proposals.
 */
freelanceRoutes.get("/opportunities/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const service = new FreelanceService(c.env);

  const opportunity = await service.getOpportunity(id);
  if (!opportunity) return c.json({ error: "Not found" }, 404);

  const triage = await service.getTriageForOpportunity(id);
  const proposals = await service.getProposals({ opportunityId: id });

  return c.json({ data: { ...opportunity, triage, proposals } });
});

/**
 * POST /api/freelance/opportunities/:id/promote
 * Promote a freelance opportunity into the roles table.
 */
freelanceRoutes.post("/opportunities/:id/promote", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const service = new FreelanceService(c.env);

  try {
    const role = await service.promoteToRole(id);
    return c.json({ data: role }, 201);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// =========================================================================
// Scanning
// =========================================================================

/**
 * POST /api/freelance/scan
 * Trigger a manual scan for a specific platform.
 */
freelanceRoutes.post("/scan", async (c) => {
  const body = await c.req.json<{
    platform: "upwork" | "freelancer" | "both";
    query?: string;
    skills?: string;
    filters?: Record<string, unknown>;
  }>();

  try {
    const { getAgentByName } = await import("agents");
    const agent = await getAgentByName(c.env.FREELANCE_SCANNER_AGENT as any, "global");

    let sessionIds: string[];
    if (body.platform === "upwork") {
      const sid = await (agent as any).scanUpwork(body.query, body.skills, body.filters);
      sessionIds = [sid];
    } else if (body.platform === "freelancer") {
      const sid = await (agent as any).scanFreelancer(body.query, body.skills, body.filters);
      sessionIds = [sid];
    } else {
      sessionIds = await (agent as any).scanAll();
    }

    return c.json({ data: { sessionIds } }, 202);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/**
 * POST /api/freelance/scan-all
 * Trigger all saved search profiles across both platforms.
 */
freelanceRoutes.post("/scan-all", async (c) => {
  try {
    const { getAgentByName } = await import("agents");
    const agent = await getAgentByName(c.env.FREELANCE_SCANNER_AGENT as any, "global");
    const sessionIds = await (agent as any).scanAll();
    return c.json({ data: { sessionIds } }, 202);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/**
 * GET /api/freelance/scan-runs
 * Scan run history.
 */
freelanceRoutes.get("/scan-runs", async (c) => {
  const service = new FreelanceService(c.env);
  const limit = parseInt(c.req.query("limit") ?? "20", 10);
  const runs = await service.getScanHistory(limit);
  return c.json({ data: runs });
});

// =========================================================================
// Triage
// =========================================================================

/**
 * POST /api/freelance/triage
 * Trigger batch AI triage for pending opportunities.
 */
freelanceRoutes.post("/triage", async (c) => {
  try {
    const { getAgentByName } = await import("agents");
    const agent = await getAgentByName(c.env.FREELANCE_SCANNER_AGENT as any, "global");
    await (agent as any).triagePending();
    return c.json({ data: { status: "triage_started" } }, 202);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/**
 * GET /api/freelance/opportunities/:id/triage
 * Get triage result for a specific opportunity.
 */
freelanceRoutes.get("/opportunities/:id/triage", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const service = new FreelanceService(c.env);
  const triage = await service.getTriageForOpportunity(id);
  if (!triage) return c.json({ error: "No triage found" }, 404);
  return c.json({ data: triage });
});

/**
 * PATCH /api/freelance/opportunities/:id/triage
 * Override a triage decision manually.
 */
freelanceRoutes.patch("/opportunities/:id/triage", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json<{
    decision: "bid" | "skip" | "pending" | "manual_review";
    rationale: string;
  }>();

  const service = new FreelanceService(c.env);
  await service.overrideTriage(id, body.decision, body.rationale);
  return c.json({ data: { status: "overridden" } });
});

// =========================================================================
// Proposals
// =========================================================================

/**
 * POST /api/freelance/opportunities/:id/proposal
 * Generate an AI proposal draft for an opportunity.
 */
freelanceRoutes.post("/opportunities/:id/proposal", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const service = new FreelanceService(c.env);

  const opportunity = await service.getOpportunity(id);
  if (!opportunity) return c.json({ error: "Opportunity not found" }, 404);

  const triage = await service.getTriageForOpportunity(id);
  const profile = await service.getProfile();

  try {
    const { draftFreelanceProposal } = await import(
      "@/backend/ai/tasks/draft/freelance-proposal"
    );
    const result = await draftFreelanceProposal(c.env, opportunity, triage, profile);

    // Persist the proposal
    const proposal = await service.createProposal({
      opportunityId: id,
      bidAmount: result.bidAmount,
      bidCurrency: result.bidCurrency,
      coverLetter: result.coverLetter,
      coverLetterVersion: 1,
      keySellingPoints: result.keySellingPoints,
      estimatedTimeline: result.estimatedTimeline,
      status: "draft",
      generationTier: result.generationTier,
      aiModel: c.env.MODEL_DRAFT,
      generationContext: result.generationContext,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return c.json({ data: proposal }, 201);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/**
 * GET /api/freelance/proposals
 * List all proposals with optional filters.
 */
freelanceRoutes.get("/proposals", async (c) => {
  const service = new FreelanceService(c.env);
  const status = c.req.query("status");
  const limit = parseInt(c.req.query("limit") ?? "50", 10);
  const offset = parseInt(c.req.query("offset") ?? "0", 10);

  const proposals = await service.getProposals({ status, limit, offset });
  return c.json({ data: proposals, count: proposals.length });
});

/**
 * GET /api/freelance/proposals/:id
 * Single proposal detail.
 */
freelanceRoutes.get("/proposals/:id", async (c) => {
  const id = c.req.param("id");
  const service = new FreelanceService(c.env);
  const proposal = await service.getProposal(id);
  if (!proposal) return c.json({ error: "Not found" }, 404);
  return c.json({ data: proposal });
});

/**
 * PATCH /api/freelance/proposals/:id
 * Update a proposal (edit text, change status).
 */
freelanceRoutes.patch("/proposals/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const service = new FreelanceService(c.env);

  try {
    const proposal = await service.updateProposal(id, body);
    return c.json({ data: proposal });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// =========================================================================
// Analysis
// =========================================================================

/**
 * POST /api/freelance/opportunities/:id/analyze
 * Deep opportunity analysis (client quality, competition, win probability).
 */
freelanceRoutes.post("/opportunities/:id/analyze", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const service = new FreelanceService(c.env);

  const opportunity = await service.getOpportunity(id);
  if (!opportunity) return c.json({ error: "Opportunity not found" }, 404);

  const profile = await service.getProfile();

  try {
    const { analyzeFreelanceOpportunity } = await import(
      "@/backend/ai/tasks/analyze/freelance-opportunity"
    );
    const analysis = await analyzeFreelanceOpportunity(c.env, opportunity, profile);
    return c.json({ data: analysis });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// =========================================================================
// Profile & Config
// =========================================================================

/**
 * GET /api/freelance/profile
 * Get the full freelance profile configuration.
 */
freelanceRoutes.get("/profile", async (c) => {
  const service = new FreelanceService(c.env);
  const profile = await service.getProfile();
  return c.json({ data: profile });
});

/**
 * PUT /api/freelance/profile/:key
 * Update a single profile config key.
 */
freelanceRoutes.put("/profile/:key", async (c) => {
  const key = c.req.param("key");
  const body = await c.req.json<{ value: unknown }>();
  const service = new FreelanceService(c.env);
  await service.updateProfile(key, body.value);
  return c.json({ data: { key, value: body.value } });
});

/**
 * GET /api/freelance/search-profiles
 * List saved search profiles from the FreelanceScannerAgent state.
 */
freelanceRoutes.get("/search-profiles", async (c) => {
  try {
    const { getAgentByName } = await import("agents");
    const agent = await getAgentByName(c.env.FREELANCE_SCANNER_AGENT as any, "global");
    const profiles = await (agent as any).getSearchProfiles();
    return c.json({ data: profiles });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/**
 * POST /api/freelance/search-profiles
 * Create a new saved search profile.
 */
freelanceRoutes.post("/search-profiles", async (c) => {
  const body = await c.req.json();
  try {
    const { getAgentByName } = await import("agents");
    const agent = await getAgentByName(c.env.FREELANCE_SCANNER_AGENT as any, "global");
    await (agent as any).addSearchProfile(body);
    return c.json({ data: { status: "created" } }, 201);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

/**
 * DELETE /api/freelance/search-profiles/:id
 * Delete a saved search profile.
 */
freelanceRoutes.delete("/search-profiles/:id", async (c) => {
  const id = c.req.param("id");
  try {
    const { getAgentByName } = await import("agents");
    const agent = await getAgentByName(c.env.FREELANCE_SCANNER_AGENT as any, "global");
    await (agent as any).removeSearchProfile(id);
    return c.json({ data: { status: "deleted" } });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// =========================================================================
// Dashboard Stats
// =========================================================================

/**
 * GET /api/freelance/stats
 * Aggregate dashboard statistics.
 */
freelanceRoutes.get("/stats", async (c) => {
  const service = new FreelanceService(c.env);
  const stats = await service.getStats();
  return c.json({ data: stats });
});

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export { freelanceRoutes };
