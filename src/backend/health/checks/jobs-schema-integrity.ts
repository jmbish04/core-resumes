/**
 * @fileoverview Health check: Jobs schema integrity.
 *
 * Validates that all 19 Greenhouse-domain tables exist in D1 with the
 * correct column counts, and that critical foreign key relationships
 * are intact. This catches schema drift from failed migrations.
 *
 * Sub-checks:
 * 1. All expected tables exist in sqlite_master
 * 2. Each table has the expected column count
 * 3. board_tokens has at least one active row (pipeline readiness)
 * 4. Foreign key PRAGMA check on job_snapshots → jobs_postings
 */

import type { HealthStepResult } from "@/backend/health/types";

// ---------------------------------------------------------------------------
// Expected schema shape
// ---------------------------------------------------------------------------

/**
 * Map of table name → expected minimum column count.
 * This doesn't enforce exact counts (to allow non-breaking additions)
 * but catches missing tables or catastrophically broken migrations.
 */
const EXPECTED_TABLES: Record<string, number> = {
  board_tokens: 6,
  board_template_analyses: 5,
  jobs_postings: 9,
  job_snapshots: 28,
  job_req_snapshots: 4,
  job_skill_snapshots: 4,
  job_responsibility_snapshots: 4,
  job_notebook_consultations: 7,
  ai_log_workers_ai: 11,
  job_categories: 4,
  job_category_mappings: 3,
  job_category_hitl_feedback: 4,
  job_tags: 4,
  job_tag_mappings: 3,
  job_tag_hitl_feedback: 4,
  hitl_reviews: 7,
  session_runs: 10,
  job_saved_lists: 4,
  job_saved_list_items: 5,
};

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

export async function checkJobsSchemaIntegrity(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const details: Record<string, unknown> = {};
  const issues: string[] = [];
  const warnings: string[] = [];

  try {
    // Sub-check 1: Table existence
    const tablesResult = await env.DB.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
    ).all<{ name: string }>();

    const existingTables = new Set((tablesResult.results ?? []).map((r) => r.name));
    const missingTables: string[] = [];
    const presentTables: string[] = [];

    for (const tableName of Object.keys(EXPECTED_TABLES)) {
      if (existingTables.has(tableName)) {
        presentTables.push(tableName);
      } else {
        missingTables.push(tableName);
      }
    }

    details.expectedTables = Object.keys(EXPECTED_TABLES).length;
    details.presentTables = presentTables.length;
    details.missingTables = missingTables.length > 0 ? missingTables : undefined;

    if (missingTables.length > 0) {
      issues.push(`Missing tables: ${missingTables.join(", ")}`);
    }

    // Sub-check 2: Column counts (only for present tables)
    const columnIssues: string[] = [];
    for (const tableName of presentTables) {
      try {
        const columnsResult = await env.DB.prepare(`PRAGMA table_info("${tableName}")`).all<{
          name: string;
        }>();

        const actualCount = columnsResult.results?.length ?? 0;
        const expectedMin = EXPECTED_TABLES[tableName];

        if (actualCount < expectedMin) {
          columnIssues.push(`${tableName}: ${actualCount} columns (expected ≥${expectedMin})`);
        }
      } catch {
        columnIssues.push(`${tableName}: PRAGMA table_info failed`);
      }
    }

    if (columnIssues.length > 0) {
      details.columnIssues = columnIssues;
      issues.push(`Column count issues: ${columnIssues.join("; ")}`);
    }

    // Sub-check 3: Pipeline readiness — active board_tokens
    if (existingTables.has("board_tokens")) {
      try {
        const activeTokens = await env.DB.prepare(
          `SELECT COUNT(*) as cnt FROM board_tokens WHERE is_active = 1`,
        ).first<{ cnt: number }>();

        details.activeBoardTokens = activeTokens?.cnt ?? 0;

        if ((activeTokens?.cnt ?? 0) === 0) {
          warnings.push("No active board_tokens — pipeline will have nothing to scan");
        }
      } catch {
        warnings.push("Could not query board_tokens table");
      }
    }

    // Sub-check 4: FK integrity spot-check
    if (existingTables.has("job_snapshots") && existingTables.has("jobs_postings")) {
      try {
        const orphans = await env.DB.prepare(
          `SELECT COUNT(*) as cnt FROM job_snapshots js
           LEFT JOIN jobs_postings jp ON js.job_id = jp.id
           WHERE jp.id IS NULL`,
        ).first<{ cnt: number }>();

        details.orphanedSnapshots = orphans?.cnt ?? 0;

        if ((orphans?.cnt ?? 0) > 0) {
          warnings.push(`${orphans!.cnt} orphaned job_snapshots rows (missing parent)`);
        }
      } catch {
        // FK check is best-effort
      }
    }

    // Compute status
    const status = issues.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "ok";

    return {
      status,
      latencyMs: Date.now() - start,
      error:
        issues.length > 0
          ? issues.join("; ")
          : warnings.length > 0
            ? warnings.join("; ")
            : undefined,
      details,
    };
  } catch (e) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
      details,
    };
  }
}
