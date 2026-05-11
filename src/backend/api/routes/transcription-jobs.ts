/**
 * @fileoverview Transcription Jobs API — list and inspect transcription jobs
 * and their per-chunk details from D1.
 *
 * These routes serve the /transcriptions frontend page, providing historical
 * state that persists beyond the TranscriptionAgent Durable Object lifecycle.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { desc, eq } from "drizzle-orm";

import { getDb } from "../../db";
import {
  transcriptionJobs,
  transcriptionChunks,
  interviewRecordings,
  roles,
  selectTranscriptionJobSchema,
  selectTranscriptionChunkSchema,
} from "../../db/schema";

export const transcriptionJobsRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /api/transcription-jobs — list all jobs
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  roleId: z.string().optional(),
  status: z.string().optional(),
});

transcriptionJobsRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    operationId: "transcriptionJobsList",
    request: { query: listQuerySchema },
    responses: {
      200: {
        description: "List all transcription jobs with recording metadata",
        content: {
          "application/json": {
            schema: z.object({
              jobs: z.array(
                z.object({
                  ...selectTranscriptionJobSchema.shape,
                  recordingFilename: z.string().nullable(),
                  companyName: z.string().nullable(),
                  jobTitle: z.string().nullable(),
                }),
              ),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { roleId, status } = c.req.valid("query");
    const db = getDb(c.env);

    // Build query with joins for recording + role metadata
    let query = db
      .select({
        id: transcriptionJobs.id,
        recordingId: transcriptionJobs.recordingId,
        podcastId: transcriptionJobs.podcastId,
        roleId: transcriptionJobs.roleId,
        status: transcriptionJobs.status,
        phase: transcriptionJobs.phase,
        progress: transcriptionJobs.progress,
        totalChunks: transcriptionJobs.totalChunks,
        completedChunks: transcriptionJobs.completedChunks,
        fullText: transcriptionJobs.fullText,
        error: transcriptionJobs.error,
        r2Key: transcriptionJobs.r2Key,
        createdAt: transcriptionJobs.createdAt,
        updatedAt: transcriptionJobs.updatedAt,
        completedAt: transcriptionJobs.completedAt,
        recordingFilename: interviewRecordings.originalFilename,
        companyName: roles.companyName,
        jobTitle: roles.jobTitle,
      })
      .from(transcriptionJobs)
      .leftJoin(interviewRecordings, eq(transcriptionJobs.recordingId, interviewRecordings.id))
      .leftJoin(roles, eq(transcriptionJobs.roleId, roles.id))
      .orderBy(desc(transcriptionJobs.createdAt));

    // Apply filters
    const conditions = [];
    if (roleId) conditions.push(eq(transcriptionJobs.roleId, roleId));
    if (status)
      conditions.push(
        eq(transcriptionJobs.status, status as typeof transcriptionJobs.$inferSelect.status),
      );

    const results =
      conditions.length > 0
        ? await query.where(conditions.length === 1 ? conditions[0]! : conditions[0]!)
        : await query;

    return c.json({ jobs: results });
  },
);

// ---------------------------------------------------------------------------
// GET /api/transcription-jobs/:jobId — single job with chunks
// ---------------------------------------------------------------------------

transcriptionJobsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{jobId}",
    operationId: "transcriptionJobsGet",
    request: {
      params: z.object({ jobId: z.string() }),
    },
    responses: {
      200: {
        description: "Get transcription job with all chunk details",
        content: {
          "application/json": {
            schema: z.object({
              job: selectTranscriptionJobSchema,
              chunks: z.array(selectTranscriptionChunkSchema),
            }),
          },
        },
      },
      404: { description: "Job not found" },
    },
  }),
  async (c) => {
    const { jobId } = c.req.valid("param");
    const db = getDb(c.env);

    const [job] = await db
      .select()
      .from(transcriptionJobs)
      .where(eq(transcriptionJobs.id, jobId))
      .limit(1);

    if (!job) {
      return c.json({ error: "Transcription job not found" }, 404);
    }

    const chunks = await db
      .select()
      .from(transcriptionChunks)
      .where(eq(transcriptionChunks.jobId, jobId))
      .orderBy(transcriptionChunks.chunkIndex);

    return c.json({ job, chunks });
  },
);

// ---------------------------------------------------------------------------
// GET /api/transcription-jobs/:jobId/chunks — list chunks only
// ---------------------------------------------------------------------------

transcriptionJobsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{jobId}/chunks",
    operationId: "transcriptionJobsChunks",
    request: {
      params: z.object({ jobId: z.string() }),
    },
    responses: {
      200: {
        description: "List chunks for a transcription job",
        content: {
          "application/json": {
            schema: z.object({
              chunks: z.array(selectTranscriptionChunkSchema),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { jobId } = c.req.valid("param");
    const db = getDb(c.env);

    const chunks = await db
      .select()
      .from(transcriptionChunks)
      .where(eq(transcriptionChunks.jobId, jobId))
      .orderBy(transcriptionChunks.chunkIndex);

    return c.json({ chunks });
  },
);
