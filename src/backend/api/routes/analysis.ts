/**
 * @fileoverview Hireability analysis API routes — fetch, trigger, and
 * browse role analysis results stored in D1.
 *
 * Routes:
 *  GET  /api/roles/:roleId/analysis              — latest analysis + alignment scores
 *  GET  /api/roles/:roleId/analysis/history       — all analyses for a role (revision list)
 *  GET  /api/roles/:roleId/analysis/:analysisId   — specific analysis by ID
 *  POST /api/roles/:roleId/analysis               — trigger re-analysis
 *  GET  /api/roles/:roleId/analysis/alignment      — alignment scores grouped by type
 */

import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";

import type { AppBindings } from "..";

import { enqueueOrchestratorTask } from "../../ai/agents/orchestrator";
import { scoreATSAlignment, extractATSKeywords } from "../../ai/tasks/analyze/ats-score";
import { GoogleDocsClient } from "../../ai/tools/google/docs";
import { getDb } from "../../db";
import { mockInterviews, roleAlignmentScores, roleAnalyses, roleBullets, roles } from "../../db/schema";
import { CareerMemoryService } from "../../services/career-memory";

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const analysisRouter = new Hono<AppBindings>();

// ---------------------------------------------------------------------------
// Shared serializer — maps a role_analyses row to the API response shape
// ---------------------------------------------------------------------------

function serializeAnalysis(row: typeof roleAnalyses.$inferSelect) {
  return {
    id: row.id,
    roleId: row.roleId,
    version: row.version,
    hireScore: row.hireScore,
    hireRationale: row.hireRationale,
    compensationScore: row.compensationScore,
    compensationRationale: row.compensationRationale,
    theHook: row.theHook,
    strategicRecommendation: row.strategicRecommendation,
    counterPositioning: row.counterPositioning,
    configNotebooklmPrompt: row.configNotebooklmPrompt,
    configCompensationBaseline: row.configCompensationBaseline,
    configCareerStories: row.configCareerStories,
    usedDefaults: row.usedDefaults,
    analyzedAt: row.analyzedAt,
  };
}

/**
 * GET /:roleId/analysis — fetch the latest hireability analysis for a role.
 *
 * Returns the top-level scores (hire + compensation), config snapshot, and all alignment scores.
 * Returns 404 if no analysis has been performed yet.
 */
analysisRouter.get("/:roleId/analysis", async (c) => {
  const { roleId } = c.req.param();
  const db = getDb(c.env);

  const [analysis] = await db
    .select()
    .from(roleAnalyses)
    .where(eq(roleAnalyses.roleId, roleId))
    .orderBy(desc(roleAnalyses.analyzedAt))
    .limit(1);

  if (!analysis) {
    return c.json({ error: "No analysis found for this role" }, 404);
  }

  const alignmentScores = await db
    .select()
    .from(roleAlignmentScores)
    .where(eq(roleAlignmentScores.analysisId, analysis.id))
    .orderBy(desc(roleAlignmentScores.score));

  // Count total revisions for this role
  const allRevisions = await db
    .select({ id: roleAnalyses.id })
    .from(roleAnalyses)
    .where(eq(roleAnalyses.roleId, roleId));

  return c.json({
    analysis: serializeAnalysis(analysis),
    totalRevisions: allRevisions.length,
    alignmentScores: alignmentScores.map((s) => ({
      id: s.id,
      type: s.type,
      content: s.content,
      score: s.score,
      rationale: s.rationale,
    })),
  });
});

/**
 * GET /:roleId/analysis/history — all analyses for a role, ordered newest first.
 *
 * Returns summary data for each revision (no alignment scores — use /:analysisId for full data).
 */
analysisRouter.get("/:roleId/analysis/history", async (c) => {
  const { roleId } = c.req.param();
  const db = getDb(c.env);

  const analyses = await db
    .select()
    .from(roleAnalyses)
    .where(eq(roleAnalyses.roleId, roleId))
    .orderBy(desc(roleAnalyses.analyzedAt));

  return c.json({
    revisions: analyses.map(serializeAnalysis),
    total: analyses.length,
  });
});

// ---------------------------------------------------------------------------
// GET /:roleId/analysis/alignment — fetch alignment scores grouped by type.
// MUST be registered BEFORE /:analysisId to avoid Hono matching "alignment"
// as a dynamic analysisId parameter.
// ---------------------------------------------------------------------------

/**
 * GET /:roleId/analysis/alignment — fetch alignment scores grouped by type.
 *
 * Groups scores into overlap tiers:
 *  - strong: 75–100
 *  - moderate: 40–74
 *  - gap: 0–39
 */
analysisRouter.get("/:roleId/analysis/alignment", async (c) => {
  const { roleId } = c.req.param();
  const db = getDb(c.env);

  const [analysis] = await db
    .select({ id: roleAnalyses.id })
    .from(roleAnalyses)
    .where(eq(roleAnalyses.roleId, roleId))
    .orderBy(desc(roleAnalyses.analyzedAt))
    .limit(1);

  if (!analysis) {
    return c.json({ error: "No analysis found for this role" }, 404);
  }

  const scores = await db
    .select()
    .from(roleAlignmentScores)
    .where(eq(roleAlignmentScores.analysisId, analysis.id))
    .orderBy(desc(roleAlignmentScores.score));

  // Group by type
  const grouped: Record<string, typeof scores> = {};
  for (const score of scores) {
    (grouped[score.type] ??= []).push(score);
  }

  // Within each type, sub-group by overlap tier
  const tiered = Object.entries(grouped).map(([type, items]) => ({
    type,
    strong: items.filter((s) => s.score >= 75),
    moderate: items.filter((s) => s.score >= 40 && s.score < 75),
    gap: items.filter((s) => s.score < 40),
  }));

  return c.json({ analysisId: analysis.id, groups: tiered });
});

/**
 * GET /:roleId/analysis/:analysisId — fetch a specific analysis by ID.
 *
 * Returns full analysis data including alignment scores and config snapshots.
 */
analysisRouter.get("/:roleId/analysis/:analysisId", async (c) => {
  const { roleId, analysisId } = c.req.param();
  const db = getDb(c.env);

  const [analysis] = await db
    .select()
    .from(roleAnalyses)
    .where(eq(roleAnalyses.id, analysisId))
    .limit(1);

  if (!analysis || analysis.roleId !== roleId) {
    return c.json({ error: "Analysis not found" }, 404);
  }

  const alignmentScores = await db
    .select()
    .from(roleAlignmentScores)
    .where(eq(roleAlignmentScores.analysisId, analysis.id))
    .orderBy(desc(roleAlignmentScores.score));

  const allRevisions = await db
    .select({ id: roleAnalyses.id })
    .from(roleAnalyses)
    .where(eq(roleAnalyses.roleId, roleId));

  return c.json({
    analysis: serializeAnalysis(analysis),
    totalRevisions: allRevisions.length,
    alignmentScores: alignmentScores.map((s) => ({
      id: s.id,
      type: s.type,
      content: s.content,
      score: s.score,
      rationale: s.rationale,
    })),
  });
});

/**
 * POST /:roleId/analysis — trigger a new hireability analysis.
 *
 * Enqueues a `role_analysis` task on the OrchestratorAgent Durable Object.
 * The analysis runs asynchronously and results are stored in D1.
 */
analysisRouter.post("/:roleId/analysis", async (c) => {
  const { roleId } = c.req.param();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const task: { id: string } = (await enqueueOrchestratorTask(c.env, roleId, {
    type: "role_analysis",
    roleId,
  })) as any;

  return c.json({ status: "queued", taskId: task.id }, 202);
});

/**
 * POST /:roleId/analysis/clarify-and-reprocess — save clarifications and trigger a new hireability analysis.
 *
 * Saves clarifications to career_memory and enqueues a `role_analysis` task.
 */
analysisRouter.post("/:roleId/analysis/clarify-and-reprocess", async (c) => {
  const { roleId } = c.req.param();
  const body = await c.req.json<{
    clarifications: { bulletId: number; content: string; clarification: string }[];
  }>();

  if (!body.clarifications || !Array.isArray(body.clarifications)) {
    return c.json({ error: "clarifications array is required" }, 400);
  }

  const memoryService = new CareerMemoryService(c.env);

  // Save each clarification to career_memory
  for (const item of body.clarifications) {
    if (!item.clarification.trim()) continue;

    const query = `Regarding the role requirement: "${item.content}"`;
    const answer = `Candidate clarification: ${item.clarification.trim()}`;

    await memoryService.remember({
      query,
      answer,
      source: "user_input",
      agent: "manual",
      category: "career_fact",
      roleId,
      metadata: {
        bulletId: item.bulletId,
        type: "bullet_clarification",
      },
    });
  }

  // Enqueue a new role_analysis task to re-score
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const task: { id: string } = (await enqueueOrchestratorTask(c.env, roleId, {
    type: "role_analysis",
    roleId,
  })) as any;

  return c.json({ status: "queued", taskId: task.id }, 202);
});


// ---------------------------------------------------------------------------
// POST /:roleId/comments/respond — trigger automated comment responses
// ---------------------------------------------------------------------------

/**
 * POST /:roleId/comments/respond
 *
 * Enqueues a `resume_comment_response` task on the OrchestratorAgent.
 * The task processes all unresolved @colby / #colby tagged comments
 * on the specified Google Doc.
 *
 * Body: { gdocId: string }
 */
analysisRouter.post("/:roleId/comments/respond", async (c) => {
  const { roleId } = c.req.param();
  const body = await c.req.json<{ gdocId: string }>();

  if (!body.gdocId) {
    return c.json({ error: "Missing gdocId in request body" }, 400);
  }

  const task: { id: string } = (await enqueueOrchestratorTask(c.env, roleId, {
    type: "resume_comment_response",
    roleId,
    payload: { gdocId: body.gdocId },
  })) as any;

  return c.json({ status: "queued", taskId: task.id, roleId, gdocId: body.gdocId }, 202);
});

// ---------------------------------------------------------------------------
// Mock Interview routes
// ---------------------------------------------------------------------------

/**
 * GET /:roleId/interview — fetch the latest mock interview for a role.
 *
 * Returns the full Q&A pairs with coaching insights.
 * Returns 404 if no interview has been generated yet.
 */
analysisRouter.get("/:roleId/interview", async (c) => {
  const { roleId } = c.req.param();
  const db = getDb(c.env);

  const [interview] = await db
    .select()
    .from(mockInterviews)
    .where(eq(mockInterviews.roleId, roleId))
    .orderBy(desc(mockInterviews.generatedAt))
    .limit(1);

  if (!interview) {
    return c.json({ error: "No mock interview found for this role" }, 404);
  }

  // Count total revisions
  const allRevisions = await db
    .select({ id: mockInterviews.id })
    .from(mockInterviews)
    .where(eq(mockInterviews.roleId, roleId));

  return c.json({
    interview: {
      id: interview.id,
      roleId: interview.roleId,
      analysisId: interview.analysisId,
      version: interview.version,
      qaPairs: interview.qaPairs,
      generatedAt: interview.generatedAt,
    },
    totalRevisions: allRevisions.length,
  });
});

/**
 * POST /:roleId/interview — trigger a new mock interview generation.
 *
 * Enqueues a `mock_interview` task on the OrchestratorAgent Durable Object.
 * The generation runs asynchronously and results are stored in D1.
 */
analysisRouter.post("/:roleId/interview", async (c) => {
  const { roleId } = c.req.param();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const task: { id: string } = (await enqueueOrchestratorTask(c.env, roleId, {
    type: "mock_interview",
    roleId,
  })) as any;

  return c.json({ status: "queued", taskId: task.id }, 202);
});

// ---------------------------------------------------------------------------
// ATS Score routes
// ---------------------------------------------------------------------------

/**
 * POST /:roleId/ats-score — real-time ATS keyword extraction + scoring.
 *
 * Accepts a Google Doc ID, reads the live document text, loads the job
 * description from D1, and runs the lightweight ATS scoring task.
 *
 * Body: { gdocId: string }
 *
 * Returns: ATSScoreResult with matched/missing keywords, synonym
 * suggestions, overall match %, and per-category scores.
 */
analysisRouter.post("/:roleId/ats-score", async (c) => {
  const { roleId } = c.req.param();
  const body = await c.req.json<{ gdocId: string }>();

  if (!body.gdocId) {
    return c.json({ error: "Missing gdocId in request body" }, 400);
  }

  const db = getDb(c.env);

  // Load role to get the job description
  const [role] = await db
    .select()
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);

  if (!role) {
    return c.json({ error: "Role not found" }, 404);
  }

  const jobDescription = extractJobDescription(role);
  if (!jobDescription) {
    return c.json({ error: "No job description available for this role" }, 400);
  }

  // Read the live Google Doc content
  const docsClient = new GoogleDocsClient(c.env);
  let resumeText: string;
  try {
    resumeText = await docsClient.read(body.gdocId);
  } catch (error) {
    return c.json(
      { error: `Failed to read Google Doc: ${error instanceof Error ? error.message : String(error)}` },
      502,
    );
  }

  if (!resumeText.trim()) {
    return c.json({ error: "Google Doc is empty" }, 400);
  }

  // Run the ATS scoring task
  const result = await scoreATSAlignment(c.env, jobDescription, resumeText);

  return c.json({
    roleId,
    gdocId: body.gdocId,
    scoredAt: new Date().toISOString(),
    ...result,
  });
});

/**
 * POST /:roleId/ats-extract — extract ATS keywords from role's job description only.
 *
 * No resume comparison. Used for pre-populating ATS taxonomy before the
 * candidate has linked a resume document.
 */
analysisRouter.post("/:roleId/ats-extract", async (c) => {
  const { roleId } = c.req.param();
  const db = getDb(c.env);

  const [role] = await db
    .select()
    .from(roles)
    .where(eq(roles.id, roleId))
    .limit(1);

  if (!role) {
    return c.json({ error: "Role not found" }, 404);
  }

  const jobDescription = extractJobDescription(role);
  if (!jobDescription) {
    return c.json({ error: "No job description available for this role" }, 400);
  }

  const extraction = await extractATSKeywords(c.env, jobDescription);

  return c.json({
    roleId,
    extractedAt: new Date().toISOString(),
    ...extraction,
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract job description text from a role's metadata, aboutRoleNarrative,
 * or roleInstructions — mirrors the logic in `tasks/analyze/role.ts`.
 */
function extractJobDescription(role: typeof roles.$inferSelect): string | null {
  const meta = role.metadata;

  if (meta) {
    if (typeof meta.jobDescription === "string" && meta.jobDescription.length > 0) {
      return meta.jobDescription;
    }
    if (typeof meta.rawText === "string" && meta.rawText.length > 0) {
      return meta.rawText;
    }
    if (typeof meta.rawHtml === "string" && meta.rawHtml.length > 0) {
      return meta.rawHtml;
    }
  }

  // Try structured fields
  if (role.aboutRoleNarrative && role.aboutRoleNarrative.length > 100) {
    return role.aboutRoleNarrative;
  }

  // Fall back to roleInstructions if it contains a pasted posting
  if (role.roleInstructions && role.roleInstructions.length > 100) {
    return role.roleInstructions;
  }

  return null;
}
