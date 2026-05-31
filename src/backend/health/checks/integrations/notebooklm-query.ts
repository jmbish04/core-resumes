import type { HealthStepResult } from "@/backend/health/types";
import type { HealthTrigger } from "@/backend/health/types";

import { checkNotebookLMSession, consultNotebook } from "@/ai/tools/notebooklm/notebooklm";

/**
 * NotebookLM dual-mode health check.
 *
 * **Scheduled (cron):** Passive credential validation only — checks cookie
 * presence, structure, and age without making any outbound requests to Google.
 * This prevents Google from flagging the session as suspicious and shortening
 * its lifetime from ~30 days to ~1 hour.
 *
 * **Manual / Agent:** Performs a full live query through the `consultNotebook()`
 * pipeline to validate end-to-end connectivity.
 *
 * The `trigger` parameter controls which mode is used. The health coordinator
 * passes the trigger from the original `runAllChecks(trigger)` call.
 */
export async function checkNotebookLMQuery(
  env: Env,
  trigger: HealthTrigger = "scheduled",
): Promise<HealthStepResult> {
  // Manual and agent triggers run the full live query
  if (trigger === "manual" || trigger === "agent") {
    return runLiveQuery(env);
  }

  // Scheduled (cron) triggers run passive credential check only
  return runPassiveCheck(env);
}

// ---------------------------------------------------------------------------
// Live query (manual / agent only)
// ---------------------------------------------------------------------------

const TEST_QUERY = "In one sentence, what is this notebook about?";

async function runLiveQuery(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const details: Record<string, unknown> = {};
  details.checkMode = "live (outbound query to NotebookLM)";

  try {
    const result = await consultNotebook(env, TEST_QUERY);

    details.answerLength = result.answer?.length ?? 0;
    details.conversationId = result.conversationId ?? "(missing)";
    details.turnNumber = result.turnNumber ?? "(missing)";
    details.referenceCount = result.references?.length ?? 0;
    details.answerPreview = result.answer?.slice(0, 120) ?? "";

    if (!result.answer || result.answer.trim().length === 0) {
      return {
        status: "warn",
        latencyMs: Date.now() - start,
        error: "NotebookLM returned an empty answer — session cookies may be expired",
        details,
      };
    }

    return {
      status: "ok",
      latencyMs: Date.now() - start,
      details,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    details.errorType = error instanceof Error ? error.constructor.name : "unknown";

    // Provide actionable guidance based on error type
    let suggestion: string | undefined;
    if (
      msg.includes("session_expired") ||
      msg.includes("expired") ||
      msg.includes("csrf") ||
      msg.includes("login")
    ) {
      suggestion =
        "Session cookies are expired. Update from Config → NotebookLM Session, or run: pnpm run session:sync";
    } else if (msg.includes("empty") || msg.includes("missing")) {
      suggestion =
        "No active session found. Run: pnpm run session:sync to push local session to KV";
    }

    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: msg.slice(0, 300),
      details,
      aiSuggestion: suggestion,
    };
  }
}

// ---------------------------------------------------------------------------
// Passive credential check (cron only)
// ---------------------------------------------------------------------------

async function runPassiveCheck(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const details: Record<string, unknown> = {};
  const issues: string[] = [];

  details.checkMode = "passive (no outbound requests — cron safe)";

  // 1. Check session availability (KV → Worker Secret)
  const session = await checkNotebookLMSession(env);
  details.sessionAvailable = session.available;
  details.sessionSource = session.source;

  if (!session.available) {
    issues.push(
      "No active NotebookLM session found in KV or Worker Secret. " +
        "Update cookies from Config → NotebookLM Session, or run: pnpm run session:sync",
    );
  }

  // 2. Check notebook ID
  if (!env.CAREER_NOTEBOOKLM_ID) {
    issues.push("CAREER_NOTEBOOKLM_ID env var is not set");
  }
  details.notebookId = env.CAREER_NOTEBOOKLM_ID ? "(set)" : "(missing)";

  // 3. If session exists, validate cookie structure
  if (session.available) {
    try {
      const cookies = await env.KV.get("ACTIVE_NOTEBOOKLM_SESSION");

      if (cookies) {
        details.cookieLength = cookies.length;
        details.preview = cookies.slice(0, 40) + "…";

        // Check for essential Google session cookie names
        const hasEssentialCookies = ["SID", "__Secure-1PSID", "NID"].some((name) =>
          cookies.includes(`${name}=`),
        );
        details.hasEssentialCookies = hasEssentialCookies;

        if (!hasEssentialCookies) {
          issues.push(
            "Cookie string is present but missing essential Google session cookies " +
              "(SID, __Secure-1PSID, NID). The session may be malformed.",
          );
        }

        // Check session age from KV timestamp
        const updatedAt = await env.KV.get("ACTIVE_NOTEBOOKLM_SESSION_UPDATED_AT");
        if (updatedAt) {
          const ageMs = Date.now() - new Date(updatedAt).getTime();
          const ageHours = Math.round(ageMs / 3_600_000);
          details.sessionAgeHours = ageHours;
          details.updatedAt = updatedAt;

          if (ageHours > 480) {
            issues.push(
              `Session cookies are ${ageHours} hours (~${Math.round(ageHours / 24)} days) old. ` +
                "Consider refreshing from Config → NotebookLM Session before they expire.",
            );
          }
        }

        // Check CSRF cache status (informational)
        try {
          const csrfCache = await env.KV.get("NOTEBOOKLM_CSRF_CACHE");
          details.csrfCachePres = !!csrfCache;
        } catch {
          // Non-critical
        }
      }
    } catch {
      // Non-critical — we already confirmed availability above
    }
  }

  details.issueCount = issues.length;

  if (issues.length === 0) {
    return { status: "ok", latencyMs: Date.now() - start, details };
  }

  const hasCritical = !session.available || !env.CAREER_NOTEBOOKLM_ID;

  return {
    status: hasCritical ? "fail" : "warn",
    latencyMs: Date.now() - start,
    error: issues.join("; "),
    details,
    aiSuggestion: !session.available
      ? "Update cookies from Config → NotebookLM Session, or run: pnpm run session:sync"
      : undefined,
  };
}
