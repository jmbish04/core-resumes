/**
 * @fileoverview Career memory API routes — CRUD, semantic search, and stats
 * for the career memory system.
 *
 * Routes:
 *   GET    /api/memory         — List with filters (category, source, role, active, limit, offset)
 *   GET    /api/memory/stats   — Category counts for sidebar grouping
 *   GET    /api/memory/search  — Semantic search via Vectorize recall
 *   GET    /api/memory/:id     — Single memory with revision chain
 *   PATCH  /api/memory/:id     — Update (soft-delete old → create revised)
 *   DELETE /api/memory/:id     — Soft-delete
 */

import { Hono } from "hono";

import { CareerMemoryService } from "../../services/career-memory";

const memoryRouter = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /api/memory — List with filters
// ---------------------------------------------------------------------------

memoryRouter.get("/", async (c) => {
  const memory = new CareerMemoryService(c.env);
  const url = new URL(c.req.url);

  const result = await memory.list({
    category: url.searchParams.get("category") ?? undefined,
    source: url.searchParams.get("source") ?? undefined,
    roleId: url.searchParams.get("roleId") ?? undefined,
    activeOnly: url.searchParams.get("includeDeleted") !== "true",
    limit: parseInt(url.searchParams.get("limit") ?? "50", 10),
    offset: parseInt(url.searchParams.get("offset") ?? "0", 10),
  });

  return c.json(result);
});

// ---------------------------------------------------------------------------
// GET /api/memory/stats — Category counts
// ---------------------------------------------------------------------------

memoryRouter.get("/stats", async (c) => {
  const memory = new CareerMemoryService(c.env);
  const url = new URL(c.req.url);
  const activeOnly = url.searchParams.get("includeDeleted") !== "true";

  const stats = await memory.stats(activeOnly);
  return c.json(stats);
});

// ---------------------------------------------------------------------------
// GET /api/memory/search — Semantic search
// ---------------------------------------------------------------------------

memoryRouter.get("/search", async (c) => {
  const memory = new CareerMemoryService(c.env);
  const url = new URL(c.req.url);
  const query = url.searchParams.get("q");

  if (!query) {
    return c.json({ error: "Missing ?q= parameter" }, 400);
  }

  const results = await memory.recall(query, {
    limit: parseInt(url.searchParams.get("limit") ?? "10", 10),
    roleId: url.searchParams.get("roleId") ?? undefined,
    source: url.searchParams.get("source") ?? undefined,
    category: url.searchParams.get("category") ?? undefined,
    activeOnly: url.searchParams.get("includeDeleted") !== "true",
  });

  return c.json(results);
});

// ---------------------------------------------------------------------------
// GET /api/memory/:id — Single memory
// ---------------------------------------------------------------------------

memoryRouter.get("/:id", async (c) => {
  const memory = new CareerMemoryService(c.env);
  const id = c.req.param("id");

  const result = await memory.get(id);
  if (!result) {
    return c.json({ error: "Memory not found" }, 404);
  }

  // Fetch revision chain (if this memory was revised)
  let revisions: { id: string; createdAt: string; deletedAt: string | null }[] = [];
  if (result.replacedById) {
    const revised = await memory.get(result.replacedById);
    if (revised) {
      revisions.push({
        id: revised.id,
        createdAt: revised.createdAt,
        deletedAt: revised.deletedAt,
      });
    }
  }

  return c.json({ ...result, revisions });
});

// ---------------------------------------------------------------------------
// PATCH /api/memory/:id — Update (creates revision)
// ---------------------------------------------------------------------------

memoryRouter.patch("/:id", async (c) => {
  const memory = new CareerMemoryService(c.env);
  const id = c.req.param("id");

  const body = await c.req.json<{
    query?: string;
    answer?: string;
    category?: string;
    metadata?: Record<string, unknown>;
  }>();

  try {
    const newId = await memory.update(id, body);
    return c.json({ id: newId, previousId: id });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Update failed" }, 400);
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/memory/:id — Soft-delete
// ---------------------------------------------------------------------------

memoryRouter.delete("/:id", async (c) => {
  const memory = new CareerMemoryService(c.env);
  const id = c.req.param("id");

  try {
    await memory.softDelete(id);
    return c.json({ ok: true, id });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Delete failed" }, 400);
  }
});

export { memoryRouter };
