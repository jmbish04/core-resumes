import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { desc, eq, and, or } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/backend/db";
import { jobsPostings } from "@/backend/db/schema";

export const jobsRouter = new OpenAPIHono<{ Bindings: Env }>();

// GET /jobs
jobsRouter.openapi(
  createRoute({
    method: "get",
    path: "/jobs",
    summary: "List jobs",
    description: "Get a list of scraped jobs from the database.",
    responses: {
      200: {
        description: "List of jobs",
        content: {
          "application/json": {
            schema: z.array(z.record(z.string(), z.unknown())),
          },
        },
      },
    },
  }),
  async (c) => {
    const results = await getDb(c.env)
      .select()
      .from(jobsPostings)
      .orderBy(desc(jobsPostings.dateFirstSeen))
      .limit(50);
    return c.json(results);
  },
);

// POST /jobs/scan
jobsRouter.openapi(
  createRoute({
    method: "post",
    path: "/jobs/scan",
    summary: "Trigger manual scan",
    description: "Triggers the JobScannerAgent to scan a specific board or all boards.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              token: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Scan triggered successfully",
        content: {
          "application/json": {
            schema: z.object({
              status: z.string(),
              sessionIds: z.array(z.string()),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { token } = c.req.valid("json");
    const { getAgentByName } = await import("agents");
    const agent = (await getAgentByName(c.env.JOB_SCANNER_AGENT as any, "global")) as any;

    let sessionIds: string[] = [];
    if (token) {
      const sessionId = await agent.scanBoard(token);
      sessionIds.push(String(sessionId));
    } else {
      sessionIds = await agent.scanAll();
    }

    return c.json({ status: "started", sessionIds });
  },
);

// GET /jobs/queued
jobsRouter.openapi(
  createRoute({
    method: "get",
    path: "/jobs/queued",
    summary: "List queued jobs for HITL review",
    description: "Returns un-rejected jobs. Watched jobs only appear if a change was detected.",
    request: {
      query: z.object({
        pipelineSource: z.enum(["github_dataset", "promoted_company", "freelance"]).optional(),
      }),
    },
    responses: {
      200: {
        description: "List of queued jobs",
        content: { "application/json": { schema: z.array(z.any()) } },
      },
    },
  }),
  async (c) => {
    const { pipelineSource } = c.req.valid("query");
    const db = getDb(c.env);

    const conditions = [];
    conditions.push(eq(jobsPostings.isRejected, false));
    
    // Logic for watched items: if watching, it must have a detected change to be in the queue
    conditions.push(
      or(
        eq(jobsPostings.isWatching, false),
        and(eq(jobsPostings.isWatching, true), eq(jobsPostings.isDetectedChange, true))
      )
    );

    if (pipelineSource) {
      conditions.push(eq(jobsPostings.pipelineSource, pipelineSource));
    }

    const results = await db
      .select()
      .from(jobsPostings)
      .where(and(...conditions))
      .orderBy(desc(jobsPostings.dateFirstSeen))
      .limit(200);

    return c.json(results);
  },
);

// POST /jobs/:id/reject
jobsRouter.openapi(
  createRoute({
    method: "post",
    path: "/jobs/{id}/reject",
    summary: "Reject a job",
    description: "Marks a job as rejected by the human reviewer.",
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { "application/json": { schema: z.object({ reason: z.string().optional() }) } } },
    },
    responses: {
      200: { description: "Job rejected", content: { "application/json": { schema: z.any() } } },
      404: { description: "Job not found" },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const id = parseInt(c.req.param("id"), 10);
    const { reason } = c.req.valid("json");

    if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

    const [updated] = await db
      .update(jobsPostings)
      .set({ isRejected: true, rejectReason: reason || null })
      .where(eq(jobsPostings.id, id))
      .returning();

    if (!updated) return c.json({ error: "Not found" }, 404);
    return c.json(updated);
  },
);

// POST /jobs/:id/watch
jobsRouter.openapi(
  createRoute({
    method: "post",
    path: "/jobs/{id}/watch",
    summary: "Watch a job",
    description: "Marks a job as watched by the human reviewer.",
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { description: "Job watched", content: { "application/json": { schema: z.any() } } },
      404: { description: "Job not found" },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const id = parseInt(c.req.param("id"), 10);

    if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

    const [updated] = await db
      .update(jobsPostings)
      .set({ isWatching: true, isDetectedChange: false })
      .where(eq(jobsPostings.id, id))
      .returning();

    if (!updated) return c.json({ error: "Not found" }, 404);
    return c.json(updated);
  },
);
