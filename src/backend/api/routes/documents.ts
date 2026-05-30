import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";

import { GoogleDocsClient } from "@/backend/ai/tools/google/docs";
import { GoogleDriveClient } from "@/backend/ai/tools/google/drive";
import { getDb } from "@/backend/db";
import { documents, insertDocumentSchema, roles, selectDocumentSchema } from "@/backend/db/schema";
import { getServiceAccountAccessToken } from "@/backend/lib/google-auth";

const documentQuery = z.object({ roleId: z.string().optional() });
const documentParam = z.object({ id: z.string() });
const documentCreate = insertDocumentSchema.omit({ id: true });

const GDOC_MIME = "application/vnd.google-apps.document";

/**
 * Fetch Drive metadata (mimeType, webViewLink, parents) for a Google file by id.
 * Returns null on error so callers can degrade gracefully when a doc has been
 * deleted in Drive but still has a D1 row.
 */
async function fetchDriveMetadata(env: Env, gdocId: string) {
  const token = await getServiceAccountAccessToken(env, [
    "https://www.googleapis.com/auth/drive",
  ]);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(gdocId)}?fields=id,name,mimeType,webViewLink,parents,modifiedTime`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  return (await res.json()) as {
    id: string;
    name: string;
    mimeType?: string;
    webViewLink?: string;
    parents?: string[];
    modifiedTime?: string;
  };
}

/**
 * Best-effort markdown export. Only Google Docs (and a few Google-native
 * types) support markdown export; other Drive files return null.
 */
async function exportDocMarkdown(env: Env, gdocId: string): Promise<string | null> {
  const token = await getServiceAccountAccessToken(env, [
    "https://www.googleapis.com/auth/drive",
  ]);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(gdocId)}/export?mimeType=text/markdown`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  return res.text();
}

/**
 * Derive `workspace_type` (docs | drive) from a Drive mimeType.
 */
function workspaceTypeFromMime(mimeType: string | undefined): "docs" | "drive" {
  return mimeType === GDOC_MIME ? "docs" : "drive";
}

/**
 * Strip an existing "(revision N)" suffix from a document name so revision
 * counters increment off the base name rather than nesting suffixes.
 */
function stripRevisionSuffix(name: string): string {
  return name.replace(/\s*\(revision\s+\d+\)\s*$/i, "").trim();
}

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
// GET /:id — Get a single document row with Drive metadata (mimeType, link)
// ---------------------------------------------------------------------------

const documentDetailSchema = selectDocumentSchema.extend({
  driveUrl: z.string().nullable(),
  workspaceType: z.enum(["docs", "drive"]).nullable(),
  mimeType: z.string().nullable(),
  modifiedTime: z.string().nullable(),
});

documentsRouter.openapi(
  createRoute({
    method: "get",
    path: "/{id}",
    operationId: "documentsGet",
    request: { params: documentParam },
    responses: {
      200: {
        description: "Get document with Drive metadata",
        content: { "application/json": { schema: documentDetailSchema } },
      },
      404: {
        description: "Document not found",
        content: { "application/json": { schema: z.object({ error: z.string() }) } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const db = getDb(c.env);
    const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    if (!doc) return c.json({ error: "Document not found" }, 404);

    const meta = await fetchDriveMetadata(c.env, doc.gdocId);
    return c.json(
      {
        ...doc,
        driveUrl: meta?.webViewLink ?? `https://drive.google.com/file/d/${doc.gdocId}/view`,
        workspaceType: meta ? workspaceTypeFromMime(meta.mimeType) : null,
        mimeType: meta?.mimeType ?? null,
        modifiedTime: meta?.modifiedTime ?? null,
      },
      200,
    );
  },
);

// ---------------------------------------------------------------------------
// GET /role/:roleId/bundle — List a role's documents with content inline
// ---------------------------------------------------------------------------

const documentBundleEntry = documentDetailSchema.extend({
  content: z.string().nullable(),
});

documentsRouter.openapi(
  createRoute({
    method: "get",
    path: "/role/{roleId}/bundle",
    operationId: "documentsBundle",
    request: {
      params: z.object({ roleId: z.string() }),
      query: z.object({
        includeContent: z
          .string()
          .optional()
          .openapi({ description: "Pass 'false' to skip markdown export (faster). Default: true." }),
      }),
    },
    responses: {
      200: {
        description: "All documents for a role with optional inlined content",
        content: {
          "application/json": {
            schema: z.object({ roleId: z.string(), documents: z.array(documentBundleEntry) }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { roleId } = c.req.valid("param");
    const { includeContent } = c.req.valid("query");
    const wantContent = includeContent !== "false";

    const db = getDb(c.env);
    const rows = await db.select().from(documents).where(eq(documents.roleId, roleId));

    const enriched = await Promise.all(
      rows.map(async (row) => {
        const [meta, content] = await Promise.all([
          fetchDriveMetadata(c.env, row.gdocId),
          wantContent ? exportDocMarkdown(c.env, row.gdocId) : Promise.resolve(null),
        ]);
        return {
          ...row,
          driveUrl: meta?.webViewLink ?? `https://drive.google.com/file/d/${row.gdocId}/view`,
          workspaceType: meta ? workspaceTypeFromMime(meta.mimeType) : null,
          mimeType: meta?.mimeType ?? null,
          modifiedTime: meta?.modifiedTime ?? null,
          content,
        };
      }),
    );

    return c.json({ roleId, documents: enriched });
  },
);

// ---------------------------------------------------------------------------
// POST /:id/revise — Create a revision: copy doc, optionally edit, save row
// ---------------------------------------------------------------------------

const reviseBody = z.object({
  mode: z
    .enum(["no_edit", "find_replace", "append_text", "replace_all_text", "batch_update"])
    .default("no_edit"),
  /** For mode=find_replace: a list of literal find/replace pairs. */
  findReplace: z
    .array(
      z.object({
        find: z.string().min(1),
        replace: z.string(),
        matchCase: z.boolean().optional().default(true),
      }),
    )
    .optional(),
  /** For mode=append_text: text appended to the end of the doc. */
  appendText: z.string().optional(),
  /** For mode=replace_all_text: plain text that replaces the entire body. Loses formatting. */
  replaceAllText: z.string().optional(),
  /** For mode=batch_update: raw Google Docs API request objects. */
  batchUpdateRequests: z.array(z.record(z.string(), z.unknown())).optional(),
  /** Optional override of the auto-generated revision name. */
  newName: z.string().optional(),
  /** Optional explicit type override on the new revision row. Defaults to original.type. */
  type: z.enum(["resume", "cover_letter", "notes", "email_reply", "other"]).optional(),
  /** Free-text note about why this revision was created, persisted in the new row's name. */
  reviseNote: z.string().optional(),
});

const reviseResponse = z.object({
  document: selectDocumentSchema,
  driveUrl: z.string(),
  revision: z.number(),
  baseName: z.string(),
  appliedMode: z.string(),
});

documentsRouter.openapi(
  createRoute({
    method: "post",
    path: "/{id}/revise",
    operationId: "documentsRevise",
    request: {
      params: documentParam,
      body: { content: { "application/json": { schema: reviseBody } } },
    },
    responses: {
      201: {
        description: "Created revision",
        content: { "application/json": { schema: reviseResponse } },
      },
      400: {
        description: "Invalid revise request",
        content: { "application/json": { schema: z.object({ error: z.string() }) } },
      },
      404: {
        description: "Document not found",
        content: { "application/json": { schema: z.object({ error: z.string() }) } },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = getDb(c.env);

    const [original] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
    if (!original) return c.json({ error: "Document not found" }, 404);

    // Find the role's drive folder — fall back to original doc's parent folder.
    const [role] = await db
      .select()
      .from(roles)
      .where(eq(roles.id, original.roleId))
      .limit(1);
    let parentFolderId = role?.driveFolderId ?? null;
    if (!parentFolderId) {
      const meta = await fetchDriveMetadata(c.env, original.gdocId);
      parentFolderId = meta?.parents?.[0] ?? null;
    }

    // Compute next revision number across all docs for this role with the same base name.
    const baseName = stripRevisionSuffix(original.name);
    const siblings = await db
      .select({ name: documents.name, version: documents.version })
      .from(documents)
      .where(eq(documents.roleId, original.roleId));
    const revisionNumbers = siblings
      .map((s) => {
        const m = s.name.match(/\(revision\s+(\d+)\)\s*$/i);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => Number.isFinite(n));
    const nextRevision = Math.max(0, ...revisionNumbers) + 1;
    const noteSuffix = body.reviseNote ? ` — ${body.reviseNote}` : "";
    const newName = body.newName ?? `${baseName} (revision ${nextRevision})${noteSuffix}`;

    // Copy the original doc into the same folder under the new name.
    const drive = new GoogleDriveClient(c.env);
    let copy: { id: string; name: string; webViewLink?: string };
    try {
      copy = await drive.copyFile(original.gdocId, newName, parentFolderId ?? undefined);
    } catch (err) {
      return c.json(
        {
          error: `Failed to copy original document: ${err instanceof Error ? err.message : String(err)}`,
        },
        400,
      );
    }

    // Apply the requested edit. Only Google Docs accept batch updates — for
    // non-doc Drive files we silently downgrade to no_edit.
    const meta = await fetchDriveMetadata(c.env, copy.id);
    const isGoogleDoc = meta?.mimeType === GDOC_MIME;
    const docs = new GoogleDocsClient(c.env);

    if (isGoogleDoc && body.mode !== "no_edit") {
      if (body.mode === "append_text" && body.appendText) {
        await docs.appendText(copy.id, body.appendText);
      } else if (body.mode === "find_replace" && body.findReplace?.length) {
        const requests = body.findReplace.map((fr) => ({
          replaceAllText: {
            containsText: { text: fr.find, matchCase: fr.matchCase ?? true },
            replaceText: fr.replace,
          },
        }));
        await docs.batchUpdate(copy.id, requests);
      } else if (body.mode === "replace_all_text" && body.replaceAllText !== undefined) {
        // Delete everything in the body, then insert the new plain text at index 1.
        const raw = await docs.getRawDocument(copy.id);
        const endIndex = Math.max(2, (raw.body.content.at(-1)?.endIndex ?? 2) - 1);
        const requests: Array<Record<string, unknown>> = [];
        if (endIndex > 1) {
          requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex } } });
        }
        requests.push({ insertText: { location: { index: 1 }, text: body.replaceAllText } });
        await docs.batchUpdate(copy.id, requests);
      } else if (body.mode === "batch_update" && body.batchUpdateRequests?.length) {
        await docs.batchUpdate(copy.id, body.batchUpdateRequests as Record<string, any>[]);
      }
    }

    // Persist the new revision row in D1 so the app's documents list reflects it.
    const newRowId = crypto.randomUUID();
    const [inserted] = await db
      .insert(documents)
      .values({
        id: newRowId,
        gdocId: copy.id,
        roleId: original.roleId,
        type: body.type ?? original.type,
        version: original.version + 1,
        name: copy.name ?? newName,
      })
      .returning();

    return c.json(
      {
        document: inserted,
        driveUrl: copy.webViewLink ?? `https://docs.google.com/document/d/${copy.id}/edit`,
        revision: nextRevision,
        baseName,
        appliedMode: isGoogleDoc ? body.mode : "no_edit",
      },
      201,
    );
  },
);

// ---------------------------------------------------------------------------
// POST /create-from-text — Create a new Google Doc from plain text + register it
// ---------------------------------------------------------------------------

const createFromTextBody = z.object({
  roleId: z.string(),
  name: z.string().min(1),
  text: z.string(),
  type: z
    .enum(["resume", "cover_letter", "notes", "email_reply", "other"])
    .optional()
    .default("notes"),
});

documentsRouter.openapi(
  createRoute({
    method: "post",
    path: "/create-from-text",
    operationId: "documentsCreateFromText",
    request: { body: { content: { "application/json": { schema: createFromTextBody } } } },
    responses: {
      201: {
        description: "Created Doc and document row",
        content: { "application/json": { schema: selectDocumentSchema } },
      },
      404: {
        description: "Role not found or has no Drive folder",
        content: { "application/json": { schema: z.object({ error: z.string() }) } },
      },
    },
  }),
  async (c) => {
    const { roleId, name, text, type } = c.req.valid("json");
    const db = getDb(c.env);

    const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
    if (!role?.driveFolderId) {
      return c.json({ error: "Role has no Google Drive folder linked" }, 404);
    }

    const drive = new GoogleDriveClient(c.env);
    const created = await drive.createDocFromText(name, role.driveFolderId, text);

    const [doc] = await db
      .insert(documents)
      .values({
        id: crypto.randomUUID(),
        gdocId: created.id,
        roleId,
        type,
        version: 1,
        name: created.name ?? name,
      })
      .returning();

    return c.json(doc, 201);
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
    const token = await getServiceAccountAccessToken(c.env, [
      "https://www.googleapis.com/auth/drive",
    ]);

    // Google Drive v3 API endpoint to export the document natively to text/markdown
    const url = `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/markdown`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return c.json({ error: `Google API Error: ${response.status} - ${errorText}` }, 500);
      }

      const markdown = await response.text();
      return new Response(markdown, {
        status: 200,
        headers: { "Content-Type": "text/markdown" },
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
