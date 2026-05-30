import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";

import { getDb } from "../../db";
import { globalConfig, selectGlobalConfigSchema } from "../../db/schema";

const configParam = z.object({ key: z.string() });
const configValueBody = z.object({ value: z.unknown() });
const configListSchema = z.array(selectGlobalConfigSchema);

const defaultConfig = [
  {
    key: "agent_rules",
    value: ["Use precise, truthful language and avoid exposing internal project names."],
  },
  {
    key: "resume_bullets",
    value: [],
  },
  {
    key: "template_ids",
    value: { resume: "", coverLetter: "", drivePrefix: "Career Orchestrator" },
  },
  {
    key: "career_stories",
    value: "",
  },
  {
    key: "compensation_baseline",
    value: "Previous role at Google: $176,000 base salary",
  },
  {
    key: "notebooklm_prompt",
    value:
      "Based on my 13 years of performance reviews, accomplishments, and career history, what specific evidence supports my qualification for the following {{label}}s?\n\n{{itemsList}}\n\nFor each item, cite specific examples, metrics, or achievements from my career history. If there is no direct evidence, note the gap honestly.",
  },
  {
    key: "notebooklm_prompt_podcast",
    value:
      'Create a podcast episode discussing the role "{{jobTitle}}" at {{companyName}}. Cover the key responsibilities, required qualifications, and how my career background aligns with this opportunity. Make it conversational, insightful, and highlight both strengths and areas to prepare for.{{instruction}}',
  },
  {
    key: "notebooklm_prompt_mind_map",
    value:
      'Create a mind map that organizes the key aspects of the role "{{jobTitle}}" at {{companyName}}. Include branches for: core responsibilities, required skills, preferred qualifications, compensation factors, company culture, and career growth potential.{{instruction}}',
  },
  {
    key: "notebooklm_prompt_report",
    value:
      'Create a detailed analysis report for the role "{{jobTitle}}" at {{companyName}}. Include sections on: role overview, qualification alignment, skill gap analysis, compensation benchmarking, company research, and strategic recommendations for positioning.{{instruction}}',
  },
  {
    key: "notebooklm_prompt_quiz",
    value:
      'Create an interview preparation quiz for the "{{jobTitle}}" role at {{companyName}}. Include technical questions, behavioral questions (STAR format), and situational questions. For each question, provide a model answer drawing from my career evidence.{{instruction}}',
  },
  {
    key: "notebooklm_prompt_flashcards",
    value:
      'Create study flashcards for preparing for the "{{jobTitle}}" role at {{companyName}}. Cover key technical concepts, company-specific knowledge, role requirements, and behavioral interview talking points with evidence from my career history.{{instruction}}',
  },
  {
    key: "notebooklm_prompt_infographic",
    value:
      'Create a visual infographic summarizing the "{{jobTitle}}" role at {{companyName}}. Highlight key metrics: salary range, required experience, top skills, company size, and my qualification match percentage.{{instruction}}',
  },
  {
    key: "notebooklm_prompt_slide_deck",
    value:
      'Create a presentation about the "{{jobTitle}}" role at {{companyName}}. Structure it as: 1) Role Overview, 2) Company Background, 3) My Qualification Alignment, 4) Key Strengths, 5) Areas to Address, 6) Interview Strategy, 7) Next Steps.{{instruction}}',
  },
  {
    key: "notebooklm_prompt_data_table",
    value:
      'Create a comparative data table analyzing the "{{jobTitle}}" role at {{companyName}}. Include columns for: requirement, my evidence, strength level (1-5), gap analysis, and preparation notes.{{instruction}}',
  },
  {
    key: "notebooklm_prompt_deep_research",
    value:
      'Research the company {{companyName}} and the role "{{jobTitle}}". Focus on: company culture, recent news and developments, hiring manager background, interview tips from employee reviews, competitive landscape, and any insider knowledge that would help with the application.{{instruction}}',
  },
  {
    key: "pipeline_a_rules",
    value: { keywords: ["software engineer", "frontend", "backend", "fullstack", "react", "node"] },
  },
  {
    key: "pipeline_b_rules",
    value: { minSalary: 120000, locations: ["Remote", "New York", "San Francisco"] },
  },
  {
    key: "applicant_profile",
    value: {
      location: "San Francisco Bay Area",
      locations: ["san francisco", "bay area", "sf", "oakland", "san jose", "california", "ca"],
      hubs: ["San Francisco", "New York", "Seattle", "Austin"],
      target_roles: ["software engineer", "frontend", "backend", "fullstack", "devops"]
    },
  },
  {
    key: "health_check_config",
    value: {
      greenhouse_tokens: ["anthropic", "cloudflare"],
      ashby_tokens: ["replicate", "lattice"]
    },
  },
];


export const configRouter = new OpenAPIHono<{ Bindings: Env }>();
export const adminRouter = new OpenAPIHono<{ Bindings: Env }>();

configRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    operationId: "configList",
    responses: {
      200: {
        description: "List config with isDefault flags",
        content: { "application/json": { schema: z.array(z.any()) } },
      },
    },
  }),
  async (c) => {
    const rows = await getDb(c.env).select().from(globalConfig);

    // Merge with defaults: if a key exists in DB, use the DB value; otherwise use default
    const merged = defaultConfig.map((def) => {
      const dbRow = rows.find((r) => r.key === def.key);
      const hasUserValue =
        dbRow != null &&
        dbRow.value !== null &&
        dbRow.value !== undefined &&
        (typeof dbRow.value !== "string" || dbRow.value.trim() !== "");

      return {
        key: def.key,
        value: hasUserValue ? dbRow!.value : def.value,
        updatedAt: dbRow?.updatedAt ?? null,
        isDefault: !hasUserValue,
      };
    });

    // Also include any DB rows not in defaultConfig
    for (const row of rows) {
      if (!defaultConfig.some((d) => d.key === row.key)) {
        merged.push({
          key: row.key,
          value: row.value,
          updatedAt: row.updatedAt,
          isDefault: false,
        });
      }
    }

    return c.json(merged);
  },
);

configRouter.openapi(
  createRoute({
    method: "get",
    path: "/{key}",
    operationId: "configGet",
    request: { params: configParam },
    responses: {
      200: {
        description: "Get config value",
        content: { "application/json": { schema: selectGlobalConfigSchema } },
      },
      404: { description: "Config value not found" },
    },
  }),
  async (c) => {
    const { key } = c.req.valid("param");
    const [row] = await getDb(c.env)
      .select()
      .from(globalConfig)
      .where(eq(globalConfig.key, key))
      .limit(1);

    if (row) {
      const hasUserValue =
        row.value !== null &&
        row.value !== undefined &&
        (typeof row.value !== "string" || row.value.trim() !== "");
      return c.json({ ...row, isDefault: !hasUserValue });
    }

    // Fall back to default if available
    const def = defaultConfig.find((d) => d.key === key);
    if (def) {
      return c.json({ key: def.key, value: def.value, updatedAt: null, isDefault: true });
    }

    return c.json({ error: "Config value not found" }, 404);
  },
);

configRouter.openapi(
  createRoute({
    method: "put",
    path: "/{key}",
    operationId: "configPut",
    request: {
      params: configParam,
      body: { content: { "application/json": { schema: configValueBody } } },
    },
    responses: {
      200: {
        description: "Updated config value",
        content: { "application/json": { schema: selectGlobalConfigSchema } },
      },
    },
  }),
  async (c) => {
    const { key } = c.req.valid("param");
    const { value } = c.req.valid("json");
    const row = await upsertConfig(c.env, key, value);

    return c.json(row);
  },
);

adminRouter.openapi(
  createRoute({
    method: "post",
    path: "/seed",
    operationId: "adminSeed",
    responses: {
      200: {
        description: "Seeded config",
        content: { "application/json": { schema: configListSchema } },
      },
    },
  }),
  async (c) => {
    const rows = [];

    for (const item of defaultConfig) {
      rows.push(await upsertConfig(c.env, item.key, item.value));
    }

    return c.json(rows);
  },
);

export async function upsertConfig(env: Env, key: string, value: unknown) {
  const db = getDb(env);
  const [existing] = await db.select().from(globalConfig).where(eq(globalConfig.key, key)).limit(1);

  if (existing) {
    const [updated] = await db
      .update(globalConfig)
      .set({ value, updatedAt: new Date() })
      .where(eq(globalConfig.key, key))
      .returning();

    return updated;
  }

  const [created] = await db.insert(globalConfig).values({ key, value }).returning();

  return created;
}
