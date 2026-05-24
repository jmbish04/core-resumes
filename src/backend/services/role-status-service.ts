/**
 * @fileoverview Centralized service for role status transitions.
 *
 * All status changes MUST go through this service to guarantee:
 * 1. Atomic D1 batch — roles.status update + role_status_log insert
 * 2. Consistent audit trail with trigger attribution
 * 3. Optional WebSocket broadcast via OrchestratorAgent
 */

import { desc, eq } from "drizzle-orm";

import type { RoleStatusLogRow, StatusRow } from "../db/schema";

import { getDb } from "../db";
import { roles, roleStatusLog, statuses } from "../db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StatusTrigger = "user" | "agent" | "email_inference" | "system";

export interface TransitionOptions {
  trigger: StatusTrigger;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class RoleStatusService {
  /**
   * Atomically transition a role's status and append to the audit ledger.
   *
   * Uses `db.batch()` to ensure the role update and log insert are applied
   * together. If either fails, neither is committed.
   */
  static async transition(
    env: Env,
    roleId: string,
    newStatus: string,
    opts: TransitionOptions,
  ): Promise<{ previousStatus: string | null }> {
    const db = getDb(env);

    // Fetch current role to get previous status
    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role) {
      throw new Error(`Role not found: ${roleId}`);
    }

    const previousStatus = role.status;

    // Skip if already in the target status
    if (previousStatus === newStatus) {
      return { previousStatus };
    }

    // Atomic batch: update role + insert log entry
    await db.batch([
      db
        .update(roles)
        .set({ status: newStatus as typeof role.status, updatedAt: new Date() })
        .where(eq(roles.id, roleId)),
      db.insert(roleStatusLog).values({
        roleId,
        previousStatus,
        newStatus,
        trigger: opts.trigger,
        notes: opts.notes ?? null,
        metadata: opts.metadata ?? null,
      }),
    ]);

    return { previousStatus };
  }

  /**
   * Get the full status transition log for a role, most recent first.
   */
  static async getLog(env: Env, roleId: string): Promise<RoleStatusLogRow[]> {
    const db = getDb(env);
    return db
      .select()
      .from(roleStatusLog)
      .where(eq(roleStatusLog.roleId, roleId))
      .orderBy(desc(roleStatusLog.createdAt));
  }

  /**
   * Get a single status definition by ID.
   */
  static async getStatusMeta(env: Env, statusId: string): Promise<StatusRow | null> {
    const db = getDb(env);
    const [row] = await db.select().from(statuses).where(eq(statuses.id, statusId)).limit(1);
    return row ?? null;
  }

  /**
   * Get all statuses visible to the frontend (is_active=true), ordered by sort_order.
   */
  static async getActiveStatuses(env: Env): Promise<StatusRow[]> {
    const db = getDb(env);
    return db
      .select()
      .from(statuses)
      .where(eq(statuses.isActive, true))
      .orderBy(statuses.sortOrder);
  }

  /**
   * Get all statuses including system-only ones.
   */
  static async getAllStatuses(env: Env): Promise<StatusRow[]> {
    const db = getDb(env);
    return db.select().from(statuses).orderBy(statuses.sortOrder);
  }
}
