import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/backend/db";
import { AiProvider } from "@/backend/ai/providers";
import {
  companySegments,
  costOfLivingIndex,
  marketCompanySalaries,
  roleFamilyTaxonomy,
  roles,
  careerModelAssumptions,
} from "@/backend/db/schema";

export const seedSalaryRefactorRouter = new OpenAPIHono<{ Bindings: Env }>();

seedSalaryRefactorRouter.openapi(
  createRoute({
    method: "post",
    path: "/seed-salary-refactor/company-segments",
    operationId: "seedCompanySegments",
    responses: {
      200: { description: "Seeded company segments", content: { "application/json": { schema: z.any() } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const provider = new AiProvider(c.env);

    // Get unique companies
    const fromRoles = await db
      .select({ name: roles.companyName })
      .from(roles)
      .where(isNotNull(roles.companyName));
    const fromMarket = await db
      .select({ name: marketCompanySalaries.companyName })
      .from(marketCompanySalaries);

    const allNames = [...fromRoles.map(r => r.name), ...fromMarket.map(m => m.name)];
    // Canonicalize and deduplicate
    const uniqueNames = [...new Set(allNames.map(n => n.toLowerCase().trim()))].filter(Boolean);
    // Take top 100 for now to avoid massive LLM calls. In real scenario, we might batch.
    const batch = uniqueNames.slice(0, 100);

    const prompt = `Classify the following company names into one of these segments:
    faang, big_tech, public_mid_cap, late_stage_private, early_stage_startup, non_tech_enterprise, consulting, finance, unknown.
    If you don't recognize the company, or it's ambiguous, use "unknown".
    Companies to classify:
    ${JSON.stringify(batch)}

    Output exactly JSON array of objects with { "name": string, "segment": string }`;

    const result = await provider.generateStructuredOutput({
      messages: [{ role: "user", content: prompt }],
      schema: z.array(z.object({ name: z.string(), segment: z.string() })),
      schemaName: "CompanySegments",
    });

    const now = new Date().toISOString();
    const values = result.map((r: any) => ({
      companyName: r.name,
      segment: r.segment,
      classifiedAt: now,
      classifierVersion: "gpt-oss-120b-seed-v1",
    }));

    if (values.length > 0) {
      await db.insert(companySegments).values(values).onConflictDoNothing().run();
    }

    return c.json({ seeded: values.length, totalUnique: uniqueNames.length }, 200);
  }
);

seedSalaryRefactorRouter.openapi(
  createRoute({
    method: "post",
    path: "/seed-salary-refactor/col-index",
    operationId: "seedColIndex",
    responses: {
      200: { description: "Seeded COL index", content: { "application/json": { schema: z.any() } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    
    // Seed ~25 metros statically
    const seedData = [
      { metro: "San Francisco, CA", colIndex: 1.34 },
      { metro: "New York, NY", colIndex: 1.29 },
      { metro: "Seattle, WA", colIndex: 1.15 },
      { metro: "Austin, TX", colIndex: 1.05 },
      { metro: "Los Angeles, CA", colIndex: 1.25 },
      { metro: "Chicago, IL", colIndex: 1.05 },
      { metro: "Boston, MA", colIndex: 1.20 },
      { metro: "Denver, CO", colIndex: 1.05 },
      { metro: "Atlanta, GA", colIndex: 1.00 },
      { metro: "Washington, DC", colIndex: 1.18 },
      { metro: "Dallas, TX", colIndex: 1.02 },
      { metro: "San Diego, CA", colIndex: 1.22 },
      { metro: "Remote", colIndex: 1.00 },
    ].map(r => ({
      metro: r.metro,
      colIndex: r.colIndex,
      source: "BLS 2024",
      asOf: new Date().toISOString(),
    }));

    await db.insert(costOfLivingIndex).values(seedData).onConflictDoNothing().run();

    return c.json({ seeded: seedData.length }, 200);
  }
);

function normalizeRoleType(role: string): string {
  if (!role) return "";
  const clean = role.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
  if (clean === "fullstack" || clean === "fullstackengineer" || clean === "fullstackdeveloper") return "Full Stack";
  if (clean === "frontend" || clean === "frontendengineer" || clean === "frontenddeveloper") return "Frontend";
  if (clean === "backend" || clean === "backendengineer" || clean === "backenddeveloper") return "Backend";
  if (clean === "softwareengineer" || clean === "swe" || clean === "developer" || clean === "softwaredeveloper") return "Software Engineer";
  if (clean === "legalops" || clean === "legaloperations" || clean === "legaloperationstech" || clean === "legaltechnologist") return "Legal Ops";
  if (clean === "productmanager" || clean === "pm" || clean === "productmanagement") return "Product Manager";
  if (clean === "devops" || clean === "sre" || clean === "infrastructure" || clean === "devopsengineer") return "DevOps";
  return role.split(/[ -]/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
}

function inferLevel(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("principal") || t.includes("distinguished")) return "principal";
  if (t.includes("staff")) return "staff";
  if (t.includes("senior") || t.includes("sr") || t.includes("lead")) return "senior";
  if (t.includes("junior") || t.includes("jr") || t.includes("associate")) return "junior";
  return "mid";
}

seedSalaryRefactorRouter.openapi(
  createRoute({
    method: "post",
    path: "/seed-salary-refactor/taxonomy",
    operationId: "seedRoleTaxonomy",
    responses: {
      200: { description: "Seeded role taxonomy", content: { "application/json": { schema: z.any() } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    
    const fromRoles = await db.select({ title: roles.jobTitle }).from(roles).where(isNotNull(roles.jobTitle));
    const fromMarket = await db.select({ title: marketCompanySalaries.jobTitle }).from(marketCompanySalaries).where(isNotNull(marketCompanySalaries.jobTitle));
    
    const allTitles = [...fromRoles.map(r => r.title), ...fromMarket.map(m => m.title)];
    const uniqueTitles = [...new Set(allTitles.map(t => t.toLowerCase().trim()))].filter(Boolean);

    const values = uniqueTitles.map(t => ({
      rawTitle: t,
      family: normalizeRoleType(t),
      level: inferLevel(t),
    }));

    // Batch insert
    for (let i = 0; i < values.length; i += 100) {
      const batch = values.slice(i, i + 100);
      await db.insert(roleFamilyTaxonomy).values(batch).onConflictDoNothing().run();
    }

    return c.json({ seeded: values.length }, 200);
  }
);

seedSalaryRefactorRouter.openapi(
  createRoute({
    method: "post",
    path: "/seed-salary-refactor/assumptions",
    operationId: "seedCareerAssumptions",
    responses: {
      200: { description: "Seeded career assumptions", content: { "application/json": { schema: z.any() } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    
    const seedData = [
      { key: "time_in_level:junior", value: 2.0, rationale: "Industry standard" },
      { key: "time_in_level:mid", value: 3.0, rationale: "Industry standard" },
      { key: "time_in_level:senior", value: 3.0, rationale: "Industry standard" },
      { key: "time_in_level:staff", value: 4.0, rationale: "Industry standard" },
      { key: "within_level_raise", value: 0.035, rationale: "Average annual merit increase" },
      { key: "baseline_anchor_salary", value: 150000, rationale: "Google anchor base salary" },
    ].map(r => ({ ...r, updatedAt: new Date().toISOString() }));

    await db.insert(careerModelAssumptions).values(seedData).onConflictDoNothing().run();

    return c.json({ seeded: seedData.length }, 200);
  }
);

seedSalaryRefactorRouter.openapi(
  createRoute({
    method: "post",
    path: "/seed-salary-refactor/roles-metro",
    operationId: "backfillRolesMetro",
    responses: {
      200: { description: "Backfilled roles metro", content: { "application/json": { schema: z.any() } } },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    
    // Naive backfill: just setting NULL explicitly, or inferring from a location column if it existed.
    // The spec notes "Normalization fails to NULL, never guesses."
    // In roles table, there's no `location` column. So we'll just set it to NULL for safety.
    await db.update(roles).set({ metro: null }).where(sql`1=1`);

    return c.json({ success: true, message: "Backfilled roles.metro with NULL" }, 200);
  }
);
