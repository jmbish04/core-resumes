import { z } from "zod";

import { consultNotebook } from "@/ai/tools/notebooklm/notebooklm";

import type { NotebookLMMcpAgent } from "../index";

export async function initMcpServer(agent: NotebookLMMcpAgent, env: Env) {
  agent.server.tool(
    "consult",
    "Consult the NotebookLM knowledge base",
    { query: z.string() },
    async ({ query }) => {
      const result = await consultNotebook(env, query);
      return {
        content: [
          {
            type: "text" as const,
            text: typeof result === "string" ? result : JSON.stringify(result),
          },
        ],
      };
    },
  );
}
