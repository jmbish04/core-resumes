import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { getAgentByName } from "agents";

export const chatRouter = new OpenAPIHono<{ Bindings: Env }>();

chatRouter.openapi(
  createRoute({
    method: "post",
    path: "/salary/chat",
    operationId: "salaryChat",
    request: {
      body: { content: { "application/json": { schema: z.object({ messages: z.array(z.any()), context: z.any() }) } } },
    },
    responses: {
      200: { description: "Chat response", content: { "application/json": { schema: z.any() } } },
      500: { description: "Server Error" },
    },
  }),
  async (c) => {
    try {
      const { messages, context } = c.req.valid("json");
      const agent = (await getAgentByName(c.env.SALARY_AGENT as any, "global")) as any;
      const result = await agent.chat(messages, context);
      return c.json({ success: true, result }, 200);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  }
);
