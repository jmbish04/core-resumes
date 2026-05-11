/**
 * @fileoverview Durable role-asset pipeline powered by Cloudflare Workflows.
 *
 * The intake request should stay fast: this Workflow runs after a role is
 * created and handles slower, failure-prone integrations with Drive,
 * NotebookLM, R2, and the TranscriptionAgent. Each step persists progress into
 * `role_podcasts` so the role page can show exactly what is pending.
 */

import { getAgentByName } from "agents";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { eq } from "drizzle-orm";

import type { TranscriptionAgent } from "@/backend/ai/agents/transcription";

import { GoogleDriveClient } from "@/backend/ai/tools/google/drive";
import {
  downloadAudioArtifactBytes,
  findNewAudioArtifact,
  sendPodcastChatPrompt,
  snapshotAudioArtifactIds,
  uploadMarkdownSource,
} from "@/ai/tools/notebooklm/notebooklm-sources";
import { buildRoleMarkdown } from "@/ai/tools/role/markdown";
import { buildRolePodcastPrompt } from "@/ai/tools/role/podcast-prompt";
import { getDb } from "@/backend/db";
import { rolePodcasts, roles, transcriptionJobs } from "@/backend/db/schema";

/** Parameters passed when intake creates a role podcast workflow instance. */
export type RoleAssetsWorkflowParams = {
  /** D1 role ID created during intake. */
  roleId: string;
  /** D1 role_podcasts ID and Workflow instance ID. */
  podcastId: string;
  /** Markdown from successful scrape, when available. */
  scrapedMarkdown?: string;
  /** Raw HTML from successful scrape, when available. */
  scrapedHtml?: string;
  /** Markdown synthesized from manually entered fields, when scraping failed. */
  manualMarkdown?: string;
  /** Mode to run: "assets_only" uploads to Drive, "podcast" generates the podcast. Default is full pipeline (legacy). */
  mode?: "assets_only" | "podcast";
};

/** Serializable role fields required by later Workflow steps. */
type WorkflowRole = {
  id: string;
  companyName: string;
  jobTitle: string;
  jobPostingPdfUrl: string | null;
};

/** Shared mutable pipeline state carried between Workflow steps. */
type WorkflowState = {
  role: WorkflowRole;
  driveFolderId: string;
  markdown: string;
  roleSourceFileName: string;
  driveAssetFileIds: Record<string, string>;
  baselineArtifactIds: string[];
  artifactId?: string;
  r2AudioKey?: string;
  transcriptionJobId?: string;
};

/** Cloudflare Workflow that processes role assets after intake completes. */
export class RoleAssetsWorkflow extends WorkflowEntrypoint<Env, RoleAssetsWorkflowParams> {
  /**
   * Execute the role asset pipeline.
   *
   * The workflow is idempotent enough for step retries: D1 state is updated
   * after every external integration milestone, and each file upload produces
   * a new Drive file while retaining the latest file ID map.
   */
  async run(event: WorkflowEvent<RoleAssetsWorkflowParams>, step: WorkflowStep): Promise<void> {
    const params = event.payload;
    let state = await step.do("load role and prepare markdown", async () => this.loadState(params));

    if (params.mode !== "podcast") {
      state = await step.do("upload role assets to drive", async () =>
        this.uploadRoleAssets(params, state),
      );
    }

    if (params.mode === "assets_only") {
      return;
    }

    state = await step.do("upload notebooklm source", async () =>
      this.uploadNotebookSource(params, state),
    );
    state = await step.do("snapshot audio artifacts", async () =>
      this.snapshotArtifacts(params, state),
    );
    await step.do("trigger podcast through notebooklm chat", async () =>
      this.triggerPodcastChat(params, state),
    );

    state = await this.pollForPodcastArtifact(step, params, state);
    state = await step.do("download podcast audio", async () =>
      this.downloadPodcastAudio(params, state),
    );
    state = await step.do(
      "transcribe podcast audio",
      { retries: { limit: 1, delay: "10 seconds" }, timeout: "2 hours" },
      async () => this.transcribePodcast(params, state),
    );
    await step.do("create transcript google doc", async () =>
      this.createTranscriptDoc(params, state),
    );
  }

  /** Load the role, ensure a Drive folder exists, and derive markdown content. */
  private async loadState(params: RoleAssetsWorkflowParams): Promise<WorkflowState> {
    const db = getDb(this.env);
    const [role] = await db.select().from(roles).where(eq(roles.id, params.roleId)).limit(1);
    if (!role) {
      throw new NonRetryableError(`Role not found: ${params.roleId}`);
    }

    let driveFolderId = role.driveFolderId ?? "";
    if (!driveFolderId) {
      const folder = await new GoogleDriveClient(this.env).createFolder(
        `${role.companyName} - ${role.jobTitle}`,
        this.env.PARENT_DRIVE_FOLDER_ID,
      );
      driveFolderId = folder.id;
      await db
        .update(roles)
        .set({ driveFolderId, updatedAt: new Date() })
        .where(eq(roles.id, role.id));
    }

    const markdown =
      params.scrapedMarkdown?.trim() ||
      params.manualMarkdown?.trim() ||
      buildRoleMarkdown({
        companyName: role.companyName,
        jobTitle: role.jobTitle,
        jobUrl: role.jobUrl,
        salaryMin: role.salaryMin,
        salaryMax: role.salaryMax,
        salaryCurrency: role.salaryCurrency,
        roleInstructions: role.roleInstructions,
        metadata: role.metadata,
      });

    const roleSourceFileName = `role-${role.id}.md`;
    await this.updatePodcast(params.podcastId, {
      status: "uploading_assets",
      notebooklmSourceFilename: roleSourceFileName,
      updatedAt: new Date(),
    });

    return {
      role: {
        id: role.id,
        companyName: role.companyName,
        jobTitle: role.jobTitle,
        jobPostingPdfUrl: role.jobPostingPdfUrl,
      },
      driveFolderId,
      markdown,
      roleSourceFileName,
      driveAssetFileIds: {},
      baselineArtifactIds: [],
    };
  }

  /** Upload markdown, HTML, and PDF role artifacts to the role's Drive folder. */
  private async uploadRoleAssets(
    params: RoleAssetsWorkflowParams,
    state: WorkflowState,
  ): Promise<WorkflowState> {
    const drive = new GoogleDriveClient(this.env);
    const driveAssetFileIds = { ...state.driveAssetFileIds };

    const md = await drive.uploadFile(
      state.roleSourceFileName,
      state.driveFolderId,
      new TextEncoder().encode(state.markdown),
      "text/markdown",
    );
    driveAssetFileIds.markdown = md.id;

    if (params.scrapedHtml?.trim()) {
      const html = await drive.uploadFile(
        `role-${state.role.id}.html`,
        state.driveFolderId,
        new TextEncoder().encode(params.scrapedHtml),
        "text/html",
      );
      driveAssetFileIds.html = html.id;
    }

    const pdfKey = parseFilesRouteKey(state.role.jobPostingPdfUrl);
    if (pdfKey) {
      const pdf = await this.env.R2_FILES_BUCKET.get(pdfKey);
      if (pdf) {
        const uploadedPdf = await drive.uploadFile(
          `role-${state.role.id}.pdf`,
          state.driveFolderId,
          await pdf.arrayBuffer(),
          "application/pdf",
        );
        driveAssetFileIds.pdf = uploadedPdf.id;
      }
    }

    await this.updatePodcast(params.podcastId, {
      driveAssetFileIds,
      status: "indexing_source",
      updatedAt: new Date(),
    });

    return { ...state, driveAssetFileIds };
  }

  /** Upload markdown into NotebookLM and wait for source indexing to complete. */
  private async uploadNotebookSource(
    params: RoleAssetsWorkflowParams,
    state: WorkflowState,
  ): Promise<WorkflowState> {
    const result = await uploadMarkdownSource(this.env, {
      fileName: state.roleSourceFileName,
      markdown: state.markdown,
      waitTimeoutSecs: getNumberVar(this.env.ROLE_PODCAST_SOURCE_WAIT_SECS, 300),
    });

    await this.updatePodcast(params.podcastId, {
      notebooklmSourceId: result.sourceId,
      status: "awaiting_artifact",
      updatedAt: new Date(),
    });

    return state;
  }

  /** Store the current audio artifact IDs before prompting NotebookLM chat. */
  private async snapshotArtifacts(
    params: RoleAssetsWorkflowParams,
    state: WorkflowState,
  ): Promise<WorkflowState> {
    const baselineArtifactIds = await snapshotAudioArtifactIds(this.env);
    await this.updatePodcast(params.podcastId, {
      notebooklmArtifactIdBaseline: baselineArtifactIds,
      updatedAt: new Date(),
    });
    return { ...state, baselineArtifactIds };
  }

  /** Ask NotebookLM chat to start the custom podcast generation. */
  private async triggerPodcastChat(
    params: RoleAssetsWorkflowParams,
    state: WorkflowState,
  ): Promise<void> {
    const prompt = buildRolePodcastPrompt({
      roleSourceFileName: state.roleSourceFileName,
      companyName: state.role.companyName,
      jobTitle: state.role.jobTitle,
    });
    const result = await sendPodcastChatPrompt(this.env, prompt);
    await this.updatePodcast(params.podcastId, {
      notebooklmChatConversationId: result.conversationId,
      notebooklmChatResponse: result.answer,
      status: "awaiting_artifact",
      updatedAt: new Date(),
    });
  }

  /** Poll NotebookLM until a new audio artifact appears or configured cap expires. */
  private async pollForPodcastArtifact(
    step: WorkflowStep,
    params: RoleAssetsWorkflowParams,
    state: WorkflowState,
  ): Promise<WorkflowState> {
    const maxPolls = getNumberVar(this.env.ROLE_PODCAST_MAX_POLLS, 36);
    const interval = this.env.ROLE_PODCAST_POLL_INTERVAL || "5 minutes";

    for (let i = 0; i < maxPolls; i += 1) {
      const artifactId = await step.do(
        `check podcast artifact ${i + 1}`,
        { retries: { limit: 1, delay: "1 second" }, timeout: "2 minutes" },
        async () => {
          const found = await findNewAudioArtifact(this.env, state.baselineArtifactIds);
          const [row] = await getDb(this.env)
            .select({ checkCount: rolePodcasts.checkCount })
            .from(rolePodcasts)
            .where(eq(rolePodcasts.id, params.podcastId))
            .limit(1);
          await this.updatePodcast(params.podcastId, {
            checkCount: (row?.checkCount ?? i) + 1,
            lastCheckedAt: new Date(),
            updatedAt: new Date(),
          });
          return found?.id ?? null;
        },
      );

      if (artifactId) {
        await this.updatePodcast(params.podcastId, {
          notebooklmArtifactId: artifactId,
          status: "downloading",
          updatedAt: new Date(),
        });
        return { ...state, artifactId };
      }

      await step.sleep(`wait for podcast artifact ${i + 1}`, interval);
    }

    await this.failPodcast(
      params.podcastId,
      "poll_for_artifact",
      `No NotebookLM audio artifact appeared after ${maxPolls} checks.`,
    );
    throw new NonRetryableError(`No NotebookLM audio artifact appeared after ${maxPolls} checks.`);
  }

  /** Download NotebookLM audio, then persist it to R2 and Google Drive. */
  private async downloadPodcastAudio(
    params: RoleAssetsWorkflowParams,
    state: WorkflowState,
  ): Promise<WorkflowState> {
    if (!state.artifactId)
      throw new NonRetryableError("Missing NotebookLM artifact ID before download.");

    const bytes = await downloadAudioArtifactBytes(this.env, state.artifactId);
    const r2AudioKey = `podcasts/${state.role.id}/${params.podcastId}.mp3`;
    await this.env.R2_AUDIO_BUCKET.put(r2AudioKey, bytes, {
      httpMetadata: { contentType: "audio/mpeg" },
      customMetadata: {
        roleId: state.role.id,
        podcastId: params.podcastId,
        notebooklmArtifactId: state.artifactId,
      },
    });

    const driveAudio = await new GoogleDriveClient(this.env).uploadFile(
      `NotebookLM Podcast - ${state.role.companyName} - ${state.role.jobTitle}.mp3`,
      state.driveFolderId,
      bytes,
      "audio/mpeg",
    );

    await this.updatePodcast(params.podcastId, {
      r2AudioKey,
      driveAudioFileId: driveAudio.id,
      status: "transcribing",
      updatedAt: new Date(),
    });

    return { ...state, r2AudioKey };
  }

  /** Insert a transcription job and run the existing TranscriptionAgent pipeline. */
  private async transcribePodcast(
    params: RoleAssetsWorkflowParams,
    state: WorkflowState,
  ): Promise<WorkflowState> {
    if (!state.r2AudioKey)
      throw new NonRetryableError("Missing R2 audio key before transcription.");

    const db = getDb(this.env);
    const jobId = crypto.randomUUID();
    await db.insert(transcriptionJobs).values({
      id: jobId,
      podcastId: params.podcastId,
      recordingId: null,
      roleId: state.role.id,
      status: "pending",
      phase: "Queued for podcast transcription",
      progress: 0,
      r2Key: state.r2AudioKey,
    });
    await this.updatePodcast(params.podcastId, {
      transcriptionJobId: jobId,
      status: "transcribing",
      updatedAt: new Date(),
    });

    const stub = await getAgentByName<Env, TranscriptionAgent>(
      this.env.TRANSCRIPTION_AGENT as any,
      params.podcastId,
    );
    await stub.transcribe(state.r2AudioKey, params.podcastId, state.role.id, jobId);

    return { ...state, transcriptionJobId: jobId };
  }

  /** Create a native Google Doc transcript and mark the pipeline complete. */
  private async createTranscriptDoc(
    params: RoleAssetsWorkflowParams,
    state: WorkflowState,
  ): Promise<void> {
    const db = getDb(this.env);
    const [job] = await db
      .select({ fullText: transcriptionJobs.fullText, status: transcriptionJobs.status })
      .from(transcriptionJobs)
      .where(eq(transcriptionJobs.id, state.transcriptionJobId ?? ""))
      .limit(1);

    if (!job || job.status !== "complete") {
      await this.failPodcast(
        params.podcastId,
        "create_transcript_doc",
        "Transcription job did not complete.",
      );
      throw new NonRetryableError("Transcription job did not complete.");
    }

    const doc = await new GoogleDriveClient(this.env).createDocFromText(
      `NotebookLM Podcast Transcript - ${state.role.companyName} - ${state.role.jobTitle}`,
      state.driveFolderId,
      job.fullText ?? "",
    );

    await this.updatePodcast(params.podcastId, {
      transcriptText: job.fullText ?? "",
      driveTranscriptDocId: doc.id,
      status: "complete",
      updatedAt: new Date(),
    });
  }

  /** Merge new fields into the podcast row. */
  private async updatePodcast(
    podcastId: string,
    values: Partial<typeof rolePodcasts.$inferInsert>,
  ): Promise<void> {
    await getDb(this.env).update(rolePodcasts).set(values).where(eq(rolePodcasts.id, podcastId));
  }

  /** Persist a terminal workflow failure without masking the original error. */
  private async failPodcast(podcastId: string, step: string, message: string): Promise<void> {
    const db = getDb(this.env);
    const [row] = await db
      .select({ stepErrors: rolePodcasts.stepErrors })
      .from(rolePodcasts)
      .where(eq(rolePodcasts.id, podcastId))
      .limit(1);
    await db
      .update(rolePodcasts)
      .set({
        status: "failed",
        stepErrors: [...(row?.stepErrors ?? []), { step, message, at: new Date().toISOString() }],
        updatedAt: new Date(),
      })
      .where(eq(rolePodcasts.id, podcastId));
  }
}

/** Extract an R2 key from the Worker-served `/api/files/<key>` URL. */
function parseFilesRouteKey(value?: string | null): string | null {
  if (!value) return null;
  const marker = "/api/files/";
  const idx = value.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(value.slice(idx + marker.length));
}

/** Parse numeric Worker env vars while preserving defaults for invalid input. */
function getNumberVar(value: string | number | undefined, fallback: number): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
