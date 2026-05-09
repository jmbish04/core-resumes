/**
 * @fileoverview CRUD API routes for scoring rubrics.
 *
 * Scoring rubrics define the criteria bands used by AI to rate roles
 * across dimensions (location, compensation, combined). Each rubric
 * has a type, criteria description, and score range (min–max).
 *
 * Soft-delete is used (isActive flag) so historical rubrics can be retained.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq, and } from "drizzle-orm";

import { getDb } from "../../db";
import { scoringRubrics, selectScoringRubricSchema, SCORING_RUBRIC_TYPES } from "../../db/schema";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const rubricIdParam = z.object({ id: z.coerce.number().int() });

const createRubricBody = z.object({
  type: z.enum(SCORING_RUBRIC_TYPES),
  criteria: z.string().min(1),
  scoreRangeMin: z.number().int().min(0).max(100),
  scoreRangeMax: z.number().int().min(0).max(100),
  sortOrder: z.number().int().optional(),
});

const updateRubricBody = z.object({
  criteria: z.string().min(1).optional(),
  scoreRangeMin: z.number().int().min(0).max(100).optional(),
  scoreRangeMax: z.number().int().min(0).max(100).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const SEED_DATA: Array<{
  type: (typeof SCORING_RUBRIC_TYPES)[number];
  criteria: string;
  scoreRangeMin: number;
  scoreRangeMax: number;
  sortOrder: number;
}> = [
  // Location rubrics
  {
    type: "location",
    criteria: "Full remote / WFH",
    scoreRangeMin: 90,
    scoreRangeMax: 100,
    sortOrder: 0,
  },
  {
    type: "location",
    criteria: "Hybrid 2 days, short commute (<30 min) in SF",
    scoreRangeMin: 75,
    scoreRangeMax: 90,
    sortOrder: 1,
  },
  {
    type: "location",
    criteria: "Hybrid 3 days, short commute in SF",
    scoreRangeMin: 60,
    scoreRangeMax: 75,
    sortOrder: 2,
  },
  {
    type: "location",
    criteria: "Hybrid 2-3 days, medium commute (30-60 min)",
    scoreRangeMin: 50,
    scoreRangeMax: 65,
    sortOrder: 3,
  },
  {
    type: "location",
    criteria: "5 days/wk, short commute in SF",
    scoreRangeMin: 50,
    scoreRangeMax: 60,
    sortOrder: 4,
  },
  {
    type: "location",
    criteria: "Hybrid 2-3 days, long commute (>60 min)",
    scoreRangeMin: 30,
    scoreRangeMax: 50,
    sortOrder: 5,
  },
  {
    type: "location",
    criteria: "5 days/wk, long commute (Mountain View etc.)",
    scoreRangeMin: 10,
    scoreRangeMax: 30,
    sortOrder: 6,
  },

  // Compensation rubrics
  {
    type: "compensation",
    criteria: "Significantly exceeds Google TC (~$260K+) with comparable equity",
    scoreRangeMin: 85,
    scoreRangeMax: 100,
    sortOrder: 0,
  },
  {
    type: "compensation",
    criteria: "Matches or slightly exceeds Google TC ($240K–$260K)",
    scoreRangeMin: 65,
    scoreRangeMax: 85,
    sortOrder: 1,
  },
  {
    type: "compensation",
    criteria: "Slightly below Google TC ($200K–$240K) — negotiable to parity",
    scoreRangeMin: 45,
    scoreRangeMax: 65,
    sortOrder: 2,
  },
  {
    type: "compensation",
    criteria: "Materially below Google TC ($150K–$200K) — significant gap",
    scoreRangeMin: 25,
    scoreRangeMax: 45,
    sortOrder: 3,
  },
  {
    type: "compensation",
    criteria: "Well below Google TC (<$150K) — hard to justify",
    scoreRangeMin: 0,
    scoreRangeMax: 25,
    sortOrder: 4,
  },

  // Combined rubrics
  {
    type: "combined",
    criteria: "Top location + top compensation — ideal match",
    scoreRangeMin: 90,
    scoreRangeMax: 100,
    sortOrder: 0,
  },
  {
    type: "combined",
    criteria: "Strong in one dimension, acceptable in the other",
    scoreRangeMin: 65,
    scoreRangeMax: 90,
    sortOrder: 1,
  },
  {
    type: "combined",
    criteria: "Moderate in both — trade-offs exist but manageable",
    scoreRangeMin: 40,
    scoreRangeMax: 65,
    sortOrder: 2,
  },
  {
    type: "combined",
    criteria: "Weak in one dimension, moderate in other — needs careful evaluation",
    scoreRangeMin: 20,
    scoreRangeMax: 40,
    sortOrder: 3,
  },
  {
    type: "combined",
    criteria: "Weak in both — likely not worth pursuing",
    scoreRangeMin: 0,
    scoreRangeMax: 20,
    sortOrder: 4,
  },
];

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const scoringRubricsRouter = new OpenAPIHono<{ Bindings: Env }>();

// GET / — List all active rubrics (grouped by type in response)
scoringRubricsRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    operationId: "scoringRubricsList",
    request: {
      query: z.object({
        includeInactive: z.coerce.boolean().optional(),
      }),
    },
    responses: {
      200: {
        description: "List of scoring rubrics",
        content: { "application/json": { schema: z.array(selectScoringRubricSchema) } },
      },
    },
  }),
  async (c) => {
    const { includeInactive } = c.req.valid("query");
    const db = getDb(c.env);

    const rows = includeInactive
      ? await db.select().from(scoringRubrics)
      : await db.select().from(scoringRubrics).where(eq(scoringRubrics.isActive, true));

    return c.json(rows);
  },
);

// POST / — Create a new rubric
scoringRubricsRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    operationId: "scoringRubricsCreate",
    request: {
      body: { content: { "application/json": { schema: createRubricBody } } },
    },
    responses: {
      201: {
        description: "Created rubric",
        content: { "application/json": { schema: selectScoringRubricSchema } },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");

    const [created] = await getDb(c.env)
      .insert(scoringRubrics)
      .values({
        type: body.type,
        criteria: body.criteria,
        scoreRangeMin: body.scoreRangeMin,
        scoreRangeMax: body.scoreRangeMax,
        sortOrder: body.sortOrder ?? 0,
      })
      .returning();

    return c.json(created, 201);
  },
);

// PUT /:id — Update a rubric
scoringRubricsRouter.openapi(
  createRoute({
    method: "put",
    path: "/{id}",
    operationId: "scoringRubricsUpdate",
    request: {
      params: rubricIdParam,
      body: { content: { "application/json": { schema: updateRubricBody } } },
    },
    responses: {
      200: {
        description: "Updated rubric",
        content: { "application/json": { schema: selectScoringRubricSchema } },
      },
      404: { description: "Rubric not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");

    const [updated] = await getDb(c.env)
      .update(scoringRubrics)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(scoringRubrics.id, id))
      .returning();

    if (!updated) return c.json({ error: "Rubric not found" }, 404);
    return c.json(updated);
  },
);

// DELETE /:id — Soft-delete a rubric (set isActive = false)
scoringRubricsRouter.openapi(
  createRoute({
    method: "delete",
    path: "/{id}",
    operationId: "scoringRubricsDelete",
    request: { params: rubricIdParam },
    responses: {
      200: { description: "Rubric soft-deleted" },
      404: { description: "Rubric not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");

    const [updated] = await getDb(c.env)
      .update(scoringRubrics)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(scoringRubrics.id, id))
      .returning();

    if (!updated) return c.json({ error: "Rubric not found" }, 404);
    return c.json({ ok: true });
  },
);

// POST /seed — Seed default rubrics (idempotent — skips if any exist)
scoringRubricsRouter.openapi(
  createRoute({
    method: "post",
    path: "/seed",
    operationId: "scoringRubricsSeed",
    responses: {
      200: {
        description: "Seed result",
        content: {
          "application/json": {
            schema: z.object({
              seeded: z.boolean(),
              count: z.number(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);

    // Check if any rubrics already exist
    const existing = await db.select().from(scoringRubrics).limit(1);
    if (existing.length > 0) {
      const all = await db.select().from(scoringRubrics);
      return c.json({ seeded: false, count: all.length });
    }

    // Insert seed data
    await db.insert(scoringRubrics).values(SEED_DATA);

    return c.json({ seeded: true, count: SEED_DATA.length });
  },
);
