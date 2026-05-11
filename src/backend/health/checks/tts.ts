import type { HealthStepResult } from "@/backend/health/types";

/**
 * Verify Deepgram Aura-2 TTS by synthesizing a short phrase.
 * Reads the first chunk of the response stream to validate bytes are produced.
 */
export async function checkTTS(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  try {
    const result = await env.AI.run(
      "@cf/deepgram/aura-2-en" as Parameters<typeof env.AI.run>[0],
      {
        text: "Health check.",
        speaker: "luna",
        encoding: "mp3",
      },
      { gateway: { id: env.AI_GATEWAY_ID } },
    );

    if (!result) {
      return { status: "fail", latencyMs: Date.now() - start, error: "Empty TTS response" };
    }

    // Validate stream produces bytes
    if (result instanceof ReadableStream) {
      const reader = result.getReader();
      const { value, done } = await reader.read();
      reader.releaseLock();

      if (done || !value || value.byteLength === 0) {
        return {
          status: "fail",
          latencyMs: Date.now() - start,
          error: "TTS stream produced 0 bytes",
        };
      }

      return {
        status: "ok",
        latencyMs: Date.now() - start,
        details: { model: "@cf/deepgram/aura-2-en", firstChunkBytes: value.byteLength },
      };
    }

    return {
      status: "ok",
      latencyMs: Date.now() - start,
      details: { model: "@cf/deepgram/aura-2-en" },
    };
  } catch (e) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
