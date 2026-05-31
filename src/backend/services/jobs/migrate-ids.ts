/**
 * @fileoverview One-time data migration: normalize existing `job_site_id` values.
 *
 * Strips pipeline prefixes (gh-{token}-, lv-{token}-, as-{token}-) from all
 * existing `job_site_id` values in `jobs_postings` so that cross-pipeline
 * deduplication works correctly.
 *
 * This is a manual migration — run via `POST /api/pipeline/rss/migrate-ids`.
 * It handles duplicates that surface after normalization by keeping the
 * most recently seen row and deleting the others.
 *
 * Safe to run multiple times (idempotent).
 */

import { getDb } from "@/backend/db";
import { jobsPostings } from "@/backend/db/schema";
import { sql } from "drizzle-orm";
import { normalizeJobSiteId } from "@/backend/services/jobs/normalize-id";

interface MigrationResult {
  totalRows: number;
  rowsNeedingUpdate: number;
  rowsUpdated: number;
  duplicatesResolved: number;
  errors: string[];
}

/**
 * Normalize all existing `job_site_id` values in `jobs_postings`.
 *
 * Strategy:
 * 1. Read all rows that have a pipeline prefix pattern
 * 2. Group by the normalized ID to detect duplicates
 * 3. For duplicate groups: keep the row with the highest `id` (most recent),
 *    delete the rest
 * 4. Update remaining rows with the normalized ID
 */
export async function migrateJobSiteIds(env: Env): Promise<MigrationResult> {
  const db = getDb(env);
  const errors: string[] = [];

  // Find all rows that have a known prefix pattern
  const allRows = await db
    .select({
      id: jobsPostings.id,
      jobSiteId: jobsPostings.jobSiteId,
    })
    .from(jobsPostings);

  const totalRows = allRows.length;

  // Identify rows that need normalization
  const rowsToUpdate: Array<{ id: number; oldId: string; newId: string }> = [];
  for (const row of allRows) {
    const normalized = normalizeJobSiteId(row.jobSiteId);
    if (normalized !== row.jobSiteId) {
      rowsToUpdate.push({ id: row.id, oldId: row.jobSiteId, newId: normalized });
    }
  }

  if (rowsToUpdate.length === 0) {
    return {
      totalRows,
      rowsNeedingUpdate: 0,
      rowsUpdated: 0,
      duplicatesResolved: 0,
      errors: [],
    };
  }

  // Group by normalized ID to detect conflicts
  const byNormalized = new Map<string, Array<{ id: number; oldId: string }>>();
  for (const row of rowsToUpdate) {
    const group = byNormalized.get(row.newId) ?? [];
    group.push({ id: row.id, oldId: row.oldId });
    byNormalized.set(row.newId, group);
  }

  // Also check if the normalized ID already exists as a different row
  const existingNormalized = new Set(
    allRows
      .filter((r) => !rowsToUpdate.some((u) => u.id === r.id))
      .map((r) => r.jobSiteId),
  );

  let rowsUpdated = 0;
  let duplicatesResolved = 0;

  for (const [normalizedId, group] of byNormalized.entries()) {
    // Does this normalized ID already exist as a raw ID in the DB?
    const existsAlready = existingNormalized.has(normalizedId);

    if (existsAlready) {
      // Delete ALL prefixed versions — the raw ID row already exists
      for (const row of group) {
        try {
          await db.delete(jobsPostings).where(sql`${jobsPostings.id} = ${row.id}`);
          duplicatesResolved++;
        } catch (err) {
          errors.push(`Failed to delete duplicate ${row.oldId} (row ${row.id}): ${err}`);
        }
      }
    } else if (group.length > 1) {
      // Multiple prefixed versions of the same job — keep the newest, delete rest
      const sorted = group.sort((a, b) => b.id - a.id);
      const keeper = sorted[0];

      // Update the keeper to the normalized ID
      try {
        await db
          .update(jobsPostings)
          .set({ jobSiteId: normalizedId })
          .where(sql`${jobsPostings.id} = ${keeper.id}`);
        rowsUpdated++;
      } catch (err) {
        errors.push(`Failed to update ${keeper.oldId} → ${normalizedId}: ${err}`);
      }

      // Delete the rest
      for (const row of sorted.slice(1)) {
        try {
          await db.delete(jobsPostings).where(sql`${jobsPostings.id} = ${row.id}`);
          duplicatesResolved++;
        } catch (err) {
          errors.push(`Failed to delete duplicate ${row.oldId} (row ${row.id}): ${err}`);
        }
      }
    } else {
      // Single prefixed row, no conflict — just update
      const row = group[0];
      try {
        await db
          .update(jobsPostings)
          .set({ jobSiteId: normalizedId })
          .where(sql`${jobsPostings.id} = ${row.id}`);
        rowsUpdated++;
      } catch (err) {
        errors.push(`Failed to update ${row.oldId} → ${normalizedId}: ${err}`);
      }
    }
  }

  return {
    totalRows,
    rowsNeedingUpdate: rowsToUpdate.length,
    rowsUpdated,
    duplicatesResolved,
    errors,
  };
}
