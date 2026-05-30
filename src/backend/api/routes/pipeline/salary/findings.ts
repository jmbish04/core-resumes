import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getDb } from "../../../../db";
import { salaryFindings } from "../../../../db/schema";
import { eq } from "drizzle-orm";

export const findingsRouter = new OpenAPIHono<{ Bindings: Env }>();

findingsRouter.openapi(
  createRoute({
    method: "get",
    path: "/salary/findings/{roleId}",
    operationId: "getSalaryFindings",
    request: {
      params: z.object({ roleId: z.string() }),
    },
    responses: {
      200: { description: "Findings for a role", content: { "application/json": { schema: z.any() } } },
      500: { description: "Server Error" },
    },
  }),
  async (c) => {
    try {
      const { roleId } = c.req.valid("param");
      const db = getDb(c.env);
      const findings = await db.select().from(salaryFindings).where(eq(salaryFindings.roleId, roleId));
      return c.json({ success: true, findings }, 200);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }
);
