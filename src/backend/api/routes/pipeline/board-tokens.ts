/**
 * @fileoverview Board token CRUD routes — manage which Greenhouse company
 * boards the pipeline scans.
 *
 * Endpoints: GET, POST, PUT, DELETE on /board-tokens.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { boardTokens } from "@/backend/db/schema";

import { boardTokenSchema, createTokenBody, updateTokenBody } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Serialize Date columns to ISO strings for JSON responses. */
function serializeDates(t: typeof boardTokens.$inferSelect) {
  return {
    ...t,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const boardTokensRouter = new OpenAPIHono<{ Bindings: Env }>();

/**
 * GET /board-tokens — List all board tokens with metadata.
 */
boardTokensRouter.openapi(
  createRoute({
    method: "get",
    path: "/board-tokens",
    operationId: "listBoardTokens",
    responses: {
      200: {
        description: "All board tokens",
        content: {
          "application/json": {
            schema: z.object({ tokens: z.array(boardTokenSchema) }),
          },
        },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const tokens = await db.select().from(boardTokens).orderBy(boardTokens.companyName);
    return c.json({ tokens: tokens.map(serializeDates) }, 200);
  },
);

/**
 * POST /board-tokens — Create a new board token.
 */
boardTokensRouter.openapi(
  createRoute({
    method: "post",
    path: "/board-tokens",
    operationId: "createBoardToken",
    request: {
      body: { content: { "application/json": { schema: createTokenBody } } },
    },
    responses: {
      201: {
        description: "Created board token",
        content: { "application/json": { schema: boardTokenSchema } },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const body = c.req.valid("json");
    const now = new Date();
    const [created] = await db
      .insert(boardTokens)
      .values({
        token: body.token,
        companyName: body.companyName ?? null,
        companyUrl: body.companyUrl ?? null,
        emailDomain: body.emailDomain ?? null,
        isActive: body.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return c.json(serializeDates(created), 201);
  },
);

/**
 * PUT /board-tokens/:id — Update a board token.
 */
boardTokensRouter.openapi(
  createRoute({
    method: "put",
    path: "/board-tokens/{id}",
    operationId: "updateBoardToken",
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { "application/json": { schema: updateTokenBody } } },
    },
    responses: {
      200: {
        description: "Updated board token",
        content: { "application/json": { schema: boardTokenSchema } },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const id = Number(c.req.param("id"));
    const body = c.req.valid("json");
    const [updated] = await db
      .update(boardTokens)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(boardTokens.id, id))
      .returning();

    return c.json(serializeDates(updated), 200);
  },
);

/**
 * DELETE /board-tokens/:id — Delete a board token.
 */
boardTokensRouter.openapi(
  createRoute({
    method: "delete",
    path: "/board-tokens/{id}",
    operationId: "deleteBoardToken",
    request: {
      params: z.object({ id: z.string() }),
    },
    responses: {
      200: {
        description: "Deleted",
        content: {
          "application/json": { schema: z.object({ ok: z.boolean() }) },
        },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const id = Number(c.req.param("id"));
    await db.delete(boardTokens).where(eq(boardTokens.id, id));
    return c.json({ ok: true }, 200);
  },
);
