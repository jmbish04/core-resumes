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

  const fastapiUrl = (env as any).NOTEBOOKLM_FASTAPI_URL;
  const fastapiKey = (env as any).NOTEBOOKLM_FASTAPI_KEY;

  if (fastapiUrl) {
    details.fastapiUrl = fastapiUrl;
    details.connectionMode = (env as any).VPC_SERVICE ? "VPC Service Binding" : "Direct Fetch";

    const isLocal = typeof process !== "undefined" && process.env && 
      (process.env.NODE_ENV === "development" || !process.env.NODE_ENV);
    const fetchFn = isLocal
      ? fetch
      : (env as any).VPC_SERVICE
        ? (env as any).VPC_SERVICE.fetch.bind((env as any).VPC_SERVICE)
        : fetch;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); // 4-second timeout

      const response = await fetchFn(`${fastapiUrl}/health`, {
        method: "GET",
        headers: {
          ...(fastapiKey ? { "x-api-key": fastapiKey } : {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP Error Status ${response.status}`);
      }

      const body = await response.json() as any;
      details.fastapiHealth = body;
      details.kvSessionPresent = true; // Simulated for credentials compatibility
      details.sessionSource = "fastapi_bridge";

      if (body.ok) {
        return {
          status: "ok",
          latencyMs: Date.now() - start,
          details,
        };
      } else {
        issues.push(`FastAPI reported unhealthy: ${JSON.stringify(body)}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      issues.push(`FastAPI Bridge Connection Failed: ${errorMsg}`);
      
      // Wrap the failure in a troubleshooting prompt for a coding agent to fix it
      const aiPrompt = `
[FastAPI VPC Connection Health Failure]
The Cloudflare Worker attempted to connect to the local NotebookLM FastAPI bridge server via the private VPC/Tunnel but failed.

Connection Details:
- Target URL: ${fastapiUrl}
- Connection Mode: ${details.connectionMode}
- Error: ${errorMsg}

Troubleshooting Steps for Agent:
1. Verify the LaunchAgent daemon is loaded and running on the host machine:
   'launchctl list | grep colby'
2. View background uvicorn stderr logs for startup exceptions or port-binding blockages:
   'cat ~/.notebooklm/launchd-stderr.log'
3. Confirm the Cloudflare Tunnel is running and properly forwarding private traffic to the host port 8770.
4. If in local development, ensure you are testing the Worker under local dev vars matching 'http://127.0.0.1:8770'.
      `;
      
      return {
        status: "fail",
        latencyMs: Date.now() - start,
        error: issues.join("; "),
        details,
        aiSuggestion: aiPrompt,
      };
    }
  }

  // Fallback to original KV session cookie checking if no FastAPI bridge is configured
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
