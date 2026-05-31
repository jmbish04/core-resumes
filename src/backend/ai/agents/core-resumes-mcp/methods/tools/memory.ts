/**
 * @fileoverview Career memory MCP tools — CRUD + semantic search via Vectorize.
 */
import { z } from "zod";

import { internalFetchJson, toolText } from "../internal-fetch";

import type { CoreResumesMcpAgent } from "../../index";

export function registerMemoryTools(agent: CoreResumesMcpAgent, env: Env) {
  agent.server.tool(
    "list_memories",
    "List career memories with filters.",
    {
      category: z.string().optional(),
      source: z.string().optional(),
      roleId: z.string().optional(),
      includeDeleted: z.boolean().optional(),
      limit: z.number().int().min(1).max(500).optional(),
      offset: z.number().int().min(0).optional(),
    },
    async ({ includeDeleted, ...rest }) => {
      const result = await internalFetchJson(env, "/api/memory", {
        query: {
          ...rest,
          ...(includeDeleted ? { includeDeleted: "true" } : {}),
        },
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "search_memories",
    "Semantic search across career memories via Vectorize. Returns the top-K most relevant entries with their similarity scores.",
    {
      q: z.string(),
      roleId: z.string().optional(),
      source: z.string().optional(),
      category: z.string().optional(),
      limit: z.number().int().min(1).max(50).optional(),
      includeDeleted: z.boolean().optional(),
    },
    async ({ includeDeleted, ...rest }) => {
      const result = await internalFetchJson(env, "/api/memory/search", {
        query: {
          ...rest,
          ...(includeDeleted ? { includeDeleted: "true" } : {}),
        },
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_memory_stats",
    "Memory counts grouped by category — useful for showing the user a summary of what's stored.",
    { includeDeleted: z.boolean().optional() },
    async ({ includeDeleted }) => {
      const result = await internalFetchJson(env, "/api/memory/stats", {
        query: includeDeleted ? { includeDeleted: "true" } : {},
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_memory",
    "Get a single memory (with revision chain if this entry has been revised).",
    { id: z.string() },
    async ({ id }) => {
      const result = await internalFetchJson(env, `/api/memory/${encodeURIComponent(id)}`);
      return toolText(result);
    },
  );

  agent.server.tool(
    "update_memory",
    "Update a memory. The route uses a soft-delete-then-revise model — the old row becomes inactive and a new revised row is created.",
    {
      id: z.string(),
      patch: z.record(z.string(), z.unknown()),
    },
    async ({ id, patch }) => {
      const result = await internalFetchJson(env, `/api/memory/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: patch,
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "delete_memory",
    "Soft-delete a memory (sets active=false).",
    { id: z.string() },
    async ({ id }) => {
      const result = await internalFetchJson(env, `/api/memory/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      return toolText(result);
    },
  );
}
