/**
 * @fileoverview Health check: R2 Jobs Bucket lifecycle.
 *
 * Validates the R2_JOBS_BUCKET binding by performing a full write → read →
 * delete roundtrip with a tiny probe object. This mirrors the archive
 * pipeline's storage pattern without touching real data.
 *
 * Sub-checks:
 * 1. Binding presence
 * 2. PUT a probe object
 * 3. GET + verify content matches
 * 4. DELETE the probe
 */

import type { HealthStepResult } from "@/backend/health/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROBE_KEY = "__health/r2-jobs-probe.txt";
const PROBE_BODY = `health-check-${Date.now()}`;

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

export async function checkR2JobsBucket(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const details: Record<string, unknown> = {};

  try {
    // Sub-check 1: Binding presence
    if (!env.R2_JOBS_BUCKET) {
      return {
        status: "fail",
        latencyMs: Date.now() - start,
        error: "R2_JOBS_BUCKET binding is not available",
        details: { binding: "missing" },
      };
    }
    details.binding = "present";

    // Sub-check 2: Write probe
    const writeStart = Date.now();
    await env.R2_JOBS_BUCKET.put(PROBE_KEY, PROBE_BODY, {
      customMetadata: { purpose: "health-check" },
    });
    details.writeLatencyMs = Date.now() - writeStart;

    // Sub-check 3: Read back and verify
    const readStart = Date.now();
    const readObj = await env.R2_JOBS_BUCKET.get(PROBE_KEY);
    details.readLatencyMs = Date.now() - readStart;

    if (!readObj) {
      return {
        status: "fail",
        latencyMs: Date.now() - start,
        error: "R2 GET returned null immediately after PUT",
        details,
      };
    }

    const content = await readObj.text();
    if (content !== PROBE_BODY) {
      return {
        status: "fail",
        latencyMs: Date.now() - start,
        error: `R2 content mismatch: expected '${PROBE_BODY}', got '${content.slice(0, 50)}'`,
        details,
      };
    }
    details.contentMatch = true;

    // Sub-check 4: Cleanup
    const deleteStart = Date.now();
    await env.R2_JOBS_BUCKET.delete(PROBE_KEY);
    details.deleteLatencyMs = Date.now() - deleteStart;

    return {
      status: "ok",
      latencyMs: Date.now() - start,
      details,
    };
  } catch (e) {
    // Best-effort cleanup
    try {
      await env.R2_JOBS_BUCKET?.delete(PROBE_KEY);
    } catch {
      /* ignore */
    }

    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
      details,
    };
  }
}
