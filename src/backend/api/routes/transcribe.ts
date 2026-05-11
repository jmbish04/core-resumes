/**
 * @fileoverview Speech-to-Text route — Whisper transcription with R2 storage.
 *
 * Accepts audio via multipart/form-data, persists to R2 for durability,
 * then transcribes using @cf/openai/whisper-large-v3-turbo.
 *
 * The frontend's CloudflareWhisperAdapter (DictationAdapter) posts
 * MediaRecorder Blobs to this endpoint.
 */

import { Hono } from "hono";

import type { AppBindings } from "..";

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const transcribeRouter = new Hono<AppBindings>();

/**
 * POST / — Transcribe audio to text.
 *
 * Accepts multipart/form-data with an `audio` field containing the
 * recorded audio Blob. The audio is immediately persisted to R2 for
 * durability before being sent to the Whisper model.
 *
 * Returns: { text: string, r2_key: string }
 */
transcribeRouter.post("/", async (c) => {
  const body = await c.req.parseBody();
  const audioFile = body.audio;

  if (!audioFile || !(audioFile instanceof File)) {
    return c.json({ error: "Missing or invalid 'audio' field in multipart form" }, 400);
  }

  const arrayBuffer = await audioFile.arrayBuffer();

  // 1. Persist to R2 for durability and potential chunking of long audio
  const r2Key = `uploads/audio-${crypto.randomUUID()}.webm`;

  // R2 binding is optional — gracefully skip if not configured
  if (c.env.R2_AUDIO_BUCKET) {
    await c.env.R2_AUDIO_BUCKET.put(r2Key, arrayBuffer).catch((err: unknown) => {
      console.error("R2 upload failed (non-fatal):", err);
    });
  }

  // 2. Convert to base64 for Workers AI payload
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const base64 = btoa(binary);

  // 3. Transcribe via Whisper
  try {
    const response = (await c.env.AI.run(
      "@cf/openai/whisper-large-v3-turbo" as Parameters<typeof c.env.AI.run>[0],
      // Whisper accepts base64 audio
      { audio: base64 },
      { gateway: { id: c.env.AI_GATEWAY_ID } },
    )) as { text?: string };

    return c.json({
      text: response.text ?? "",
      r2_key: r2Key,
    });
  } catch (error) {
    console.error("Whisper transcription failed:", error);
    return c.json({ error: "Failed to transcribe audio", r2_key: r2Key }, 500);
  }
});
