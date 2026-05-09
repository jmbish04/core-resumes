/**
 * @fileoverview Text-to-Speech route — Deepgram Aura-2 streaming TTS.
 *
 * Uses @cf/deepgram/aura-2-en for real-time conversational speech synthesis.
 * Returns streaming MP3 audio with chunked transfer encoding for minimal TTFB.
 */

import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import type { AppBindings } from "..";

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const ttsRouter = new Hono<AppBindings>();

const TtsRequestSchema = z.object({
  text: z.string().min(1, "Text payload is required"),
});

/**
 * POST / — Generate speech audio from text.
 *
 * Returns streaming audio/mpeg response. The frontend's CustomTTSAdapter
 * consumes this as a Blob for HTMLAudioElement playback.
 */
ttsRouter.post("/", zValidator("json", TtsRequestSchema), async (c) => {
  const { text } = c.req.valid("json");

  const audioStream = await c.env.AI.run(
    "@cf/deepgram/aura-2-en" as Parameters<typeof c.env.AI.run>[0],
    {
      text,
      // Deepgram Aura-2 supports speaker and encoding
      speaker: "luna",
      encoding: "mp3",
    },
    { gateway: { id: c.env.AI_GATEWAY_ID } },
  );

  return new Response(audioStream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
});
