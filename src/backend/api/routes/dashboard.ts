import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { desc, eq } from "drizzle-orm";

import { getDb } from "../../db";
import { emails, roles } from "../../db/schema";

const summarySchema = z.object({
  total: z.number(),
  preparing: z.number(),
  applied: z.number(),
  interviewing: z.number(),
  offer: z.number(),
});
const chartRowSchema = z.object({ name: z.string(), value: z.number() });

export const dashboardRouter = new OpenAPIHono<{ Bindings: Env }>();

dashboardRouter.openapi(
  createRoute({
    method: "get",
    path: "/summary",
    operationId: "dashboardSummary",
    responses: {
      200: {
        description: "Dashboard summary",
        content: { "application/json": { schema: summarySchema } },
      },
    },
  }),
  async (c) => {
    const rows = await getDb(c.env).select().from(roles);

    return c.json({
      total: rows.length,
      preparing: rows.filter((role) => role.status === "preparing").length,
      applied: rows.filter((role) => role.status === "applied").length,
      interviewing: rows.filter((role) => role.status === "interviewing").length,
      offer: rows.filter((role) => role.status === "offer").length,
    });
  },
);

dashboardRouter.openapi(
  createRoute({
    method: "get",
    path: "/by-company",
    operationId: "dashboardByCompany",
    responses: {
      200: {
        description: "Roles by company",
        content: { "application/json": { schema: z.array(chartRowSchema) } },
      },
    },
  }),
  async (c) => {
    const counts = new Map<string, number>();

    for (const role of await getDb(c.env).select().from(roles)) {
      counts.set(role.companyName, (counts.get(role.companyName) ?? 0) + 1);
    }

    return c.json([...counts].map(([name, value]) => ({ name, value })));
  },
);

dashboardRouter.openapi(
  createRoute({
    method: "get",
    path: "/by-salary",
    operationId: "dashboardBySalary",
    responses: {
      200: {
        description: "Salary range data",
        content: {
          "application/json": {
            schema: z.array(
              z.object({
                name: z.string(),
                min: z.number().nullable(),
                max: z.number().nullable(),
              }),
            ),
          },
        },
      },
    },
  }),
  async (c) => {
    const rows = await getDb(c.env).select().from(roles);

    return c.json(
      rows.map((role) => ({
        name: `${role.companyName} - ${role.jobTitle}`,
        min: role.salaryMin,
        max: role.salaryMax,
      })),
    );
  },
);

dashboardRouter.openapi(
  createRoute({
    method: "get",
    path: "/preparing",
    operationId: "dashboardPreparing",
    responses: {
      200: {
        description: "Preparing roles",
        content: { "application/json": { schema: z.array(z.any()) } },
      },
    },
  }),
  async (c) => {
    const rows = await getDb(c.env).select().from(roles).where(eq(roles.status, "preparing"));

    return c.json(rows);
  },
);

dashboardRouter.openapi(
  createRoute({
    method: "get",
    path: "/pending-tasks",
    operationId: "dashboardPendingTasks",
    responses: {
      200: {
        description: "Pending tasks",
        content: { "application/json": { schema: z.array(z.any()) } },
      },
    },
  }),
  (c) => c.json([]),
);

dashboardRouter.openapi(
  createRoute({
    method: "get",
    path: "/recent-emails",
    operationId: "dashboardRecentEmails",
    responses: {
      200: {
        description: "Recent emails",
        content: { "application/json": { schema: z.array(z.any()) } },
      },
    },
  }),
  async (c) => {
    const rows = await getDb(c.env)
      .select()
      .from(emails)
      .orderBy(desc(emails.receivedAt))
      .limit(10);

    return c.json(rows);
  },
);
