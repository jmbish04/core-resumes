/**
 * @fileoverview Health check: Vectorize Jobs index.
 *
 * Validates the VECTORIZE_JOBS binding by performing a dimension-safe
 * query with a zero vector. This proves:
 * 1. The binding is connected
 * 2. The index accepts queries
 * 3. The dimension configuration matches expectations
 *
 * Does NOT insert test vectors (that would pollute the index).
 */

import type { HealthStepResult } from "@/backend/health/types";

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

export async function checkVectorizeJobs(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const details: Record<string, unknown> = {};

  try {
    // Sub-check 1: Binding presence
    if (!env.VECTORIZE_JOBS) {
      return {
        status: "fail",
        latencyMs: Date.now() - start,
        error: "VECTORIZE_JOBS binding is not available",
        details: { binding: "missing" },
      };
    }
    details.binding = "present";

    // Resolve expected dimensions from env (default 768 for gemini-embedding-001)
    const expectedDims = parseInt(env.VECTORIZE_DIMENSIONS ?? "768", 10);
    details.expectedDimensions = expectedDims;

    // Sub-check 2: Query with a zero vector
    const queryStart = Date.now();
    const zeroVector = new Float32Array(expectedDims);
    const queryResult = await env.VECTORIZE_JOBS.query(zeroVector, { topK: 1 });
    details.queryLatencyMs = Date.now() - queryStart;
    details.matchCount = queryResult.matches?.length ?? 0;

    // If the index is empty, matches will be [] — that's fine, binding works
    details.indexQueryable = true;

    return {
      status: "ok",
      latencyMs: Date.now() - start,
      details,
    };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);

    // Dimension mismatch is a critical config error
    if (errMsg.includes("dimension")) {
      return {
        status: "fail",
        latencyMs: Date.now() - start,
        error: `Vectorize dimension mismatch: ${errMsg}`,
        details: { ...details, configError: true },
      };
    }

    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: errMsg,
      details,
    };
  }
}
