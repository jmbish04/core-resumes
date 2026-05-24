/**
 * @fileoverview Centralized service for role activity logging.
 *
 * Provides a single entry point for persisting granular activity events
 * across the role lifecycle. Every significant action — agentic tasks,
 * email processing, document generation, user interactions — should be
 * logged through this service for frontend timeline display.
 */

import { desc, eq } from "drizzle-orm";

import type { RoleLogRow } from "../db/schema";

import { getDb } from "../db";
import { roleLogs } from "../db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogCategory =
  | "agentic"
  | "user_action"
  | "email"
  | "notebooklm"
  | "document"
  | "system";

export interface LogEntry {
  roleId?: string | null;
  category: LogCategory;
  action: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class RoleLogService {
  /**
   * Persist a single activity log entry to D1.
   * Returns the created log row.
   */
  static async log(env: Env, entry: LogEntry): Promise<RoleLogRow> {
    const db = getDb(env);
    const [row] = await db
      .insert(roleLogs)
      .values({
        id: crypto.randomUUID(),
        roleId: entry.roleId ?? null,
        category: entry.category,
        action: entry.action,
        message: entry.message,
        metadata: entry.metadata ?? null,
      })
      .returning();

    return row;
  }

  /**
   * Retrieve paginated logs for a specific role, most recent first.
   */
  static async getByRole(
    env: Env,
    roleId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<RoleLogRow[]> {
    const db = getDb(env);
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    return db
      .select()
      .from(roleLogs)
      .where(eq(roleLogs.roleId, roleId))
      .orderBy(desc(roleLogs.createdAt))
      .limit(limit)
      .offset(offset);
  }

  /**
   * Retrieve recent global logs (not scoped to any role).
   */
  static async getGlobal(env: Env, opts?: { limit?: number }): Promise<RoleLogRow[]> {
    const db = getDb(env);
    return db
      .select()
      .from(roleLogs)
      .orderBy(desc(roleLogs.createdAt))
      .limit(opts?.limit ?? 50);
  }
}
