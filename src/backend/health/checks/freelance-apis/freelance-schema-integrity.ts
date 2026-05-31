/**
 * @fileoverview Health check: Freelance schema integrity.
 *
 * Validates that all 5 freelance-domain tables exist in D1 with the
 * correct column counts, and that critical foreign key relationships
 * and indices are intact.
 *
 * Sub-checks:
 * 1. All expected freelance tables exist in sqlite_master
 * 2. Each table has the expected column count
 * 3. Foreign key spot check on freelance_triage and freelance_proposals
 * 4. Critical indices presence check
 */

import type { HealthStepResult, CheckStatus } from "@/backend/health/types";

// ---------------------------------------------------------------------------
// Expected schema shape
// ---------------------------------------------------------------------------

/** Map of table name -> expected minimum column count. */
const EXPECTED_TABLES: Record<string, number> = {
  freelance_opportunities: 30,
  freelance_triage: 10,
  freelance_proposals: 10,
  freelance_scan_runs: 8,
  freelance_profile: 3,
};

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

export async function checkFreelanceSchemaIntegrity(env: Env): Promise<HealthStepResult> {
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
    if (missingTables.length > 0) {
      details.missingTables = missingTables;
      issues.push(`Missing freelance tables: ${missingTables.join(", ")}`);
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
      } catch (err) {
        columnIssues.push(`${tableName}: PRAGMA table_info failed (${String(err)})`);
      }
    }

    if (columnIssues.length > 0) {
      details.columnIssues = columnIssues;
      issues.push(`Column count mismatches: ${columnIssues.join("; ")}`);
    }

    // Sub-check 3: Relation integrity spot-check
    if (existingTables.has("freelance_triage") && existingTables.has("freelance_opportunities")) {
      try {
        const orphans = await env.DB.prepare(
          `SELECT COUNT(*) as cnt FROM freelance_triage ft
           LEFT JOIN freelance_opportunities fo ON ft.opportunity_id = fo.id
           WHERE fo.id IS NULL`,
        ).first<{ cnt: number }>();

        details.orphanedTriageRows = orphans?.cnt ?? 0;
        if ((orphans?.cnt ?? 0) > 0) {
          warnings.push(`${orphans!.cnt} orphaned freelance_triage rows (missing parent opportunity)`);
        }
      } catch (err) {
        warnings.push(`Failed to perform freelance_triage FK verification: ${String(err)}`);
      }
    }

    if (existingTables.has("freelance_proposals") && existingTables.has("freelance_opportunities")) {
      try {
        const orphans = await env.DB.prepare(
          `SELECT COUNT(*) as cnt FROM freelance_proposals fp
           LEFT JOIN freelance_opportunities fo ON fp.opportunity_id = fo.id
           WHERE fo.id IS NULL`,
        ).first<{ cnt: number }>();

        details.orphanedProposalRows = orphans?.cnt ?? 0;
        if ((orphans?.cnt ?? 0) > 0) {
          warnings.push(`${orphans!.cnt} orphaned freelance_proposals rows (missing parent opportunity)`);
        }
      } catch (err) {
        warnings.push(`Failed to perform freelance_proposals FK verification: ${String(err)}`);
      }
    }

    // Sub-check 4: Index presence check
    const INDEX_NAME = "freelance_opportunities_platform_active_idx";
    try {
      const idxResult = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='index' AND name = ?`,
      )
        .bind(INDEX_NAME)
        .first<{ cnt: number }>();

      const indexExists = (idxResult?.cnt ?? 0) > 0;
      details.criticalIndexExists = indexExists;

      if (!indexExists && existingTables.has("freelance_opportunities")) {
        warnings.push(`Index "${INDEX_NAME}" is missing on freelance_opportunities table`);
      }
    } catch (err) {
      warnings.push(`Failed index verification spot-check: ${String(err)}`);
    }

    // Compute final status
    const status: CheckStatus = issues.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "ok";

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
      status: "fail" as CheckStatus,
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
      details,
    };
  }
}
