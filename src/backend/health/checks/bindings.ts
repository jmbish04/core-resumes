import type { HealthStepResult } from "@/backend/health/types";

/**
 * Validate platform bindings that aren't covered by other checks.
 *
 * Sub-checks (all parallel):
 * - BROWSER — binding existence
 * - R2_AUDIO_BUCKET — head a probe key (expect 404, proves binding works)
 * - EMAIL_OUT — MIME construction via mimetext (no actual send)
 * - SESSIONS KV — get a probe key (expect null, proves binding works)
 * - SANDBOX — binding existence
 */
export async function checkBindings(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const issues: string[] = [];
  const skipped: string[] = [];
  const details: Record<string, unknown> = {};

  const subChecks = await Promise.allSettled([
    // BROWSER binding
    (async () => {
      if (!env.BROWSER) {
        skipped.push("BROWSER");
        return;
      }
      details.browser = "present";
    })(),

    // R2_AUDIO_BUCKET binding
    (async () => {
      if (!env.R2_AUDIO_BUCKET) {
        skipped.push("R2_AUDIO_BUCKET");
        return;
      }
      try {
        await env.R2_AUDIO_BUCKET.head("health-check-probe");
        // Expect null (object doesn't exist) — that's fine, binding works
        details.r2 = "ok";
      } catch (e) {
        issues.push(`R2_AUDIO_BUCKET error: ${e instanceof Error ? e.message : String(e)}`);
      }
    })(),

    // EMAIL_OUT binding — validate MIME construction with mimetext
    (async () => {
      if (!env.EMAIL_OUT) {
        skipped.push("EMAIL_OUT");
        return;
      }
      try {
        // Import mimetext + cloudflare:email for MIME validation
        const { createMimeMessage } = await import("mimetext");
        const { EmailMessage: _EmailMessage } = await import("cloudflare:email");

        const msg = createMimeMessage();
        msg.setSender({ name: "Health Check", addr: "health@colby.sh" });
        msg.setRecipient("probe@colby.sh");
        msg.setSubject("Health Probe Validation");
        msg.addMessage({
          contentType: "text/plain",
          data: "Binding validation — not actually sent.",
        });

        // Validate construction — do NOT call .send()

        details.emailOut = "mime_construction_ok";
      } catch (e) {
        issues.push(`EMAIL_OUT MIME error: ${e instanceof Error ? e.message : String(e)}`);
      }
    })(),

    // SESSIONS KV binding
    (async () => {
      const kv = (env as Record<string, any>).SESSIONS;
      if (!kv) {
        skipped.push("SESSIONS");
        return;
      }
      try {
        await kv.get("health-check-probe");
        details.sessions = "ok";
      } catch (e) {
        issues.push(`SESSIONS KV error: ${e instanceof Error ? e.message : String(e)}`);
      }
    })(),

    // SANDBOX binding
    (async () => {
      if (!env.SANDBOX) {
        skipped.push("SANDBOX");
        return;
      }
      details.sandbox = "present";
    })(),
  ]);

  // Check for rejected promises (unexpected errors)
  for (const result of subChecks) {
    if (result.status === "rejected") {
      issues.push(`Sub-check failed: ${result.reason}`);
    }
  }

  const status = issues.length > 0 ? "fail" : skipped.length > 0 ? "warn" : "ok";

  return {
    status,
    latencyMs: Date.now() - start,
    error: issues.length > 0 ? issues.join("; ") : undefined,
    details: { ...details, skipped: skipped.length > 0 ? skipped : undefined },
  };
}
