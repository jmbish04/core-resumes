import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { desc } from "drizzle-orm";
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
