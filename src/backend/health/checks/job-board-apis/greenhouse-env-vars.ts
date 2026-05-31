/**
 * @fileoverview Health check: Greenhouse env vars.
 *
 * Validates that all required environment variables for the Greenhouse
 * job scanner pipeline are set and have sane values. Does not make
 * any external calls — pure config validation.
 *
 * Sub-checks:
 * 1. GREENHOUSE_API_BASE is set and looks like a URL
 * 2. VECTORIZE_INDEX_NAME is set
 * 3. VECTORIZE_DIMENSIONS is set and is a valid integer
 * 4. MODEL_EMBED_JOBS is set
 * 5. MODEL_TRIAGE is set
 * 6. DEFAULT_BOARD_TOKENS is set and has at least one token
 */

import type { HealthStepResult } from "@/backend/health/types";

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

export async function checkGreenhouseEnvVars(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const issues: string[] = [];
  const warnings: string[] = [];
  const details: Record<string, unknown> = {};

  // Sub-check 1: GREENHOUSE_API_BASE
  if (!env.GREENHOUSE_API_BASE) {
    issues.push("GREENHOUSE_API_BASE is not set");
  } else {
    try {
      new URL(env.GREENHOUSE_API_BASE);
      details.greenhouseApiBase = env.GREENHOUSE_API_BASE;
    } catch {
      issues.push(`GREENHOUSE_API_BASE is not a valid URL: '${env.GREENHOUSE_API_BASE}'`);
    }
  }

  // Sub-check 2: VECTORIZE_INDEX_NAME
  if (!env.VECTORIZE_INDEX_NAME) {
    issues.push("VECTORIZE_INDEX_NAME is not set");
  } else {
    details.vectorizeIndexName = env.VECTORIZE_INDEX_NAME;
  }

  // Sub-check 3: VECTORIZE_DIMENSIONS
  if (!env.VECTORIZE_DIMENSIONS) {
    issues.push("VECTORIZE_DIMENSIONS is not set");
  } else {
    const dims = parseInt(env.VECTORIZE_DIMENSIONS, 10);
    if (isNaN(dims) || dims < 1) {
      issues.push(
        `VECTORIZE_DIMENSIONS is not a valid positive integer: '${env.VECTORIZE_DIMENSIONS}'`,
      );
    } else {
      details.vectorizeDimensions = dims;
      // Warn if not the expected 768 for gemini-embedding-001
      if (dims !== 768) {
        warnings.push(`VECTORIZE_DIMENSIONS=${dims} — expected 768 for gemini-embedding-001`);
      }
    }
  }

  // Sub-check 4: MODEL_EMBED_JOBS
  if (!env.MODEL_EMBED_JOBS) {
    issues.push("MODEL_EMBED_JOBS is not set");
  } else {
    details.modelEmbedJobs = env.MODEL_EMBED_JOBS;
  }

  // Sub-check 5: MODEL_TRIAGE
  if (!env.MODEL_TRIAGE) {
    issues.push("MODEL_TRIAGE is not set");
  } else {
    details.modelTriage = env.MODEL_TRIAGE;
  }

  // Sub-check 6: DEFAULT_BOARD_TOKENS
  if (!env.DEFAULT_BOARD_TOKENS) {
    warnings.push("DEFAULT_BOARD_TOKENS is not set — relying on D1 board_tokens only");
  } else {
    const tokens = env.DEFAULT_BOARD_TOKENS.split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    details.defaultBoardTokens = tokens;
    details.defaultBoardTokenCount = tokens.length;
    if (tokens.length === 0) {
      warnings.push("DEFAULT_BOARD_TOKENS is set but contains no valid tokens");
    }
  }

  // Compute status
  const status = issues.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "ok";

  return {
    status,
    latencyMs: Date.now() - start,
    error:
      issues.length > 0 ? issues.join("; ") : warnings.length > 0 ? warnings.join("; ") : undefined,
    details,
  };
}
