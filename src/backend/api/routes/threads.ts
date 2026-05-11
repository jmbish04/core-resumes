import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { desc, eq } from "drizzle-orm";

import { enqueueOrchestratorTask } from "../../ai/agents/orchestrator";
import { getDb } from "../../db";
import {
  insertMessageSchema,
  messages,
  selectMessageSchema,
  selectThreadSchema,
  threads,
} from "../../db/schema";

const roleParam = z.object({ roleId: z.string() });
const messageBody = z.object({ content: z.string().min(1) });

export const threadsRouter = new OpenAPIHono<{ Bindings: Env }>();

threadsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{roleId}",
    operationId: "threadsListByRole",
    request: { params: roleParam },
    responses: {
      200: {
        description: "Threads and messages",
        content: {
          "application/json": {
            schema: z.object({
              threads: z.array(selectThreadSchema),
              messages: z.array(selectMessageSchema),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { roleId } = c.req.valid("param");
    const db = getDb(c.env);
    const rows = await db
      .select()
      .from(threads)
      .where(eq(threads.roleId, roleId))
      .orderBy(desc(threads.createdAt));
    const threadIds = new Set(rows.map((thread) => thread.id));
    const messageRows = (
      await db.select().from(messages).where(eq(messages.roleId, roleId))
    ).filter((message) => threadIds.has(message.threadId));

    return c.json({ threads: rows, messages: messageRows });
  },
);

threadsRouter.openapi(
  createRoute({
    method: "post",
    path: "/{roleId}/messages",
    operationId: "threadsCreateMessage",
    request: {
      params: roleParam,
      body: { content: { "application/json": { schema: messageBody } } },
    },
    responses: {
      201: {
        description: "Message accepted",
        content: {
          "application/json": { schema: insertMessageSchema.extend({ queued: z.boolean() }) },
        },
      },
    },
  }),
  async (c) => {
    const { roleId } = c.req.valid("param");
    const { content } = c.req.valid("json");
    const db = getDb(c.env);
    const [thread] = await db.select().from(threads).where(eq(threads.roleId, roleId)).limit(1);
    const threadId = thread?.id ?? crypto.randomUUID();

    if (!thread) {
      await db.insert(threads).values({ id: threadId, title: "Role thread", roleId });
    }

    const [message] = await db
      .insert(messages)
      .values({ id: crypto.randomUUID(), threadId, roleId, author: "user", content })
      .returning();
    await enqueueOrchestratorTask(c.env, roleId, {
      type: "resume_review",
      roleId,
      payload: { userMessage: content },
    });

    return c.json({ ...message, queued: true }, 201);
  },
);

// ---------------------------------------------------------------------------
// Thread management
// ---------------------------------------------------------------------------

/**
 * POST /:roleId/threads — create a new conversation thread for a role.
 */
threadsRouter.post("/:roleId/threads", async (c) => {
  const roleId = c.req.param("roleId");
  const body = await c.req.json<{ title?: string }>().catch(() => ({}) as { title?: string });
  const db = getDb(c.env);

  const id = crypto.randomUUID();
  const [thread] = await db
    .insert(threads)
    .values({
      id,
      title: body.title ?? "New conversation",
      roleId,
    })
    .returning();

  return c.json(thread, 201);
});

// ---------------------------------------------------------------------------
// Thread history (for assistant-ui ThreadHistoryAdapter withFormat)
// ---------------------------------------------------------------------------

/**
 * GET /history/:threadId — load message history for a specific thread.
 *
 * Returns messages in chronological order for the ThreadHistoryAdapter's
 * `load()` method. Each message includes `parts` and `format` for
 * rich UIMessage reconstruction.
 */
threadsRouter.get("/history/:threadId", async (c) => {
  const threadId = c.req.param("threadId");
  const db = getDb(c.env);

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(messages.timestamp);

  return c.json({
    messages: rows.map((row) => ({
      id: row.id,
      parent_id: null,
      format: row.format ?? "plain",
      content: row.parts ?? {
        role: row.author === "agent" ? "assistant" : row.author,
        content: row.content,
      },
    })),
  });
});

/**
 * POST /history/:threadId — append a message to thread history.
 *
 * Called by the ThreadHistoryAdapter's `append()` method via `withFormat()`.
 * Accepts the serialized message from `fmt.encode()`.
 */
threadsRouter.post("/history/:threadId", async (c) => {
  const threadId = c.req.param("threadId");
  const body = await c.req.json<{
    id: string;
    parent_id: string | null;
    format: string;
    content: unknown;
  }>();
  const db = getDb(c.env);

  // Extract plain text content for the `content` column
  const plainContent =
    typeof body.content === "string"
      ? body.content
      : typeof (body.content as Record<string, unknown>)?.content === "string"
        ? (body.content as Record<string, string>).content
        : JSON.stringify(body.content);

  // Determine author from the content
  const role = (body.content as Record<string, unknown>)?.role;
  const author: "user" | "agent" | "system" =
    role === "assistant" ? "agent" : role === "system" ? "system" : "user";

  await db.insert(messages).values({
    id: body.id,
    threadId,
    author,
    content: plainContent,
    parts: body.content as unknown[],
    format: body.format,
  });

  return c.json({ ok: true }, 201);
});
