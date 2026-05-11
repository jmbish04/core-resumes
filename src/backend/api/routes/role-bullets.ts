/**
 * @fileoverview CRUD API routes for role_bullets — the user-curated job posting
 * bullet items persisted at intake and editable throughout the role lifecycle.
 *
 * Also exposes read access to the latest role_bullet_analyses scores so the
 * frontend can render colored score badges alongside each bullet.
 *
 * Routes:
 *  GET    /api/roles/:roleId/bullets              — list all bullets with latest scores
 *  POST   /api/roles/:roleId/bullets              — bulk create (intake confirm)
 *  POST   /api/roles/:roleId/bullets/single       — add one bullet
 *  PUT    /api/roles/:roleId/bullets/:bulletId     — update bullet content/type
 *  DELETE /api/roles/:roleId/bullets/:bulletId     — delete a bullet
 *  GET    /api/roles/:roleId/bullets/:bulletId/analyses — revision history for a bullet
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";

import type { AppBindings } from "..";

import { getDb } from "../../db";
import { roleBullets, roleBulletAnalyses, ROLE_BULLET_TYPES } from "../../db/schema";

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const roleBulletsRouter = new Hono<AppBindings>();

// ---------------------------------------------------------------------------
// GET /:roleId/bullets — list all bullets with latest analysis scores
// ---------------------------------------------------------------------------

roleBulletsRouter.get("/:roleId/bullets", async (c) => {
  const { roleId } = c.req.param();
  const db = getDb(c.env);

  // Fetch all bullets for this role
  const bullets = await db
    .select()
    .from(roleBullets)
    .where(eq(roleBullets.roleId, roleId))
    .orderBy(roleBullets.type, roleBullets.sortOrder);

  if (bullets.length === 0) {
    return c.json({ bullets: [], grouped: {} });
  }

  // Fetch the latest analysis for each bullet using a subquery for max revision
  const bulletIds = bullets.map((b) => b.id);
  const allAnalyses = await db
    .select()
    .from(roleBulletAnalyses)
    .where(
      sql`${roleBulletAnalyses.bulletId} IN (${sql.join(
        bulletIds.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    )
    .orderBy(desc(roleBulletAnalyses.revisionNumber));

  // Build a map of bulletId → latest analysis
  const latestByBullet = new Map<
    number,
    { aiScore: number; aiRationale: string; revisionNumber: number; previousAiScore: number | null }
  >();
  for (const a of allAnalyses) {
    if (!latestByBullet.has(a.bulletId)) {
      latestByBullet.set(a.bulletId, {
        aiScore: a.aiScore,
        aiRationale: a.aiRationale,
        revisionNumber: a.revisionNumber,
        previousAiScore: null,
      });
    } else {
      const latest = latestByBullet.get(a.bulletId)!;
      if (latest.previousAiScore === null && a.revisionNumber < latest.revisionNumber) {
        latest.previousAiScore = a.aiScore;
      }
    }
  }

  // Fetch bullet fidelity data from role metadata
  const { roles } = await import("../../db/schema");
  const [role] = await db.select({ metadata: roles.metadata }).from(roles).where(eq(roles.id, roleId)).limit(1);
  const meta = (role?.metadata ?? {}) as Record<string, unknown>;
  const fidelity = meta.bulletFidelity as {
    truncatedBullets?: Array<{ field: string; domBullet: string; aiBullet?: string; status: string }>;
    missingBullets?: Array<{ field: string; domBullet: string; status: string }>;
  } | undefined;

  // Build a set of bullet contents that were auto-corrected or dom-only
  const correctedContents = new Map<string, "auto_corrected" | "dom_only">();
  if (fidelity) {
    for (const t of fidelity.truncatedBullets ?? []) {
      // The corrected bullet (domBullet) is what's now stored as content
      correctedContents.set(t.domBullet, "auto_corrected");
    }
    for (const m of fidelity.missingBullets ?? []) {
      correctedContents.set(m.domBullet, "dom_only");
    }
  }

  // Merge bullets with their latest scores and fidelity status
  const enriched = bullets.map((b) => {
    const latest = latestByBullet.get(b.id);
    // Determine fidelity status by matching content against correction records
    let fidelityStatus: "verified" | "auto_corrected" | "dom_only" | null = null;
    if (correctedContents.has(b.content)) {
      fidelityStatus = correctedContents.get(b.content)!;
    } else if (fidelity) {
      // If fidelity data exists but this bullet wasn't flagged, it's verified
      fidelityStatus = "verified";
    }

    return {
      id: b.id,
      roleId: b.roleId,
      type: b.type,
      content: b.content,
      sortOrder: b.sortOrder,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      aiScore: latest?.aiScore ?? null,
      previousAiScore: latest?.previousAiScore ?? null,
      aiRationale: latest?.aiRationale ?? null,
      revisionNumber: latest?.revisionNumber ?? null,
      fidelityStatus,
    };
  });

  // Group by type for frontend section rendering
  const grouped: Record<string, typeof enriched> = {};
  for (const bullet of enriched) {
    (grouped[bullet.type] ??= []).push(bullet);
  }

  return c.json({ bullets: enriched, grouped });
});

// ---------------------------------------------------------------------------
// POST /:roleId/bullets — bulk create (used during intake confirm)
// ---------------------------------------------------------------------------

roleBulletsRouter.post("/:roleId/bullets", async (c) => {
  const { roleId } = c.req.param();
  const body = await c.req.json<{
    bullets: { type: string; content: string }[];
  }>();

  if (!body.bullets || !Array.isArray(body.bullets) || body.bullets.length === 0) {
    return c.json({ error: "bullets array is required" }, 400);
  }

  const db = getDb(c.env);

  // Assign sort_order per type group
  const typeCounters: Record<string, number> = {};
  const rows = body.bullets
    .filter((b) => b.content?.trim() && ROLE_BULLET_TYPES.includes(b.type as any))
    .map((b) => {
      typeCounters[b.type] = (typeCounters[b.type] ?? 0) + 1;
      return {
        roleId,
        type: b.type as (typeof ROLE_BULLET_TYPES)[number],
        content: b.content.trim(),
        sortOrder: typeCounters[b.type] - 1,
      };
    });

  if (rows.length === 0) {
    return c.json({ error: "No valid bullets to insert" }, 400);
  }

  const inserted = await db.insert(roleBullets).values(rows).returning();
  return c.json({ inserted: inserted.length, bullets: inserted }, 201);
});

// ---------------------------------------------------------------------------
// POST /:roleId/bullets/single — add one bullet
// ---------------------------------------------------------------------------

roleBulletsRouter.post("/:roleId/bullets/single", async (c) => {
  const { roleId } = c.req.param();
  const body = await c.req.json<{ type: string; content: string }>();

  if (!body.content?.trim()) {
    return c.json({ error: "content is required" }, 400);
  }
  if (!ROLE_BULLET_TYPES.includes(body.type as any)) {
    return c.json({ error: `Invalid bullet type: ${body.type}` }, 400);
  }

  const db = getDb(c.env);

  // Determine next sort_order for this type
  const existing = await db
    .select({ sortOrder: roleBullets.sortOrder })
    .from(roleBullets)
    .where(and(eq(roleBullets.roleId, roleId), eq(roleBullets.type, body.type as any)))
    .orderBy(desc(roleBullets.sortOrder))
    .limit(1);

  const nextOrder = existing.length > 0 ? existing[0].sortOrder + 1 : 0;

  const [created] = await db
    .insert(roleBullets)
    .values({
      roleId,
      type: body.type as (typeof ROLE_BULLET_TYPES)[number],
      content: body.content.trim(),
      sortOrder: nextOrder,
    })
    .returning();

  return c.json(created, 201);
});

// ---------------------------------------------------------------------------
// PUT /:roleId/bullets/:bulletId — update bullet content or type
// ---------------------------------------------------------------------------

roleBulletsRouter.put("/:roleId/bullets/:bulletId", async (c) => {
  const { roleId, bulletId } = c.req.param();
  const body = await c.req.json<{ content?: string; type?: string }>();
  const db = getDb(c.env);

  const [existing] = await db
    .select()
    .from(roleBullets)
    .where(and(eq(roleBullets.id, Number(bulletId)), eq(roleBullets.roleId, roleId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Bullet not found" }, 404);
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.content?.trim()) {
    patch.content = body.content.trim();
  }
  if (body.type && ROLE_BULLET_TYPES.includes(body.type as any)) {
    patch.type = body.type;
  }

  const [updated] = await db
    .update(roleBullets)
    .set(patch)
    .where(eq(roleBullets.id, Number(bulletId)))
    .returning();

  return c.json(updated);
});

// ---------------------------------------------------------------------------
// DELETE /:roleId/bullets/:bulletId — delete a bullet
// ---------------------------------------------------------------------------

roleBulletsRouter.delete("/:roleId/bullets/:bulletId", async (c) => {
  const { roleId, bulletId } = c.req.param();
  const db = getDb(c.env);

  const [existing] = await db
    .select()
    .from(roleBullets)
    .where(and(eq(roleBullets.id, Number(bulletId)), eq(roleBullets.roleId, roleId)))
    .limit(1);

  if (!existing) {
    return c.json({ error: "Bullet not found" }, 404);
  }

  await db.delete(roleBullets).where(eq(roleBullets.id, Number(bulletId)));
  return c.json({ deleted: true });
});

// ---------------------------------------------------------------------------
// GET /:roleId/bullets/:bulletId/analyses — revision history for a bullet
// ---------------------------------------------------------------------------

roleBulletsRouter.get("/:roleId/bullets/:bulletId/analyses", async (c) => {
  const { bulletId } = c.req.param();
  const db = getDb(c.env);

  const analyses = await db
    .select()
    .from(roleBulletAnalyses)
    .where(eq(roleBulletAnalyses.bulletId, Number(bulletId)))
    .orderBy(desc(roleBulletAnalyses.revisionNumber));

  return c.json({ analyses });
});
