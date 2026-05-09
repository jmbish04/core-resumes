import type { getSandbox } from "@cloudflare/sandbox";

import { getDb } from "@/db";
import { transcriptionChunks } from "@/db/schema";

export async function runFFmpegChunking(
  env: Env,
  sandbox: Awaited<ReturnType<typeof getSandbox>>,
  inputPath: string,
  r2ChunksDir: string,
  chunksDir: string,
  jobId: string,
) {
  const result = await sandbox.exec(
    `python3 /workspace/process_audio.py ${inputPath} ${r2ChunksDir}`,
    { timeout: 120_000 },
  );

  if (!result.success) {
    throw new Error(`FFmpeg failed (exit ${result.exitCode}): ${result.stderr.slice(0, 500)}`);
  }

  // Parse stdout markers
  const stdout = result.stdout;
  const lines = stdout.split("\n");
  const chunkFiles: string[] = [];
  let totalChunks = 0;

  for (const line of lines) {
    if (line.startsWith("CHUNK_COUNT:")) {
      totalChunks = parseInt(line.split(":")[1]!, 10);
    } else if (line.startsWith("CHUNK_FILE:")) {
      chunkFiles.push(line.split(":")[1]!.trim());
    } else if (line.startsWith("ERROR:")) {
      throw new Error(`FFmpeg script error: ${line.slice(6)}`);
    }
  }

  if (totalChunks === 0 || chunkFiles.length === 0) {
    throw new Error("FFmpeg produced no chunks");
  }

  // Insert chunk records into D1
  const db = getDb(env);
  for (let i = 0; i < chunkFiles.length; i++) {
    await db.insert(transcriptionChunks).values({
      jobId,
      chunkIndex: i,
      r2Key: `${chunksDir}/${chunkFiles[i]}`,
      status: "pending",
      durationSeconds: 30,
    });
  }

  return { totalChunks, chunkFiles };
}
