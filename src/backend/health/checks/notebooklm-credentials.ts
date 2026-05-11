import type { HealthStepResult } from "@/backend/health/types";

/**
 * Verify NotebookLM credential bindings are present.
 *
 * Checks:
 *  1. KV `ACTIVE_NOTEBOOKLM_SESSION` — hot-swap session cookies
 *  2. Env var `CAREER_NOTEBOOKLM_ID` — notebook identifier
 *
 * Note: The CSRF token is fetched via Browser Rendering `/content` with a
 * Chrome User-Agent and cached in KV with a sliding-window TTL. No separate
 * auth token binding or Worker Secret is needed.
 */
export async function checkNotebookLMCredentials(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const issues: string[] = [];
  const details: Record<string, unknown> = {};

  // Check notebook ID
  if (!env.CAREER_NOTEBOOKLM_ID) {
    issues.push("CAREER_NOTEBOOKLM_ID not set");
  }
  details.notebookId = env.CAREER_NOTEBOOKLM_ID || "missing";

  // Check KV session
  let kvSessionPresent = false;
  try {
    const kvSession = await env.KV.get("ACTIVE_NOTEBOOKLM_SESSION");
    kvSessionPresent = !!(kvSession && kvSession.trim().length > 10);
  } catch {
    // KV read failed
  }
  details.kvSessionPresent = kvSessionPresent;

  if (!kvSessionPresent) {
    issues.push(
      `No active session. Update cookies from Config → NotebookLM Session, ` +
        `or run: pnpm run session:sync`,
    );
  }

  // Check CSRF cache presence (informational, not required)
  let csrfCachePresent = false;
  try {
    const csrfCache = await env.KV.get("NOTEBOOKLM_CSRF_CACHE");
    csrfCachePresent = !!csrfCache;
  } catch {
    // Non-critical
  }
  details.csrfCachePresent = csrfCachePresent;
  details.sessionSource = kvSessionPresent ? "kv" : "none";
  details.issueCount = issues.length;

  return {
    status: issues.length === 0 ? "ok" : "fail",
    latencyMs: Date.now() - start,
    error: issues.length > 0 ? issues.join("; ") : undefined,
    details,
  };
}
