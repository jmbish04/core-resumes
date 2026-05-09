/**
 * @fileoverview Interview Recordings routes — upload m4a audio to R2 and
 * delegate transcription to the TranscriptionAgent Durable Object.
 *
 * Accepts multipart/form-data with an `audio` field. The file is persisted
 * to R2 under `interviews/audio-{roleId}-{id}.m4a`, a transcription job is
 * created in D1, and the response returns immediately with `pending` status.
 * The frontend then connects to the TranscriptionAgent via WebSocket to
 * trigger and track transcription progress in real-time.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, desc, eq } from "drizzle-orm";

import { getDb } from "../../db";
import {
  interviewNotes,
  interviewRecordings,
  transcriptionJobs,
  selectInterviewRecordingSchema,
} from "../../db/schema";

const roleIdParam = z.object({ roleId: z.string() });
const recordingIdParam = z.object({ roleId: z.string(), recordingId: z.string() });

export const interviewRecordingsRouter = new OpenAPIHono<{ Bindings: Env }>();

// POST /:roleId/recordings — upload audio to R2 and create transcription job
interviewRecordingsRouter.post("/:roleId/recordings", async (c) => {
  const roleId = c.req.param("roleId");
  const body = await c.req.parseBody();
  const audioFile = body.audio;

  if (!audioFile || !(audioFile instanceof File)) {
    return c.json({ error: "Missing or invalid 'audio' field in multipart form" }, 400);
  }

  const db = getDb(c.env);
  const recordingId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const r2Key = `interviews/audio-${roleId}-${recordingId}.m4a`;
  const arrayBuffer = await audioFile.arrayBuffer();

  // 1. Persist to R2
  if (c.env.R2_AUDIO_BUCKET) {
    await c.env.R2_AUDIO_BUCKET.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: audioFile.type || "audio/mp4" },
    }).catch((err: unknown) => {
      console.error("R2 upload failed (non-fatal):", err);
    });
  }

  // 2. Insert recording record (pending — Agent handles transcription)
  await db.insert(interviewRecordings).values({
    id: recordingId,
    roleId,
    r2Key,
    originalFilename: audioFile.name || "recording.m4a",
    transcriptionStatus: "pending",
  });

  // 3. Insert transcription job for D1 persistence & observability
  await db.insert(transcriptionJobs).values({
    id: jobId,
    recordingId,
    roleId,
    r2Key,
    status: "pending",
    phase: "Awaiting agent connection…",
  });

  // 4. Return immediately — frontend connects to TranscriptionAgent to start work
  return c.json(
    {
      id: recordingId,
      r2Key,
      jobId,
      transcriptionStatus: "pending",
    },
    201,
  );
});

// GET /:roleId/recordings — list recordings for a role
interviewRecordingsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{roleId}/recordings",
    operationId: "interviewRecordingsList",
    request: { params: roleIdParam },
    responses: {
      200: {
        description: "List recordings for a role",
        content: { "application/json": { schema: z.array(selectInterviewRecordingSchema) } },
      },
    },
  }),
  async (c) => {
    const { roleId } = c.req.valid("param");
    const rows = await getDb(c.env)
      .select()
      .from(interviewRecordings)
      .where(eq(interviewRecordings.roleId, roleId))
      .orderBy(desc(interviewRecordings.createdAt));

    return c.json(rows);
  },
);

// GET /:roleId/recordings/:recordingId — single recording
interviewRecordingsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{roleId}/recordings/{recordingId}",
    operationId: "interviewRecordingsGet",
    request: { params: recordingIdParam },
    responses: {
      200: {
        description: "Get recording with transcription",
        content: { "application/json": { schema: selectInterviewRecordingSchema } },
      },
      404: { description: "Recording not found" },
    },
  }),
  async (c) => {
    const { roleId, recordingId } = c.req.valid("param");
    const [recording] = await getDb(c.env)
      .select()
      .from(interviewRecordings)
      .where(and(eq(interviewRecordings.id, recordingId), eq(interviewRecordings.roleId, roleId)))
      .limit(1);

    return recording ? c.json(recording) : c.json({ error: "Recording not found" }, 404);
  },
);

// POST /:roleId/recordings/:recordingId/merge — merge transcription into a note
interviewRecordingsRouter.post("/:roleId/recordings/:recordingId/merge", async (c) => {
  const roleId = c.req.param("roleId");
  const recordingId = c.req.param("recordingId");
  const { noteId } = (await c.req.json()) as { noteId: string };
  const db = getDb(c.env);

  // Fetch recording
  const [recording] = await db
    .select()
    .from(interviewRecordings)
    .where(and(eq(interviewRecordings.id, recordingId), eq(interviewRecordings.roleId, roleId)))
    .limit(1);

  if (!recording || !recording.transcription) {
    return c.json({ error: "Recording not found or not yet transcribed" }, 404);
  }

  // Fetch target note
  const [note] = await db
    .select()
    .from(interviewNotes)
    .where(and(eq(interviewNotes.id, noteId), eq(interviewNotes.roleId, roleId)))
    .limit(1);

  if (!note) {
    return c.json({ error: "Target note not found" }, 404);
  }

  // Append transcription as new blocks to the note content
  const existingContent = (note.content ?? []) as Record<string, unknown>[];
  const transcriptionBlocks: Record<string, unknown>[] = [
    { type: "h3", children: [{ text: `📝 Transcription — ${recording.originalFilename}` }] },
    ...recording.transcription
      .split("\n")
      .filter(Boolean)
      .map((line) => ({
        type: "p" as const,
        children: [{ text: line }],
      })),
    { type: "p", children: [{ text: "" }] },
  ];

  const mergedContent = [...existingContent, ...transcriptionBlocks];

  await db
    .update(interviewNotes)
    .set({ content: mergedContent, updatedAt: new Date() })
    .where(eq(interviewNotes.id, noteId));

  // Link recording to note
  await db
    .update(interviewRecordings)
    .set({ noteId })
    .where(eq(interviewRecordings.id, recordingId));

  return c.json({ ok: true, noteId, blocksAdded: transcriptionBlocks.length });
});

// DELETE /:roleId/recordings/:recordingId — delete recording and R2 object
interviewRecordingsRouter.openapi(
  createRoute({
    method: "delete",
    path: "/{roleId}/recordings/{recordingId}",
    operationId: "interviewRecordingsDelete",
    request: { params: recordingIdParam },
    responses: {
      200: {
        description: "Deleted recording",
        content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
      },
    },
  }),
  async (c) => {
    const { roleId, recordingId } = c.req.valid("param");
    const db = getDb(c.env);

    // Fetch the recording to get R2 key
    const [recording] = await db
      .select()
      .from(interviewRecordings)
      .where(and(eq(interviewRecordings.id, recordingId), eq(interviewRecordings.roleId, roleId)))
      .limit(1);

    if (recording && c.env.R2_AUDIO_BUCKET) {
      await c.env.R2_AUDIO_BUCKET.delete(recording.r2Key).catch((err: unknown) => {
        console.error("R2 delete failed (non-fatal):", err);
      });
    }

    await db
      .delete(interviewRecordings)
      .where(and(eq(interviewRecordings.id, recordingId), eq(interviewRecordings.roleId, roleId)));

    return c.json({ ok: true });
  },
);
