/**
 * @fileoverview Interview Notes CRUD routes.
 *
 * Manages PlateJS rich-text interview notes per role. Content is stored
 * as Slate JSON in D1. The frontend auto-saves via debounced PATCH.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, desc, eq } from "drizzle-orm";

import { getDb } from "../../db";
import {
  insertInterviewNoteSchema,
  interviewNotes,
  selectInterviewNoteSchema,
} from "../../db/schema";

const roleIdParam = z.object({ roleId: z.string() });
const noteIdParam = z.object({ roleId: z.string(), noteId: z.string() });

const noteCreateBody = z.object({
  title: z.string().optional(),
  content: z.array(z.record(z.string(), z.unknown())).optional(),
});

const notePatchBody = z.object({
  title: z.string().optional(),
  content: z.array(z.record(z.string(), z.unknown())).optional(),
});

export const interviewNotesRouter = new OpenAPIHono<{ Bindings: Env }>();

// GET /:roleId/notes — list notes for a role
interviewNotesRouter.openapi(
  createRoute({
    method: "get",
    path: "/{roleId}/notes",
    operationId: "interviewNotesList",
    request: { params: roleIdParam },
    responses: {
      200: {
        description: "List interview notes for a role",
        content: { "application/json": { schema: z.array(selectInterviewNoteSchema) } },
      },
    },
  }),
  async (c) => {
    const { roleId } = c.req.valid("param");
    const rows = await getDb(c.env)
      .select()
      .from(interviewNotes)
      .where(eq(interviewNotes.roleId, roleId))
      .orderBy(desc(interviewNotes.updatedAt));

    return c.json(rows);
  },
);

// POST /:roleId/notes — create a new note
interviewNotesRouter.openapi(
  createRoute({
    method: "post",
    path: "/{roleId}/notes",
    operationId: "interviewNotesCreate",
    request: {
      params: roleIdParam,
      body: { content: { "application/json": { schema: noteCreateBody } } },
    },
    responses: {
      201: {
        description: "Created interview note",
        content: { "application/json": { schema: selectInterviewNoteSchema } },
      },
    },
  }),
  async (c) => {
    const { roleId } = c.req.valid("param");
    const body = c.req.valid("json");
    const defaultContent = [{ type: "p", children: [{ text: "" }] }];

    const [note] = await getDb(c.env)
      .insert(interviewNotes)
      .values({
        roleId,
        title: body.title ?? "New Note",
        content: body.content ?? defaultContent,
      })
      .returning();

    return c.json(note, 201);
  },
);

// GET /:roleId/notes/:noteId — get single note
interviewNotesRouter.openapi(
  createRoute({
    method: "get",
    path: "/{roleId}/notes/{noteId}",
    operationId: "interviewNotesGet",
    request: { params: noteIdParam },
    responses: {
      200: {
        description: "Get interview note",
        content: { "application/json": { schema: selectInterviewNoteSchema } },
      },
      404: { description: "Note not found" },
    },
  }),
  async (c) => {
    const { roleId, noteId } = c.req.valid("param");
    const [note] = await getDb(c.env)
      .select()
      .from(interviewNotes)
      .where(and(eq(interviewNotes.id, noteId), eq(interviewNotes.roleId, roleId)))
      .limit(1);

    return note ? c.json(note) : c.json({ error: "Note not found" }, 404);
  },
);

// PATCH /:roleId/notes/:noteId — update note content/title
interviewNotesRouter.openapi(
  createRoute({
    method: "patch",
    path: "/{roleId}/notes/{noteId}",
    operationId: "interviewNotesUpdate",
    request: {
      params: noteIdParam,
      body: { content: { "application/json": { schema: notePatchBody } } },
    },
    responses: {
      200: {
        description: "Updated interview note",
        content: { "application/json": { schema: selectInterviewNoteSchema } },
      },
      404: { description: "Note not found" },
    },
  }),
  async (c) => {
    const { roleId, noteId } = c.req.valid("param");
    const body = c.req.valid("json");
    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (body.title !== undefined) {
      patch.title = body.title;
    }

    if (body.content !== undefined) {
      patch.content = body.content;
    }

    const [note] = await getDb(c.env)
      .update(interviewNotes)
      .set(patch)
      .where(and(eq(interviewNotes.id, noteId), eq(interviewNotes.roleId, roleId)))
      .returning();

    return note ? c.json(note) : c.json({ error: "Note not found" }, 404);
  },
);

// DELETE /:roleId/notes/:noteId — delete note
interviewNotesRouter.openapi(
  createRoute({
    method: "delete",
    path: "/{roleId}/notes/{noteId}",
    operationId: "interviewNotesDelete",
    request: { params: noteIdParam },
    responses: {
      200: {
        description: "Deleted interview note",
        content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
      },
    },
  }),
  async (c) => {
    const { roleId, noteId } = c.req.valid("param");
    await getDb(c.env)
      .delete(interviewNotes)
      .where(and(eq(interviewNotes.id, noteId), eq(interviewNotes.roleId, roleId)));

    return c.json({ ok: true });
  },
);
