import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getAgentByName } from "agents";

export const analyzeRoleRouter = new OpenAPIHono<{ Bindings: Env }>();

analyzeRoleRouter.openapi(
  createRoute({
    method: "post",
    path: "/salary/analyze-role",
    operationId: "analyzeRole",
    request: {
      body: { content: { "application/json": { schema: z.object({ roleId: z.string() }) } } },
    },
    responses: {
      200: { description: "Single-role analysis results", content: { "application/json": { schema: z.any() } } },
      500: { description: "Server Error" },
    },
  }),
  async (c) => {
    try {
      const { roleId } = c.req.valid("json");
      const agent = (await getAgentByName(c.env.SALARY_AGENT as any, "global")) as any;
      const result = await agent.analyzeRole(roleId);
      return c.json({ success: true, result }, 200);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }
);
