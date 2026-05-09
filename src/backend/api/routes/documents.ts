import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";

import { GoogleDriveClient } from "@/backend/ai/tools/google/drive";
import { getDb } from "@/backend/db";
import { getServiceAccountAccessToken } from "@/backend/lib/google-auth";
import { documents, insertDocumentSchema, roles, selectDocumentSchema } from "@/backend/db/schema";

const documentQuery = z.object({ roleId: z.string().optional() });
const documentParam = z.object({ id: z.string() });
const documentCreate = insertDocumentSchema.omit({ id: true });

export const documentsRouter = new OpenAPIHono<{ Bindings: Env }>();

documentsRouter.openapi(
  createRoute({
    method: "get",
    path: "/",
    operationId: "documentsList",
    request: { query: documentQuery },
    responses: {
      200: {
        description: "List documents",
        content: { "application/json": { schema: z.array(selectDocumentSchema) } },
      },
    },
  }),
  async (c) => {
    const { roleId } = c.req.valid("query");
    const db = getDb(c.env);
    const rows = roleId
      ? await db.select().from(documents).where(eq(documents.roleId, roleId))
      : await db.select().from(documents);

    return c.json(rows);
  },
);

documentsRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    operationId: "documentsCreate",
    request: { body: { content: { "application/json": { schema: documentCreate } } } },
    responses: {
      201: {
        description: "Created document link",
        content: { "application/json": { schema: selectDocumentSchema } },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const [document] = await getDb(c.env)
      .insert(documents)
      .values({ ...body, id: crypto.randomUUID() })
      .returning();

    return c.json(document, 201);
  },
);

documentsRouter.openapi(
  createRoute({
    method: "delete",
    path: "/{id}",
    operationId: "documentsDelete",
    request: { params: documentParam },
    responses: {
      200: {
        description: "Deleted document",
        content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    await getDb(c.env).delete(documents).where(eq(documents.id, id));

    return c.json({ ok: true });
  },
);

// ---------------------------------------------------------------------------
// GET /:id/markdown — Export a Google Doc as Markdown
// ---------------------------------------------------------------------------

documentsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}/markdown",
    operationId: "documentsExportMarkdown",
    request: { params: documentParam },
    responses: {
      200: {
        description: "Exported Markdown",
        content: {
          "text/markdown": {
            schema: z.string(),
          },
        },
      },
      500: {
        description: "Server Error",
        content: {
          "application/json": { schema: z.object({ error: z.string() }) },
        },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const token = await getServiceAccountAccessToken(c.env, ["https://www.googleapis.com/auth/drive"]);
    
    // Google Drive v3 API endpoint to export the document natively to text/markdown
    const url = `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/markdown`;
    
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return c.json({ error: `Google API Error: ${response.status} - ${errorText}` }, 500);
      }

      const markdown = await response.text();
      return new Response(markdown, {
        status: 200,
        headers: { "Content-Type": "text/markdown" }
      });
    } catch (err: any) {
      return c.json({ error: err.message || "Unknown error occurred during export" }, 500);
    }
  },
);

// ---------------------------------------------------------------------------
// POST /sync/:roleId — Scan Google Drive folder and sync to D1
// ---------------------------------------------------------------------------

documentsRouter.openapi(
  createRoute({
    method: "post",
    path: "/sync/{roleId}",
    operationId: "documentsSync",
    request: { params: z.object({ roleId: z.string() }) },
    responses: {
      200: {
        description: "Sync result",
        content: {
          "application/json": {
            schema: z.object({ synced: z.number(), total: z.number() }),
          },
        },
      },
      404: {
        description: "Role or folder not found",
        content: {
          "application/json": { schema: z.object({ error: z.string() }) },
        },
      },
    },
  }),
  async (c) => {
    const { roleId } = c.req.valid("param");
    const db = getDb(c.env);

    // Load role to get Drive folder ID
    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role?.driveFolderId) {
      return c.json({ error: "Role has no Google Drive folder linked" }, 404);
    }

    // List files from Google Drive
    const drive = new GoogleDriveClient(c.env);
    const driveFiles = await drive.listFilesInFolderSorted(role.driveFolderId);

    // Load existing documents for this role
    const existingDocs = await db
      .select({ gdocId: documents.gdocId })
      .from(documents)
      .where(eq(documents.roleId, roleId));
    const existingGdocIds = new Set(existingDocs.map((d) => d.gdocId));

    // Insert new documents that aren't already tracked
    let synced = 0;
    for (const file of driveFiles) {
      if (existingGdocIds.has(file.id)) continue;

      // Infer document type from file name
      const nameLower = file.name.toLowerCase();
      const type = nameLower.includes("resume")
        ? "resume"
        : nameLower.includes("cover")
          ? "cover_letter"
          : nameLower.includes("note")
            ? "notes"
            : "other";

      await db.insert(documents).values({
        id: crypto.randomUUID(),
        gdocId: file.id,
        roleId,
        type: type as "resume" | "cover_letter" | "notes" | "other",
        version: 1,
        name: file.name,
      });
      synced++;
    }

    return c.json({ synced, total: driveFiles.length }, 200);
  },
);
