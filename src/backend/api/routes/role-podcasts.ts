/**
 * @fileoverview Role podcast API routes.
 *
 * These endpoints expose the background NotebookLM podcast pipeline status and
 * stream completed audio from R2 for the role detail UI.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { desc, eq } from "drizzle-orm";

import { enqueueOrchestratorTask } from "@/backend/ai/agents/orchestrator";
import { getDb } from "@/backend/db";
import { rolePodcasts, roles } from "@/backend/db/schema";

const rolePodcastResponseSchema = z.object({
  id: z.string(),
  roleId: z.string(),
  status: z.string(),
  notebooklmSourceId: z.string().nullable(),
  notebooklmSourceFilename: z.string(),
  notebooklmChatResponse: z.string().nullable(),
  notebooklmArtifactId: z.string().nullable(),
  r2AudioKey: z.string().nullable(),
  driveAudioFileId: z.string().nullable(),
  driveAudioUrl: z.string().nullable(),
  driveTranscriptDocId: z.string().nullable(),
  driveTranscriptUrl: z.string().nullable(),
  transcriptionJobId: z.string().nullable(),
  transcriptText: z.string().nullable(),
  checkCount: z.number(),
  lastCheckedAt: z.string().nullable(),
  audioStreamUrl: z.string().nullable(),
  audioDownloadUrl: z.string().nullable(),
  stepErrors: z.array(
    z.object({
      step: z.string(),
      message: z.string(),
      at: z.string(),
    }),
  ),
});

export const rolePodcastsRouter = new OpenAPIHono<{ Bindings: Env }>();
export const rolePodcastAssetsRouter = new OpenAPIHono<{ Bindings: Env }>();

rolePodcastsRouter.openapi(
  createRoute({
    method: "get",
    path: "/:roleId/podcast",
    operationId: "getRolePodcast",
    responses: {
      200: {
        description: "Latest NotebookLM podcast pipeline state for a role",
        content: { "application/json": { schema: rolePodcastResponseSchema.nullable() } },
      },
    },
  }),
  (async (c: any) => {
    const roleId = c.req.param("roleId");
    const [podcast] = await getDb(c.env)
      .select()
      .from(rolePodcasts)
      .where(eq(rolePodcasts.roleId, roleId))
      .orderBy(desc(rolePodcasts.createdAt))
      .limit(1);

    if (!podcast) return c.json(null);
    return c.json(serializePodcast(podcast));
  }) as any,
);

rolePodcastsRouter.openapi(
  createRoute({
    method: "post",
    path: "/:roleId/podcast",
    operationId: "generateRolePodcast",
    responses: {
      200: {
        description: "Enqueued NotebookLM podcast pipeline for a role",
        content: { "application/json": { schema: z.object({ success: z.boolean() }) } },
      },
      404: {
        description: "Role not found",
      },
    },
  }),
  (async (c: any) => {
    const roleId = c.req.param("roleId");
    const db = getDb(c.env);
    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);

    if (!role) {
      return c.json({ error: "Role not found" }, 404);
    }

    const { Logger } = await import("@/backend/lib/logger");
    const logger = new Logger(c.env);
    await logger.info(`Generating podcast requested for role ${roleId}`);

    await enqueueOrchestratorTask(c.env, roleId, {
      type: "role_assets",
      roleId: roleId,
      payload: { mode: "podcast" },
    });

    return c.json({ success: true });
  }) as any,
);

rolePodcastAssetsRouter.openapi(
  createRoute({
    method: "get",
    path: "/:podcastId/stream",
    operationId: "streamRolePodcastAudio",
    responses: {
      200: { description: "Podcast audio stream" },
      206: { description: "Partial podcast audio stream" },
      404: { description: "Podcast audio not found" },
    },
  }),
  (async (c: any) => {
    return streamPodcastAudio(c);
  }) as any,
);

/** Serialize a D1 podcast row into the frontend API shape. */
function serializePodcast(podcast: typeof rolePodcasts.$inferSelect) {
  const audioStreamUrl = podcast.r2AudioKey ? `/api/role-podcasts/${podcast.id}/stream` : null;
  return {
    id: podcast.id,
    roleId: podcast.roleId,
    status: podcast.status,
    notebooklmSourceId: podcast.notebooklmSourceId,
    notebooklmSourceFilename: podcast.notebooklmSourceFilename,
    notebooklmChatResponse: podcast.notebooklmChatResponse,
    notebooklmArtifactId: podcast.notebooklmArtifactId,
    r2AudioKey: podcast.r2AudioKey,
    driveAudioFileId: podcast.driveAudioFileId,
    driveAudioUrl: podcast.driveAudioFileId
      ? `https://drive.google.com/file/d/${podcast.driveAudioFileId}/view`
      : null,
    driveTranscriptDocId: podcast.driveTranscriptDocId,
    driveTranscriptUrl: podcast.driveTranscriptDocId
      ? `https://docs.google.com/document/d/${podcast.driveTranscriptDocId}/edit`
      : null,
    transcriptionJobId: podcast.transcriptionJobId,
    transcriptText: podcast.transcriptText,
    checkCount: podcast.checkCount,
    lastCheckedAt: podcast.lastCheckedAt?.toISOString() ?? null,
    audioStreamUrl,
    audioDownloadUrl: audioStreamUrl ? `${audioStreamUrl}?download=1` : null,
    stepErrors: podcast.stepErrors ?? [],
  };
}

/** Stream a podcast audio object from R2 with HTTP range support. */
async function streamPodcastAudio(c: any) {
  const podcastId = c.req.param("podcastId");
  const [podcast] = await getDb(c.env)
    .select({ r2AudioKey: rolePodcasts.r2AudioKey })
    .from(rolePodcasts)
    .where(eq(rolePodcasts.id, podcastId))
    .limit(1);

  if (!podcast?.r2AudioKey) {
    return c.json({ error: "Podcast audio not found" }, 404);
  }

  const object = await c.env.R2_AUDIO_BUCKET.get(podcast.r2AudioKey);
  if (!object) {
    return c.json({ error: "Podcast audio not found" }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("content-type", headers.get("content-type") || "audio/mpeg");

  const download = new URL(c.req.url).searchParams.get("download") === "1";
  if (download) {
    headers.set("content-disposition", `attachment; filename="${podcastId}.mp3"`);
  }

  const range = c.req.header("range");
  if (!range) {
    headers.set("content-length", String(object.size));
    return new Response(object.body, { headers });
  }

  const parsed = parseRange(range, object.size);
  if (!parsed) {
    headers.set("content-range", `bytes */${object.size}`);
    return new Response(null, { status: 416, headers });
  }

  const partial = await c.env.R2_AUDIO_BUCKET.get(podcast.r2AudioKey, {
    range: { offset: parsed.start, length: parsed.end - parsed.start + 1 },
  });
  if (!partial) {
    return c.json({ error: "Podcast audio not found" }, 404);
  }

  headers.set("content-length", String(parsed.end - parsed.start + 1));
  headers.set("content-range", `bytes ${parsed.start}-${parsed.end}/${object.size}`);
  return new Response(partial.body, { status: 206, headers });
}

/** Parse a single HTTP Range header for R2 byte-range reads. */
function parseRange(rangeHeader: string, size: number): { start: number; end: number } | null {
  const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const [, startRaw, endRaw] = match;
  let start = startRaw ? Number(startRaw) : 0;
  let end = endRaw ? Number(endRaw) : size - 1;

  if (!startRaw && endRaw) {
    const suffixLength = Number(endRaw);
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < start ||
    start >= size
  ) {
    return null;
  }

  return { start, end: Math.min(end, size - 1) };
}
