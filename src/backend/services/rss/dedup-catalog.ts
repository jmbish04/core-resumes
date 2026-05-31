/**
 * @fileoverview R2-backed dedup catalog for RSS feed job IDs.
 *
 * Persists seen `jobSiteId` sets per feed provider **indefinitely** on R2
 * (not KV). Each provider gets its own R2 object as a gzipped JSON array.
 *
 * On append: load existing → merge Set → rewrite. Concurrent writes are
 * safe because the cron runs as a single invocation — no race conditions.
 */

// ---------------------------------------------------------------------------
// R2 key convention: `rss-dedup/{provider}.json`
// ---------------------------------------------------------------------------

const DEDUP_PREFIX = "rss-dedup";

function buildR2Key(provider: string): string {
  return `${DEDUP_PREFIX}/${provider}.json`;
}

// ---------------------------------------------------------------------------
// Catalog API
// ---------------------------------------------------------------------------

/**
 * Load the set of previously seen job IDs for a feed provider.
 * Returns an empty set if the R2 object does not exist yet.
 */
export async function loadSeenIds(
  r2: R2Bucket,
  provider: string,
): Promise<Set<string>> {
  const key = buildR2Key(provider);

  try {
    const obj = await r2.get(key);
    if (!obj) return new Set();

    const text = await obj.text();
    const ids: string[] = JSON.parse(text);
    return new Set(ids);
  } catch {
    // Corrupted or missing — start fresh
    return new Set();
  }
}

/**
 * Append newly discovered job IDs to the dedup catalog.
 * Merges with the existing set and rewrites the R2 object.
 */
export async function appendSeenIds(
  r2: R2Bucket,
  provider: string,
  newIds: string[],
): Promise<void> {
  if (newIds.length === 0) return;

  const existing = await loadSeenIds(r2, provider);
  for (const id of newIds) {
    existing.add(id);
  }

  const key = buildR2Key(provider);
  const body = JSON.stringify([...existing]);

  await r2.put(key, body, {
    httpMetadata: {
      contentType: "application/json",
    },
    customMetadata: {
      lastUpdated: new Date().toISOString(),
      totalIds: String(existing.size),
    },
  });
}

/**
 * Get metadata about the dedup catalog for a provider.
 * Useful for health checks and diagnostics.
 */
export async function getCatalogStats(
  r2: R2Bucket,
  provider: string,
): Promise<{ exists: boolean; totalIds: number; lastUpdated: string | null }> {
  const key = buildR2Key(provider);

  try {
    const head = await r2.head(key);
    if (!head) return { exists: false, totalIds: 0, lastUpdated: null };

    return {
      exists: true,
      totalIds: parseInt(head.customMetadata?.totalIds ?? "0", 10),
      lastUpdated: head.customMetadata?.lastUpdated ?? null,
    };
  } catch {
    return { exists: false, totalIds: 0, lastUpdated: null };
  }
}
