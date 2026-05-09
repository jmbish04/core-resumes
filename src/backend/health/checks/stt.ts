import type { HealthStepResult } from "@/backend/health/types";

/**
 * Verify Whisper STT model is available by sending a tiny silent WAV payload.
 * Asserts `result.text` is defined (not just non-null response).
 */
export async function checkSTT(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  try {
    // Minimal valid WAV header (44 bytes) + 0.1s silence at 8000Hz mono 8-bit
    const sampleRate = 8000;
    const duration = 0.1;
    const numSamples = Math.floor(sampleRate * duration);
    const headerSize = 44;
    const dataSize = numSamples;
    const buffer = new ArrayBuffer(headerSize + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    const encoder = new TextEncoder();
    const riff = encoder.encode("RIFF");
    new Uint8Array(buffer, 0, 4).set(riff);
    view.setUint32(4, 36 + dataSize, true);
    const wave = encoder.encode("WAVE");
    new Uint8Array(buffer, 8, 4).set(wave);
    const fmt = encoder.encode("fmt ");
    new Uint8Array(buffer, 12, 4).set(fmt);
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true); // byte rate
    view.setUint16(32, 1, true); // block align
    view.setUint16(34, 8, true); // bits per sample
    const data = encoder.encode("data");
    new Uint8Array(buffer, 36, 4).set(data);
    view.setUint32(40, dataSize, true);
    // Audio data = silence (zeros — already initialized)

    // Convert to base64
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    const base64 = btoa(binary);

    const result = (await env.AI.run(
      "@cf/openai/whisper-large-v3-turbo" as Parameters<typeof env.AI.run>[0],
      { audio: base64 },
      { gateway: { id: env.AI_GATEWAY_ID } },
    )) as { text?: string };

    if (result === undefined || result === null) {
      return { status: "fail", latencyMs: Date.now() - start, error: "Empty STT response" };
    }

    // Assert text field is defined (enhanced from legacy check)
    if (result.text === undefined) {
      return {
        status: "warn",
        latencyMs: Date.now() - start,
        error: "STT response missing text field",
      };
    }

    return {
      status: "ok",
      latencyMs: Date.now() - start,
      details: { model: "@cf/openai/whisper-large-v3-turbo", transcribedText: result.text },
    };
  } catch (e) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
