/**
 * @fileoverview Companies MCP tools — manage company configs, Greenhouse
 * tokens, brand colors, and view analytics.
 */
import { z } from "zod";

import { internalFetchJson, toolText } from "../internal-fetch";

import type { CoreResumesMcpAgent } from "../../index";

export function registerCompanyTools(agent: CoreResumesMcpAgent, env: Env) {
  agent.server.tool(
    "list_companies",
    "List all companies tracked in the system.",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/companies");
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_company",
    "Get a single company by id.",
    { id: z.string() },
    async ({ id }) => {
      const result = await internalFetchJson(env, `/api/companies/${encodeURIComponent(id)}`);
      return toolText(result);
    },
  );

  agent.server.tool(
    "create_company",
    "Create a company manually.",
    {
      name: z.string(),
      url: z.string().optional(),
      description: z.string().optional(),
      greenhouseToken: z.string().optional(),
      colorPrimary: z.string().optional(),
      colorAccent: z.string().optional(),
      attributes: z.record(z.string(), z.unknown()).optional(),
    },
    async (body) => {
      const result = await internalFetchJson(env, "/api/companies", {
        method: "POST",
        body,
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "update_company",
    "Update a company (PUT — replaces fields). Use for fixing Greenhouse token, brand colors, or attributes.",
    {
      id: z.string(),
      patch: z.record(z.string(), z.unknown()),
    },
    async ({ id, patch }) => {
      const result = await internalFetchJson(env, `/api/companies/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: patch,
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "patch_company",
    "Partial-update a company (PATCH).",
    {
      id: z.string(),
      patch: z.record(z.string(), z.unknown()),
    },
    async ({ id, patch }) => {
      const result = await internalFetchJson(env, `/api/companies/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: patch,
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "delete_company",
    "Delete a company.",
    { id: z.string() },
    async ({ id }) => {
      const result = await internalFetchJson(env, `/api/companies/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_company_analytics",
    "Company dashboard analytics: top-by-role-count, top-by-salary, status distribution, totals.",
    {},
    async () => {
      const result = await internalFetchJson(env, "/api/companies/analytics");
      return toolText(result);
    },
  );

  agent.server.tool(
    "extract_company_colors",
    "Extract a company's brand colors from its logo or website.",
    {
      url: z.string().url().optional(),
      imageUrl: z.string().url().optional(),
    },
    async (body) => {
      const result = await internalFetchJson(env, "/api/companies/extract-colors", {
        method: "POST",
        body,
      });
      return toolText(result);
    },
  );
}
