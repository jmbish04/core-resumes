/**
 * @fileoverview NotebookLM MCP tools — query the career knowledge base.
 */
import { z } from "zod";

import { internalFetchJson, toolText } from "../internal-fetch";

import type { CoreResumesMcpAgent } from "../../index";

export function registerNotebookTools(agent: CoreResumesMcpAgent, env: Env) {
  agent.server.tool(
    "notebook_query",
    "Query the NotebookLM career knowledge base. Returns the answer plus reference citations. Use this whenever the user asks about their own background, past projects, achievements, or anything stored in their career notebook.",
    { query: z.string() },
    async ({ query }) => {
      const result = await internalFetchJson(env, "/api/notebook/chat", {
        method: "POST",
        body: { query },
      });
      return toolText(result);
    },
  );
}
