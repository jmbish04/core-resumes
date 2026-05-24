/**
 * @fileoverview Centralized career memory service — the shared interface for
 * all agents to store, recall, update, and soft-delete semantic memories.
 *
 * Every memory is persisted in BOTH:
 *   - D1 `career_memory` table (structured data, revision history)
 *   - Vectorize `career-memory` index (semantic search by embedding)
 *
 * The same UUID is used as both the D1 primary key and the Vectorize vector ID,
 * enabling consistent cross-referencing.
 *
 * Embedding model: @cf/baai/bge-large-en-v1.5 (1024 dimensions)
 */

import { and, count, desc, eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import { careerMemory, type CareerMemoryRow } from "../db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input for creating a new memory entry. */
export interface MemoryEntry {
  query: string;
  answer: string;
  source: "notebooklm" | "user_input" | "draft_review" | "comment_response";
  agent: "orchestrator" | "notebooklm" | "manual";
  category:
    | "career_fact"
    | "role_analysis"
    | "resume_draft"
    | "cover_letter"
    | "interview_prep"
    | "comment_feedback"
    | "general";
  roleId?: string;
  references?: unknown[];
  metadata?: Record<string, unknown>;
}

/** A hydrated memory result with D1 data. */
export type MemoryResult = CareerMemoryRow;

/** Options for the `recall` semantic search. */
export interface RecallOptions {
  limit?: number;
  roleId?: string;
  source?: string;
  category?: string;
  activeOnly?: boolean;
}

/** Options for listing memories with pagination. */
export interface ListOptions {
  roleId?: string;
  source?: string;
  category?: string;
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}

/** Category count for sidebar grouping. */
export interface CategoryCount {
  category: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CareerMemoryService {
  constructor(private env: Env) {}

  // ── Remember ────────────────────────────────────────────────────────────

  /**
   * Store a query/answer pair in both D1 and Vectorize.
   *
   * @returns The UUID of the new memory entry.
   */
  async remember(entry: MemoryEntry): Promise<string> {
    const id = crypto.randomUUID();
    const db = getDb(this.env);

    // Generate embedding from combined query + answer text
    const embeddingText = `${entry.query}\n\n${entry.answer}`.slice(0, 8000);
    const embedding = await this.generateEmbedding(embeddingText);

    // Insert into Vectorize
    await this.env.VECTORIZE_CAREER_MEMORY.insert([
      {
        id,
        values: embedding,
        metadata: {
          source: entry.source,
          category: entry.category,
          agent: entry.agent,
          roleId: entry.roleId ?? "",
        },
      },
    ]);

    // Insert into D1
    await db.insert(careerMemory).values({
      id,
      query: entry.query,
      answer: entry.answer,
      source: entry.source,
      agent: entry.agent,
      category: entry.category,
      roleId: entry.roleId ?? null,
      references: entry.references ?? null,
      metadata: entry.metadata ?? null,
      isActive: true,
    });

    return id;
  }

  // ── Recall (semantic search) ────────────────────────────────────────────

  /**
   * Search for relevant past interactions by semantic similarity.
   *
   * 1. Generates embedding for the query
   * 2. Searches Vectorize for top-N similar vectors
   * 3. Hydrates full records from D1
   */
  async recall(query: string, opts: RecallOptions = {}): Promise<MemoryResult[]> {
    const { limit = 10, activeOnly = true } = opts;

    const embedding = await this.generateEmbedding(query);

    // Build Vectorize filter metadata
    const filter: Record<string, string | number | boolean> = {};
    if (opts.source) filter.source = opts.source;
    if (opts.category) filter.category = opts.category;
    if (opts.roleId) filter.roleId = opts.roleId;

    const vectorResults = await this.env.VECTORIZE_CAREER_MEMORY.query(embedding, {
      topK: limit,
      returnMetadata: "all",
      filter: Object.keys(filter).length > 0 ? filter : undefined,
    });

    if (!vectorResults.matches || vectorResults.matches.length === 0) {
      return [];
    }

    // Hydrate from D1
    const ids = vectorResults.matches.map((m) => m.id);
    const db = getDb(this.env);

    const conditions = [
      sql`${careerMemory.id} IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})`,
    ];

    if (activeOnly) {
      conditions.push(eq(careerMemory.isActive, true));
    }

    const rows = await db
      .select()
      .from(careerMemory)
      .where(and(...conditions));

    // Sort by Vectorize score order
    const scoreMap = new Map(vectorResults.matches.map((m) => [m.id, m.score]));
    return rows.sort((a, b) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0));
  }

  // ── Get by ID ───────────────────────────────────────────────────────────

  /**
   * Get a specific memory by ID. Includes active and soft-deleted entries.
   */
  async get(id: string): Promise<MemoryResult | null> {
    const db = getDb(this.env);
    const [row] = await db.select().from(careerMemory).where(eq(careerMemory.id, id)).limit(1);

    return row ?? null;
  }

  // ── List ────────────────────────────────────────────────────────────────

  /**
   * List memories with optional filters and pagination.
   */
  async list(opts: ListOptions = {}): Promise<{ items: MemoryResult[]; total: number }> {
    const { limit = 50, offset = 0, activeOnly = true } = opts;
    const db = getDb(this.env);

    const conditions = this.buildFilterConditions(opts, activeOnly);

    const [items, [countRow]] = await Promise.all([
      db
        .select()
        .from(careerMemory)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(careerMemory.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(careerMemory)
        .where(conditions.length > 0 ? and(...conditions) : undefined),
    ]);

    return { items, total: countRow?.count ?? 0 };
  }

  // ── Stats ───────────────────────────────────────────────────────────────

  /**
   * Get memory counts grouped by category (for frontend sidebar).
   */
  async stats(activeOnly = true): Promise<CategoryCount[]> {
    const db = getDb(this.env);

    const conditions = activeOnly ? [eq(careerMemory.isActive, true)] : [];

    const rows = await db
      .select({
        category: careerMemory.category,
        count: count(),
      })
      .from(careerMemory)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(careerMemory.category);

    return rows.map((r) => ({
      category: r.category,
      count: r.count,
    }));
  }

  // ── Soft Delete ─────────────────────────────────────────────────────────

  /**
   * Soft-delete a memory: set is_active=0, deleted_at, and remove from Vectorize.
   */
  async softDelete(id: string): Promise<void> {
    const db = getDb(this.env);

    await db
      .update(careerMemory)
      .set({
        isActive: false,
        deletedAt: new Date().toISOString(),
      })
      .where(eq(careerMemory.id, id));

    // Hard-delete from Vectorize (no soft-delete support)
    try {
      await this.env.VECTORIZE_CAREER_MEMORY.deleteByIds([id]);
    } catch {
      // Vectorize delete is best-effort — entry may already be gone
    }
  }

  // ── Update (Revision) ──────────────────────────────────────────────────

  /**
   * Update a memory by creating a new revision:
   *   1. Soft-delete the old entry
   *   2. Create a new entry with the patched content
   *   3. Set `replaced_by_id` on the old entry → new entry
   *
   * @returns The UUID of the new (revised) memory entry.
   */
  async update(
    id: string,
    patch: {
      query?: string;
      answer?: string;
      category?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<string> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Career memory not found: ${id}`);
    }

    // Soft-delete old entry
    await this.softDelete(id);

    // Create new entry with merged content
    const newId = await this.remember({
      query: patch.query ?? existing.query,
      answer: patch.answer ?? existing.answer,
      source: existing.source as MemoryEntry["source"],
      agent: existing.agent as MemoryEntry["agent"],
      category: (patch.category ?? existing.category) as MemoryEntry["category"],
      roleId: existing.roleId ?? undefined,
      references: existing.references as unknown[] | undefined,
      metadata: {
        ...(existing.metadata as Record<string, unknown> | undefined),
        ...patch.metadata,
        revisedFrom: id,
      },
    });

    // Link old → new
    const db = getDb(this.env);
    await db.update(careerMemory).set({ replacedById: newId }).where(eq(careerMemory.id, id));

    return newId;
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * Generate a 1024-dimension embedding using bge-large-en-v1.5.
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const result = await this.env.AI.run(
      this.env.DEFAULT_MODEL_EMBEDDING as any,
      { text: [text.slice(0, 8000)] },
      { gateway: { id: this.env.AI_GATEWAY_ID } },
    );

    const data = (result as unknown as { data: number[][] }).data;
    if (!data || !data[0]) {
      throw new Error("Embedding generation returned empty result");
    }

    return data[0];
  }

  /**
   * Build Drizzle filter conditions from list/recall options.
   */
  private buildFilterConditions(
    opts: { roleId?: string; source?: string; category?: string },
    activeOnly: boolean,
  ) {
    const conditions = [];

    if (activeOnly) {
      conditions.push(eq(careerMemory.isActive, true));
    }

    if (opts.roleId) {
      conditions.push(eq(careerMemory.roleId, opts.roleId));
    }
    if (opts.source) {
      conditions.push(eq(careerMemory.source, opts.source as any));
    }
    if (opts.category) {
      conditions.push(eq(careerMemory.category, opts.category as any));
    }

    return conditions;
  }
}
