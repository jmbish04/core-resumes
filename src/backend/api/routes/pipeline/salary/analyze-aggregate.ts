import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getAgentByName } from "agents";

export const analyzeAggregateRouter = new OpenAPIHono<{ Bindings: Env }>();

analyzeAggregateRouter.openapi(
  createRoute({
    method: "post",
    path: "/salary/analyze-aggregate",
    operationId: "analyzeAggregate",
    request: {
      body: { content: { "application/json": { schema: z.object({ input: z.any() }) } } },
    },
    responses: {
      200: { description: "Aggregate analysis results", content: { "application/json": { schema: z.any() } } },
      500: { description: "Server Error" },
    },
  }),
  async (c) => {
    try {
      const { input } = c.req.valid("json");
      const agent = (await getAgentByName(c.env.SALARY_AGENT as any, "global")) as any;
      const result = await agent.analyzeAggregate(input);
      return c.json({ success: true, result }, 200);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }
);
