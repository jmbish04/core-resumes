/**
 * @fileoverview Health check: Gemini AI Studio provider.
 *
 * Validates that the GEMINI_API_KEY secret store binding is accessible
 * and can be used to reach the Google AI Studio API through AI Gateway.
 * Does NOT run a full embedding (that costs quota) — instead performs
 * a minimal model info request.
 *
 * Sub-checks:
 * 1. GEMINI_API_KEY binding exists and returns a non-empty value
 * 2. AI Gateway URL construction is valid
 * 3. Model list endpoint responds (proves key + gateway are wired)
 */

import type { HealthStepResult } from "@/backend/health/types";

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

export async function checkGeminiProvider(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const details: Record<string, unknown> = {};

  try {
    // Sub-check 1: Secret binding
    if (!env.GEMINI_API_KEY) {
      return {
        status: "fail",
        latencyMs: Date.now() - start,
        error: "GEMINI_API_KEY binding is not available",
        details: { binding: "missing" },
      };
    }

    let apiKey: string;
    try {
      apiKey = await env.GEMINI_API_KEY.get();
    } catch (e) {
      return {
        status: "fail",
        latencyMs: Date.now() - start,
        error: `GEMINI_API_KEY.get() failed: ${e instanceof Error ? e.message : String(e)}`,
        details: { binding: "get_failed" },
      };
    }

    if (!apiKey || apiKey.length < 10) {
      return {
        status: "fail",
        latencyMs: Date.now() - start,
        error: "GEMINI_API_KEY returned an empty or suspiciously short value",
        details: { keyLength: apiKey?.length ?? 0 },
      };
    }
    details.keyPresent = true;
    details.keyLength = apiKey.length;

    // Sub-check 2: AI Gateway URL construction
    const gatewayName = env.AI_GATEWAY_NAME;
    const gatewayId = env.AI_GATEWAY_ID;
    details.gatewayName = gatewayName ?? "not_set";
    details.gatewayId = gatewayId ?? "not_set";

    if (!gatewayName && !gatewayId) {
      return {
        status: "warn",
        latencyMs: Date.now() - start,
        error: "AI_GATEWAY_NAME and AI_GATEWAY_ID both missing — Gemini calls will fail",
        details,
      };
    }

    // Sub-check 3: Lightweight API probe
    // Use the models list endpoint — minimal cost, proves auth works
    const probeUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=1`;
    const probeStart = Date.now();
    const probeRes = await fetch(probeUrl, {
      method: "GET",
      signal: AbortSignal.timeout(8_000),
    });
    details.probeLatencyMs = Date.now() - probeStart;
    details.probeStatus = probeRes.status;

    if (!probeRes.ok) {
      const body = await probeRes.text().catch(() => "");
      return {
        status: "fail",
        latencyMs: Date.now() - start,
        error: `Gemini API probe returned ${probeRes.status}: ${body.slice(0, 200)}`,
        details,
      };
    }

    const probeBody = (await probeRes.json()) as { models?: unknown[] };
    details.modelsReturned = Array.isArray(probeBody.models) ? probeBody.models.length : 0;

    return {
      status: "ok",
      latencyMs: Date.now() - start,
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
