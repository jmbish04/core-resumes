import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, desc, eq, isNull } from "drizzle-orm";

import { getDb } from "../../db";
import { resumeBullets, selectResumeBulletSchema, type ResumeBullet } from "../../db/schema";

// ── Zod schemas for request/response ──────────────────────────────────────

const bulletIdParam = z.object({ id: z.coerce.number().int() });

const createBulletBody = z.object({
  content: z.string().min(1),
  category: z.enum(["Strategic", "Technical", "Impact", "Collaboration"]),
  impactMetric: z.string().optional(),
  tags: z.string().optional(),
  notes: z.string().optional(),
});

const updateBulletBody = createBulletBody;

const toggleBody = z.object({
  isActive: z.boolean(),
});

const structuredListSchema = z.object({
  active: z.array(selectResumeBulletSchema),
  inactive: z.array(selectResumeBulletSchema),
  revisions: z.array(
    z.object({
      bulletId: z.number(),
      activeContent: selectResumeBulletSchema,
      history: z.array(selectResumeBulletSchema),
    }),
  ),
});

// ── Router ────────────────────────────────────────────────────────────────

export const bulletsRouter = new OpenAPIHono<{ Bindings: Env }>();

// GET / — Structured list: { active, inactive, revisions }
bulletsRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    operationId: "bulletsList",
    responses: {
      200: {
        description: "Structured bullet list",
        content: { "application/json": { schema: structuredListSchema } },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const allBullets = await db.select().from(resumeBullets).orderBy(desc(resumeBullets.createdAt));

    const active: ResumeBullet[] = [];
    const inactive: ResumeBullet[] = [];
    const revisionsMap = new Map<
      number,
      { activeContent: ResumeBullet; history: ResumeBullet[] }
    >();

    for (const bullet of allBullets) {
      if (bullet.isActive) {
        active.push(bullet);
      } else if (bullet.replacedBy === null) {
        // Manually deactivated — not a revision
        inactive.push(bullet);
      }
      // Revisions (replacedBy !== null) are collected below
    }

    // Build revision chains: find bullets that have been replaced
    const replaced = allBullets.filter((b) => b.replacedBy !== null);

    for (const revision of replaced) {
      // Walk the chain to find the current active version
      let currentId = revision.replacedBy!;
      let current = allBullets.find((b) => b.id === currentId);

      // Follow the chain to the final active version
      while (current && current.replacedBy !== null) {
        currentId = current.replacedBy;
        current = allBullets.find((b) => b.id === currentId);
      }

      if (!current) continue;

      const entry = revisionsMap.get(current.id);
      if (entry) {
        entry.history.push(revision);
      } else {
        revisionsMap.set(current.id, {
          activeContent: current,
          history: [revision],
        });
      }
    }

    // Sort revision histories by timeRevised descending
    const revisions = Array.from(revisionsMap.entries()).map(
      ([bulletId, { activeContent, history }]) => ({
        bulletId,
        activeContent,
        history: history.sort((a, b) => {
          const aTime = a.timeRevised?.getTime() ?? 0;
          const bTime = b.timeRevised?.getTime() ?? 0;
          return bTime - aTime;
        }),
      }),
    );

    return c.json({ active, inactive, revisions });
  },
);

// GET /active — Agent-only endpoint: returns only isActive=true bullets
bulletsRouter.openapi(
  createRoute({
    method: "get",
    path: "/active",
    operationId: "bulletsActive",
    responses: {
      200: {
        description: "Active bullets for agent context",
        content: {
          "application/json": { schema: z.array(selectResumeBulletSchema) },
        },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);
    const bullets = await db
      .select()
      .from(resumeBullets)
      .where(eq(resumeBullets.isActive, true))
      .orderBy(resumeBullets.category);

    return c.json(bullets);
  },
);

// GET /:id — Single bullet
bulletsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}",
    operationId: "bulletsGet",
    request: { params: bulletIdParam },
    responses: {
      200: {
        description: "Single bullet",
        content: {
          "application/json": { schema: selectResumeBulletSchema },
        },
      },
      404: { description: "Bullet not found" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    const [bullet] = await db.select().from(resumeBullets).where(eq(resumeBullets.id, id)).limit(1);

    return bullet ? c.json(bullet) : c.json({ error: "Bullet not found" }, 404);
  },
);

// POST / — Create a new bullet
bulletsRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    operationId: "bulletsCreate",
    request: {
      body: { content: { "application/json": { schema: createBulletBody } } },
    },
    responses: {
      201: {
        description: "Created bullet",
        content: {
          "application/json": { schema: selectResumeBulletSchema },
        },
      },
    },
  }),
  (async (c: any) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);

    const [created] = await db
      .insert(resumeBullets)
      .values({
        content: body.content,
        category: body.category,
        impactMetric: body.impactMetric,
        tags: body.tags,
        notes: body.notes,
      })
      .returning();

    return c.json(created, 201);
  }) as any,
);

// PUT /:id — Edit a bullet (creates revision, deactivates old)
bulletsRouter.openapi(
  createRoute({
    method: "put",
    path: "/{id}",
    operationId: "bulletsUpdate",
    request: {
      params: bulletIdParam,
      body: { content: { "application/json": { schema: updateBulletBody } } },
    },
    responses: {
      200: {
        description: "Updated bullet (new version)",
        content: {
          "application/json": { schema: selectResumeBulletSchema },
        },
      },
      404: { description: "Bullet not found" },
    },
  }),
  (async (c: any) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = getDb(c.env);

    // Verify the old bullet exists
    const [existing] = await db
      .select()
      .from(resumeBullets)
      .where(eq(resumeBullets.id, id))
      .limit(1);

    if (!existing) {
      return c.json({ error: "Bullet not found" }, 404);
    }

    const now = new Date();

    // Create the new version
    const [newBullet] = await db
      .insert(resumeBullets)
      .values({
        content: body.content,
        category: body.category,
        impactMetric: body.impactMetric,
        tags: body.tags,
        notes: body.notes,
        // Inherit usage count from the original
        usageCount: existing.usageCount,
      })
      .returning();

    // Mark the old bullet as revised
    await db
      .update(resumeBullets)
      .set({
        isActive: false,
        replacedBy: newBullet.id,
        timeRevised: now,
        updatedAt: now,
      })
      .where(eq(resumeBullets.id, id));

    return c.json(newBullet);
  }) as any,
);

// PATCH /:id/toggle — Toggle isActive (soft-delete / undelete)
bulletsRouter.openapi(
  createRoute({
    method: "patch",
    path: "/{id}/toggle",
    operationId: "bulletsToggle",
    request: {
      params: bulletIdParam,
      body: { content: { "application/json": { schema: toggleBody } } },
    },
    responses: {
      200: {
        description: "Toggled bullet",
        content: {
          "application/json": { schema: selectResumeBulletSchema },
        },
      },
      404: { description: "Bullet not found" },
    },
  }),
  (async (c: any) => {
    const { id } = c.req.valid("param");
    const { isActive } = c.req.valid("json");
    const db = getDb(c.env);
    const now = new Date();

    const [updated] = await db
      .update(resumeBullets)
      .set({
        isActive,
        updatedAt: now,
        // Set or clear timeDeleted based on active state
        timeDeleted: isActive ? null : now,
      })
      .where(eq(resumeBullets.id, id))
      .returning();

    return updated ? c.json(updated) : c.json({ error: "Bullet not found" }, 404);
  }) as any,
);
