/**
 * @fileoverview Notebook API router — proxies user chat queries to the
 * NotebookLM career knowledge base via `consultNotebook()`.
 *
 * The route runs behind the global session-cookie auth middleware so only
 * logged-in users can access it.  Each request is a stateless HTTP round-trip;
 * there is no WebSocket requirement because the NotebookLM SDK returns
 * complete answers synchronously (no streaming).
 *
 * Route:
 *   POST /api/notebook/chat  →  { answer, conversationId, turnNumber, references }
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import {
  consultNotebook,
  SessionExpiredError,
  type NotebookConsultation,
} from "../../ai/tools/notebooklm/notebooklm";

// ---------------------------------------------------------------------------
// Request / response Zod schemas
// ---------------------------------------------------------------------------

/** Body schema for the chat endpoint. */
const chatBody = z.object({
  /** Natural-language question about the user's career, experience, or skills. */
  query: z.string().min(1),
  /** Optional conversation ID to continue a multi-turn session (reserved for future use). */
  conversationId: z.string().optional(),
});

/** Response schema matching the {@link NotebookConsultation} type. */
const chatResponse = z.object({
  /** The NotebookLM answer text. */
  answer: z.string(),
  /** Conversation identifier for multi-turn tracking. */
  conversationId: z.string(),
  /** Sequential turn number within the conversation. */
  turnNumber: z.number(),
  /** Source references cited by NotebookLM in its answer. */
  references: z.array(
    z
      .object({
        sourceId: z.string().optional(),
        sourceTitle: z.string().optional(),
        snippet: z.string().optional(),
      })
      .passthrough(),
  ),
});

const sessionExpiredResponse = z.object({
  error: z.literal("SESSION_EXPIRED"),
  message: z.string(),
  recoveryCommand: z.string(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/** Hono OpenAPI router for `/api/notebook` endpoints. */
export const notebookRouter = new OpenAPIHono<{ Bindings: Env }>();

/**
 * POST /api/notebook/chat
 *
 * Accepts a `{ query }` body, calls `consultNotebook()` (which reads agent
 * rules from D1, constructs a NotebookLM SDK client, and sends the guarded
 * query), then returns the answer with source references.
 *
 * Returns 401 with recovery instructions if session cookies are expired.
 */
notebookRouter.openapi(
  createRoute({
    method: "post",
    path: "/chat",
    operationId: "notebookChat",
    request: {
      body: { content: { "application/json": { schema: chatBody } } },
    },
    responses: {
      200: {
        description: "NotebookLM answer with references",
        content: { "application/json": { schema: chatResponse } },
      },
      401: {
        description: "Session expired — cookies need refreshing",
        content: { "application/json": { schema: sessionExpiredResponse } },
      },
    },
  }),
  async (c) => {
    const { query } = c.req.valid("json");

    try {
      const result: NotebookConsultation = await consultNotebook(c.env, query);

      // Persist to career memory (fire-and-forget — don't block the response)
      c.executionCtx.waitUntil(
        (async () => {
          try {
            const { CareerMemoryService } = await import("../../services/career-memory");
            const memory = new CareerMemoryService(c.env);
            await memory.remember({
              query,
              answer: result.answer,
              source: "notebooklm",
              agent: "orchestrator",
              category: "general",
              references: result.references ?? [],
              metadata: {
                conversationId: result.conversationId,
                turnNumber: result.turnNumber,
                via: "api_notebook_chat",
              },
            });
          } catch (e) {
            console.error("Memory persistence failed (non-fatal):", e);
          }
        })(),
      );

      return c.json(
        {
          answer: result.answer,
          conversationId: result.conversationId,
          turnNumber: result.turnNumber,
          references: result.references ?? [],
        },
        200,
      );
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        return c.json(
          {
            error: "SESSION_EXPIRED" as const,
            message: error.message,
            recoveryCommand: error.recoveryCommand,
          },
          401,
        );
      }
      throw error;
    }
  },
);
