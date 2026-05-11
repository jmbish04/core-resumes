import type { getSandbox } from "@cloudflare/sandbox";

import { Agent, callable } from "agents";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { interviewRecordings, rolePodcasts, transcriptionJobs } from "@/db/schema";

import type { TranscriptionState } from "./types";

import { checkHealth as healthProbeImpl } from "./health";
import {
  provisionSandbox,
  destroySandbox,
  runFFmpegChunking,
  mountR2Bucket,
  cleanupR2Chunks,
  processChunksWithWhisper,
} from "./methods";
import { MAX_LOG_LINES } from "./types";

export class TranscriptionAgent extends Agent<Env, TranscriptionState> {
  initialState: TranscriptionState = {
    status: "idle",
    phase: "",
    progress: 0,
    totalChunks: 0,
    completedChunks: 0,
    fullText: "",
    logs: [],
    error: null,
    recordingId: null,
    roleId: null,
    jobId: null,
  };

  static docsMetadata(env: Env) {
    return {
      name: "TranscriptionAgent",
      className: "TranscriptionAgent",
      description:
        "Orchestrates large audio file transcription using a Sandbox (FFmpeg chunking) and native Workers AI (Whisper). Streams real-time progress via WebSocket state. Dual-writes lifecycle to D1 for historical observability.",
      docsPath: "/docs/agents/transcription",
      methods: [
        {
          name: "transcribe",
          description:
            "Start transcription pipeline: Sandbox FFmpeg chunking → Workers AI Whisper per chunk → D1 persistence",
          params: "r2Key: string, recordingId: string, roleId: string, jobId: string",
          returns: "void (progress streamed via setState)",
        },
      ],
      tools: [],
      aiModels: [env.MODEL_TRANSCRIBE],
    };
  }

  private log(msg: string) {
    const logs = [...this.state.logs, `[${new Date().toISOString()}] ${msg}`].slice(-MAX_LOG_LINES);
    this.setState({ ...this.state, logs });
  }

  @callable()
  async healthProbe() {
    return healthProbeImpl(this, this.env);
  }

  private async syncState(
    updates: Partial<TranscriptionState>,
    dbUpdates?: Record<string, unknown>,
  ) {
    this.setState({ ...this.state, ...updates });

    if (this.state.jobId && dbUpdates) {
      const db = getDb(this.env);
      await db
        .update(transcriptionJobs)
        .set({ ...dbUpdates, updatedAt: new Date() })
        .where(eq(transcriptionJobs.id, this.state.jobId));
    }
  }

  @callable()
  async transcribe(r2Key: string, recordingId: string, roleId: string, jobId: string) {
    if (this.state.status === "chunking" || this.state.status === "transcribing") {
      this.log("⚠️ Transcription already in progress — ignoring duplicate call.");
      return;
    }

    const normalizedRecordingId = `${recordingId}`.toLowerCase();
    let sandbox: Awaited<ReturnType<typeof getSandbox>> | null = null;
    let sandboxDestroyed = false;

    try {
      await this.syncState(
        {
          status: "chunking",
          phase: "Initializing Sandbox…",
          progress: 0,
          totalChunks: 0,
          completedChunks: 0,
          fullText: "",
          error: null,
          recordingId,
          roleId,
          jobId,
        },
        { status: "chunking", phase: "Initializing Sandbox…", progress: 0 },
      );
      this.log("🚀 Starting transcription pipeline");
      this.log(`📦 R2 key: ${r2Key}`);

      this.log("🐳 Provisioning Sandbox container…");
      sandbox = await provisionSandbox(this.env, normalizedRecordingId);
      if (!sandbox) throw new Error("Failed to provision sandbox");

      this.log("📂 Mounting R2 bucket…");
      await mountR2Bucket(this.env, sandbox);

      const chunksDir = `chunks/${recordingId}`;
      const r2ChunksDir = `/mnt/r2/${chunksDir}`;
      const inputPath = `/mnt/r2/${r2Key}`;

      this.log(`🎬 Running FFmpeg: splitting ${r2Key} into 30s WAV chunks…`);
      await this.syncState(
        { phase: "Splitting audio with FFmpeg…" },
        { phase: "Splitting audio with FFmpeg…" },
      );

      const { totalChunks, chunkFiles } = await runFFmpegChunking(
        this.env,
        sandbox,
        inputPath,
        r2ChunksDir,
        chunksDir,
        jobId,
      );

      this.log(`✅ FFmpeg complete: ${totalChunks} chunks created`);

      await this.syncState(
        { totalChunks, phase: "Sandbox released. Starting transcription…" },
        { totalChunks, phase: "Sandbox released. Starting transcription…" },
      );

      this.log("🗑️ Destroying Sandbox container (cost optimization)…");
      await destroySandbox(sandbox, (msg) => this.log(msg));
      sandboxDestroyed = true;

      await this.syncState({ status: "transcribing" }, { status: "transcribing" });

      const fullText = await processChunksWithWhisper(
        this.env,
        chunksDir,
        chunkFiles,
        totalChunks,
        jobId,
        recordingId,
        async (phase, completedChunks, progress, currentText) => {
          await this.syncState(
            { phase, completedChunks, progress, fullText: currentText },
            { phase, completedChunks, progress, fullText: currentText },
          );
        },
        (msg) => this.log(msg),
      );

      await this.syncState(
        { status: "complete", progress: 100, phase: "Transcription complete" },
        {
          status: "complete",
          progress: 100,
          phase: "Transcription complete",
          completedAt: new Date(),
        },
      );

      this.log(`🎉 Transcription complete! ${fullText.length} total characters`);

      this.log("🧹 Cleaning up R2 chunk files…");
      await cleanupR2Chunks(this.env, chunksDir, chunkFiles);
      this.log("✅ Cleanup complete");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("TranscriptionAgent error:", errorMsg);
      this.log(`❌ Error: ${errorMsg}`);

      await this.syncState(
        { status: "error", error: errorMsg },
        { status: "error", error: errorMsg },
      );

      if (recordingId) {
        const db = getDb(this.env);
        const [job] = await db
          .select({ podcastId: transcriptionJobs.podcastId })
          .from(transcriptionJobs)
          .where(eq(transcriptionJobs.id, jobId))
          .limit(1)
          .catch(() => []);

        if (job?.podcastId) {
          await db
            .update(rolePodcasts)
            .set({ status: "failed", updatedAt: new Date() })
            .where(eq(rolePodcasts.id, job.podcastId))
            .catch(() => {});
        } else {
          await db
            .update(interviewRecordings)
            .set({ transcriptionStatus: "failed" })
            .where(eq(interviewRecordings.id, recordingId))
            .catch(() => {});
        }
      }
    } finally {
      if (sandbox && !sandboxDestroyed) {
        await destroySandbox(sandbox, (msg) => this.log(msg));
      }
    }
  }
}
