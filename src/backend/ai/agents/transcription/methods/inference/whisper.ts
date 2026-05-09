import { eq } from "drizzle-orm";
import { Buffer } from "node:buffer";

import { getDb } from "@/db";
import {
  transcriptionChunks,
  interviewRecordings,
  rolePodcasts,
  transcriptionJobs,
} from "@/db/schema";

export async function processChunksWithWhisper(
  env: Env,
  chunksDir: string,
  chunkFiles: string[],
  totalChunks: number,
  jobId: string,
  recordingId: string,
  onProgress: (phase: string, completed: number, progress: number, text: string) => Promise<void>,
  log: (msg: string) => void,
) {
  let fullText = "";
  const db = getDb(env);

  for (let i = 0; i < chunkFiles.length; i++) {
    const chunkR2Key = `${chunksDir}/${chunkFiles[i]}`;

    log(`🎤 Transcribing chunk ${i + 1}/${totalChunks}: ${chunkFiles[i]}`);
    await onProgress(
      `Transcribing chunk ${i + 1}/${totalChunks}…`,
      i,
      Math.round((i / totalChunks) * 100),
      fullText,
    );

    // Update chunk status to processing
    const [chunkRow] = await db
      .select()
      .from(transcriptionChunks)
      .where(eq(transcriptionChunks.r2Key, chunkR2Key))
      .limit(1);

    if (chunkRow) {
      await db
        .update(transcriptionChunks)
        .set({ status: "processing" })
        .where(eq(transcriptionChunks.id, chunkRow.id));
    }

    // Fetch chunk from R2
    const r2Object = await env.R2_AUDIO_BUCKET.get(chunkR2Key);
    if (!r2Object) {
      log(`⚠️ Chunk not found in R2: ${chunkR2Key} — skipping`);
      if (chunkRow) {
        await db
          .update(transcriptionChunks)
          .set({ status: "failed" })
          .where(eq(transcriptionChunks.id, chunkRow.id));
      }
      continue;
    }

    // Convert to base64
    const audioBuffer = await r2Object.arrayBuffer();
    const base64 = Buffer.from(audioBuffer).toString("base64");

    // Call Whisper via native env.AI.run()
    const whisperResult = (await env.AI.run(
      "@cf/openai/whisper-large-v3-turbo" as Parameters<typeof env.AI.run>[0],
      { audio: base64 },
      { gateway: { id: env.AI_GATEWAY_ID } },
    )) as { text?: string };

    const chunkText = whisperResult.text ?? "";

    // Append to full text
    if (chunkText) {
      fullText += (fullText ? " " : "") + chunkText;
    }

    // Update chunk in D1
    if (chunkRow) {
      await db
        .update(transcriptionChunks)
        .set({
          status: "complete",
          transcription: chunkText,
          completedAt: new Date(),
        })
        .where(eq(transcriptionChunks.id, chunkRow.id));
    }

    // Sync progress
    const completedChunks = i + 1;
    const progress = Math.round((completedChunks / totalChunks) * 100);
    await onProgress(
      `Transcribing chunk ${i + 1}/${totalChunks}…`,
      completedChunks,
      progress,
      fullText,
    );

    log(`✅ Chunk ${i + 1}/${totalChunks} complete (${chunkText.length} chars)`);
  }

  // Finalize
  log("💾 Writing final transcription to D1…");

  const [job] = await db
    .select({ podcastId: transcriptionJobs.podcastId })
    .from(transcriptionJobs)
    .where(eq(transcriptionJobs.id, jobId))
    .limit(1);

  if (job?.podcastId) {
    await db
      .update(rolePodcasts)
      .set({ transcriptText: fullText, updatedAt: new Date() })
      .where(eq(rolePodcasts.id, job.podcastId));
  } else {
    await db
      .update(interviewRecordings)
      .set({ transcription: fullText, transcriptionStatus: "complete" })
      .where(eq(interviewRecordings.id, recordingId));
  }

  return fullText;
}
