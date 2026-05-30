/**
 * @fileoverview Config MCP tools — list, get, set, and seed global config.
 *
 * Config keys cover hot-swappable behavior like NotebookLM prompts, agent
 * rules, resume bullets, applicant profile, pipeline rules, etc.
 */
import { z } from "zod";

import { internalFetchJson, toolText } from "../internal-fetch";

import type { CoreResumesMcpAgent } from "../../index";

export function registerConfigTools(agent: CoreResumesMcpAgent, env: Env) {
  agent.server.tool(
    "list_config",
    "List all config keys, each flagged with whether it's set in DB or a hardcoded default.",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/config");
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_config",
    "Get a single config value by key. Falls back to the hardcoded default if not set in DB.",
    { key: z.string() },
    async ({ key }) => {
      const result = await internalFetchJson(env, `/api/config/${encodeURIComponent(key)}`);
      return toolText(result);
    },
  );

  agent.server.tool(
    "set_config",
    "Upsert a config value. Most values are JSON-serializable (strings, arrays, objects).",
    {
      key: z.string(),
      value: z.unknown(),
    },
    async ({ key, value }) => {
      const result = await internalFetchJson(env, `/api/config/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: { value },
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "seed_default_config",
    "Seed all default config entries into D1 (idempotent — only inserts keys that don't exist).",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/admin/seed", { method: "POST" });
      return toolText(result);
    },
  );
}
