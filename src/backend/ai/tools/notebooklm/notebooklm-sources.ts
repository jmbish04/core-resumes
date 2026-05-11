/**
 * @fileoverview NotebookLM source and artifact helpers for role intake assets.
 *
 * These helpers intentionally reuse the same cookie-based client construction
 * as chat consultation while avoiding agent-rule injection. The role podcast
 * prompt must be sent verbatim so NotebookLM can interpret it as an artifact
 * creation request tied to the uploaded role source.
 */

import type { Artifact, NotebookLMClient } from "notebooklm-sdk";

import { Buffer } from "node:buffer";

import { createNotebookClient, isAuthError, SessionExpiredError } from "./notebooklm";

/** Callback executed with an authenticated NotebookLM client and notebook ID. */
export type NotebookClientCallback<T> = (
  client: NotebookLMClient,
  notebookId: string,
) => Promise<T>;

/**
 * Execute NotebookLM SDK work with shared auth and auth-error normalization.
 *
 * This is intentionally small: callers decide whether to use chat, sources, or
 * artifacts APIs, while this wrapper keeps cookie handling and recovery errors
 * consistent with `consultNotebook`.
 */
export async function withNotebookClient<T>(
  env: Env,
  callback: NotebookClientCallback<T>,
): Promise<T> {
  try {
    const client = await createNotebookClient(env);
    return await callback(client, env.CAREER_NOTEBOOKLM_ID);
  } catch (error) {
    if (isAuthError(error)) {
      throw new SessionExpiredError(error);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// MD5 hashing for deduplication
// ---------------------------------------------------------------------------

/** Compute an MD5-like hex hash of content using Web Crypto SHA-256 (MD5 not available). */
export async function computeContentHash(content: string): Promise<string> {
  const data = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Source management
// ---------------------------------------------------------------------------

/** Options for uploading a role markdown file as a NotebookLM source. */
export type UploadMarkdownSourceOptions = {
  /** Filename visible inside NotebookLM, e.g. `<uuid>.md`. */
  fileName: string;
  /** Markdown content generated from scrape output or user-entered role fields. */
  markdown: string;
  /** SDK wait timeout in seconds. Defaults to five minutes. */
  waitTimeoutSecs?: number;
};

/**
 * Upload a role markdown document to NotebookLM and wait for indexing to finish.
 *
 * NotebookLM does not expose a markdown-specific helper, so we upload bytes as
 * a `text/markdown` file via `addFileBuffer` and explicitly poll source status.
 */
export async function uploadMarkdownSource(
  env: Env,
  opts: UploadMarkdownSourceOptions,
): Promise<{ sourceId: string; title: string | null; status: string }> {
  return withNotebookClient(env, async (client, notebookId) => {
    const uploaded = await client.sources.addFileBuffer(
      notebookId,
      Buffer.from(opts.markdown, "utf8"),
      opts.fileName,
      "text/markdown",
      { waitUntilReady: false },
    );

    const ready = await client.sources.waitUntilReady(
      notebookId,
      uploaded.id,
      opts.waitTimeoutSecs ?? 300,
      2,
    );

    return { sourceId: ready.id, title: ready.title, status: ready.status };
  });
}

/** Upload a plain text source to NotebookLM. */
export async function uploadTextSource(
  env: Env,
  content: string,
  title: string,
): Promise<{ sourceId: string }> {
  return withNotebookClient(env, async (client, notebookId) => {
    const source = await client.sources.addText(notebookId, content, title);
    await client.sources.waitUntilReady(notebookId, source.id, 300, 2);
    return { sourceId: source.id };
  });
}

/** Upload a URL source to NotebookLM for crawling. */
export async function uploadUrlSource(
  env: Env,
  url: string,
): Promise<{ sourceId: string }> {
  return withNotebookClient(env, async (client, notebookId) => {
    const source = await client.sources.addUrl(notebookId, url);
    await client.sources.waitUntilReady(notebookId, source.id, 300, 2);
    return { sourceId: source.id };
  });
}

/** List all sources currently in the NotebookLM notebook. */
export async function listSources(env: Env) {
  return withNotebookClient(env, async (client, notebookId) => {
    return client.sources.list(notebookId);
  });
}

/** Delete a source from NotebookLM by its source ID. */
export async function deleteSource(env: Env, sourceId: string): Promise<void> {
  return withNotebookClient(env, async (client, notebookId) => {
    await client.sources.delete(notebookId, sourceId);
  });
}

// ---------------------------------------------------------------------------
// Audio artifact helpers (existing)
// ---------------------------------------------------------------------------

/**
 * Capture the set of audio artifacts that already exist before a podcast prompt.
 */
export async function snapshotAudioArtifactIds(env: Env): Promise<string[]> {
  return withNotebookClient(env, async (client, notebookId) => {
    const artifacts = await client.artifacts.listAudio(notebookId);
    return artifacts.map((artifact) => artifact.id);
  });
}

/**
 * Find a newly-created audio artifact by diffing against a pre-prompt baseline.
 */
export async function findNewAudioArtifact(
  env: Env,
  baselineArtifactIds: string[],
): Promise<Artifact | null> {
  const baseline = new Set(baselineArtifactIds);
  return withNotebookClient(env, async (client, notebookId) => {
    const artifacts = await client.artifacts.listAudio(notebookId);
    return artifacts.find((artifact) => !baseline.has(artifact.id)) ?? null;
  });
}

/**
 * Download a completed NotebookLM audio artifact as Worker-compatible bytes.
 */
export async function downloadAudioArtifactBytes(
  env: Env,
  artifactId: string,
): Promise<ArrayBuffer> {
  return withNotebookClient(env, async (client, notebookId) => {
    const buffer = await client.artifacts.downloadAudio(notebookId, artifactId);
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
  });
}

/**
 * Send the custom podcast creation prompt through NotebookLM chat.
 *
 * The SDK currently returns only chat conversation data here; the generated
 * podcast artifact is discovered later by polling audio artifacts.
 */
export async function sendPodcastChatPrompt(
  env: Env,
  prompt: string,
): Promise<{ answer: string; conversationId: string; turnNumber: number }> {
  return withNotebookClient(env, async (client, notebookId) => {
    const result = await client.chat.ask(notebookId, prompt);
    return {
      answer: result.answer,
      conversationId: result.conversationId,
      turnNumber: result.turnNumber,
    };
  });
}

// ---------------------------------------------------------------------------
// Generic artifact helpers
// ---------------------------------------------------------------------------

/** List all artifacts in the notebook. */
export async function listArtifacts(env: Env): Promise<Artifact[]> {
  return withNotebookClient(env, async (client, notebookId) => {
    return client.artifacts.list(notebookId);
  });
}

/** List artifacts filtered by type. */
export async function listArtifactsByType(
  env: Env,
  type: "audio" | "video" | "reports" | "quizzes" | "flashcards" | "infographics" | "slideDecks" | "dataTables",
): Promise<Artifact[]> {
  return withNotebookClient(env, async (client, notebookId) => {
    switch (type) {
      case "audio":
        return client.artifacts.listAudio(notebookId);
      case "video":
        return client.artifacts.listVideo(notebookId);
      case "reports":
        return client.artifacts.listReports(notebookId);
      case "quizzes":
        return client.artifacts.listQuizzes(notebookId);
      case "flashcards":
        return client.artifacts.listFlashcards(notebookId);
      case "infographics":
        return client.artifacts.listInfographics(notebookId);
      case "slideDecks":
        return client.artifacts.listSlideDecks(notebookId);
      case "dataTables":
        return client.artifacts.listDataTables(notebookId);
      default:
        return client.artifacts.list(notebookId);
    }
  });
}

/** Poll an artifact until it's ready, with a configurable timeout. */
export async function waitForArtifact(
  env: Env,
  artifactId: string,
  timeoutSecs = 1800,
  intervalSecs = 15,
): Promise<Artifact> {
  return withNotebookClient(env, async (client, notebookId) => {
    return client.artifacts.waitUntilReady(notebookId, artifactId, timeoutSecs, intervalSecs);
  });
}

/** Check the current status of an artifact without waiting. */
export async function pollArtifactStatus(
  env: Env,
  artifactId: string,
): Promise<{ artifactId: string; status: string }> {
  return withNotebookClient(env, async (client, notebookId) => {
    const result = await client.artifacts.pollStatus(notebookId, artifactId);
    return { artifactId: result.artifactId ?? artifactId, status: result.status ?? "unknown" };
  });
}

// ---------------------------------------------------------------------------
// Artifact creation helpers
// ---------------------------------------------------------------------------

/** Create a mind map artifact. Returns the created note with JSON content. */
export async function createMindMap(env: Env) {
  return withNotebookClient(env, async (client, notebookId) => {
    return client.artifacts.createMindMap(notebookId);
  });
}

// ---------------------------------------------------------------------------
// Artifact download helpers
// ---------------------------------------------------------------------------

/** Download a video artifact as bytes. */
export async function downloadVideoArtifactBytes(env: Env, artifactId: string): Promise<ArrayBuffer> {
  return withNotebookClient(env, async (client, notebookId) => {
    const buffer = await client.artifacts.downloadVideo(notebookId, artifactId);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  });
}

/** Download a slide deck artifact as PDF or PPTX bytes. */
export async function downloadSlideDeckBytes(
  env: Env,
  artifactId: string,
  format: "pdf" | "pptx" = "pdf",
): Promise<ArrayBuffer> {
  return withNotebookClient(env, async (client, notebookId) => {
    const buffer = await client.artifacts.downloadSlideDeck(notebookId, artifactId, format);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  });
}

/** Download an infographic artifact as PNG bytes. */
export async function downloadInfographicBytes(env: Env, artifactId: string): Promise<ArrayBuffer> {
  return withNotebookClient(env, async (client, notebookId) => {
    const buffer = await client.artifacts.downloadInfographic(notebookId, artifactId);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  });
}

/** Get a report artifact as markdown string. */
export async function getReportMarkdown(env: Env, artifactId: string): Promise<string> {
  return withNotebookClient(env, async (client, notebookId) => {
    return (await client.artifacts.getReportMarkdown(notebookId, artifactId)) ?? "";
  });
}

/** Get interactive HTML for quiz/flashcard artifacts. */
export async function getInteractiveHtml(env: Env, artifactId: string): Promise<string> {
  return withNotebookClient(env, async (client, notebookId) => {
    return (await client.artifacts.getInteractiveHtml(notebookId, artifactId)) ?? "";
  });
}

/** Get data table content (headers + rows). */
export async function getDataTableContent(
  env: Env,
  artifactId: string,
): Promise<{ headers: string[]; rows: string[][] } | null> {
  return withNotebookClient(env, async (client, notebookId) => {
    return client.artifacts.getDataTableContent(notebookId, artifactId);
  });
}

/** Export a report artifact to Google Drive as a Google Doc. */
export async function exportReportToDrive(
  env: Env,
  artifactId: string,
  title: string,
): Promise<string> {
  return withNotebookClient(env, async (client, notebookId) => {
    return (await client.artifacts.exportReport(notebookId, artifactId, title)) ?? "";
  });
}

/** Export a data table artifact to Google Drive as a Google Sheet. */
export async function exportDataTableToDrive(
  env: Env,
  artifactId: string,
  title: string,
): Promise<string> {
  return withNotebookClient(env, async (client, notebookId) => {
    return (await client.artifacts.exportDataTable(notebookId, artifactId, title)) ?? "";
  });
}

// ---------------------------------------------------------------------------
// Deep Research
// ---------------------------------------------------------------------------

/** Start a deep research session in the notebook. */
export async function startResearch(
  env: Env,
  query: string,
  source: "web" | "drive" = "web",
  mode: "fast" | "deep" = "deep",
) {
  return withNotebookClient(env, async (client, notebookId) => {
    return client.research.start(notebookId, query, source, mode);
  });
}

/** Poll research status until complete. */
export async function pollResearch(env: Env) {
  return withNotebookClient(env, async (client, notebookId) => {
    return client.research.poll(notebookId);
  });
}

/** Import research results as notebook sources. */
export async function importResearchSources(
  env: Env,
  taskId: string,
  sources: any[],
) {
  return withNotebookClient(env, async (client, notebookId) => {
    return client.research.importSources(notebookId, taskId, sources);
  });
}

// ---------------------------------------------------------------------------
// Chat configuration
// ---------------------------------------------------------------------------

/** Configure the chat mode for the notebook. */
export async function setChatMode(
  env: Env,
  mode: "DEFAULT" | "CONCISE" | "DETAILED" | "LEARNING_GUIDE",
) {
  return withNotebookClient(env, async (client, notebookId) => {
    const { ChatMode } = await import("notebooklm-sdk");
    const modeMap: Record<string, any> = {
      DEFAULT: ChatMode.DEFAULT,
      CONCISE: ChatMode.CONCISE,
      DETAILED: ChatMode.DETAILED,
      LEARNING_GUIDE: ChatMode.LEARNING_GUIDE,
    };
    return client.chat.setMode(notebookId, modeMap[mode]);
  });
}

/** Get conversation turns for a specific conversation. */
export async function getConversationTurns(env: Env, conversationId: string) {
  return withNotebookClient(env, async (client, notebookId) => {
    return client.chat.getConversationTurns(notebookId, conversationId);
  });
}

/** Get chat history for the notebook. */
export async function getChatHistory(env: Env, limit?: number, conversationId?: string) {
  return withNotebookClient(env, async (client, notebookId) => {
    return client.chat.getHistory(notebookId, limit, conversationId);
  });
}

// ---------------------------------------------------------------------------
// Notes management
// ---------------------------------------------------------------------------

/** List all user-created text notes in the notebook. */
export async function listNotes(env: Env) {
  return withNotebookClient(env, async (client, notebookId) => {
    return client.notes.list(notebookId);
  });
}

/** List mind maps in the notebook. */
export async function listMindMaps(env: Env) {
  return withNotebookClient(env, async (client, notebookId) => {
    return client.notes.listMindMaps(notebookId);
  });
}

/** Delete a note from the notebook. */
export async function deleteNote(env: Env, noteId: string) {
  return withNotebookClient(env, async (client, notebookId) => {
    return client.notes.delete(notebookId, noteId);
  });
}

/** Delete a mind map from the notebook. */
export async function deleteMindMap(env: Env, mindMapId: string) {
  return withNotebookClient(env, async (client, notebookId) => {
    return client.notes.deleteMindMap(notebookId, mindMapId);
  });
}

