/**
 * @fileoverview Role document MCP tools — Google Drive / Docs integration.
 *
 * Exposes the per-role Google Workspace documents (resumes, cover letters,
 * notes, etc.) to Claude so it can:
 *   1. List a role's documents with their drive_id, doc_id, drive_url,
 *      workspace_type (docs/drive), core-resume type (resume / cover_letter
 *      / notes / email_reply / other), and text content (markdown export).
 *   2. Use the doc_id / drive_id with the Claude Drive/Docs connector for
 *      out-of-band reading or editing.
 *   3. Make edits that produce a NEW Google Doc in the same Drive folder
 *      named "<baseName> (revision N)", persisted as a new D1 row so it
 *      appears in the app's documents list AND in subsequent
 *      list_role_documents calls.
 */
import { z } from "zod";

import { internalFetchJson, toolText } from "../internal-fetch";

import type { CoreResumesMcpAgent } from "../../index";

export function registerRoleDocumentTools(agent: CoreResumesMcpAgent, env: Env) {
  agent.server.tool(
    "list_role_documents",
    "List all Google Drive/Docs items linked to a role. By default, returns the markdown text content of each Google Doc inline so you can review them without a follow-up call. Each item includes: id (D1), gdocId (Drive id — pass this to your Drive/Docs connector), driveUrl, workspaceType ('docs' = native Google Doc, 'drive' = other Drive file like PDF), type (resume/cover_letter/notes/email_reply/other), version, name, and content (markdown, null for non-Doc files).",
    {
      roleId: z.string(),
      includeContent: z.boolean().optional().default(true),
    },
    async ({ roleId, includeContent }) => {
      const result = await internalFetchJson(
        env,
        `/api/documents/role/${encodeURIComponent(roleId)}/bundle`,
        { query: { includeContent: includeContent === false ? "false" : "true" } },
      );
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_role_document",
    "Get a single document linked to a role, with Drive metadata (mimeType, webViewLink, modifiedTime). Use list_role_documents to find the id.",
    { id: z.string() },
    async ({ id }) => {
      const result = await internalFetchJson(env, `/api/documents/${encodeURIComponent(id)}`);
      return toolText(result);
    },
  );

  agent.server.tool(
    "get_role_document_content",
    "Export a single document's text content as Markdown. Works for Google Docs; returns an error for non-Doc Drive files (use the Drive connector for those).",
    { id: z.string() },
    async ({ id }) => {
      const result = await internalFetchJson(
        env,
        `/api/documents/${encodeURIComponent(id)}/markdown`,
      );
      return toolText(result);
    },
  );

  agent.server.tool(
    "sync_role_documents",
    "Scan a role's Google Drive folder and create D1 rows for any new files. Useful when the user uploads or generates files outside the app and wants them tracked. Returns { synced, total }.",
    { roleId: z.string() },
    async ({ roleId }) => {
      const result = await internalFetchJson(env, `/api/documents/sync/${encodeURIComponent(roleId)}`, {
        method: "POST",
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "revise_role_document",
    [
      "Create a revision of an existing role document.",
      "Copies the original Google Doc into the same Drive folder with a new name '<baseName> (revision N)', optionally applies an edit, and persists a new D1 row so the revision shows up in the app's documents list AND in subsequent list_role_documents calls.",
      "",
      "Edit modes:",
      "  - 'no_edit': just copy (use when branching for human edits in Docs)",
      "  - 'find_replace': pass findReplace=[{ find, replace, matchCase? }, ...] — preserves formatting outside the replaced text. Best for targeted changes.",
      "  - 'append_text': pass appendText='...' — appends to the end of the doc.",
      "  - 'replace_all_text': pass replaceAllText='...' — nukes the body and inserts plain text. LOSES FORMATTING.",
      "  - 'batch_update': pass batchUpdateRequests=[...] — raw Google Docs API request objects for full control.",
      "",
      "Returns { document (the new D1 row), driveUrl, revision (the incrementing N), baseName, appliedMode }.",
    ].join("\n"),
    {
      id: z.string(),
      mode: z
        .enum(["no_edit", "find_replace", "append_text", "replace_all_text", "batch_update"])
        .optional()
        .default("no_edit"),
      findReplace: z
        .array(
          z.object({
            find: z.string().min(1),
            replace: z.string(),
            matchCase: z.boolean().optional(),
          }),
        )
        .optional(),
      appendText: z.string().optional(),
      replaceAllText: z.string().optional(),
      batchUpdateRequests: z.array(z.record(z.string(), z.unknown())).optional(),
      newName: z.string().optional(),
      type: z.enum(["resume", "cover_letter", "notes", "email_reply", "other"]).optional(),
      reviseNote: z.string().optional(),
    },
    async ({ id, ...body }) => {
      const result = await internalFetchJson(env, `/api/documents/${encodeURIComponent(id)}/revise`, {
        method: "POST",
        body,
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "create_role_document_from_text",
    "Create a brand-new Google Doc from plain text inside a role's Drive folder, then register it as a role document. Use when you have generated content (e.g. interview prep notes, a draft cover letter) and want it saved as a real Doc the user can edit. Returns the new D1 row.",
    {
      roleId: z.string(),
      name: z.string(),
      text: z.string(),
      type: z.enum(["resume", "cover_letter", "notes", "email_reply", "other"]).default("notes"),
    },
    async ({ roleId, name, text, type }) => {
      // Two-step orchestration: (1) ask the worker to create the Doc via the
      // helper route below, then (2) register it. We expose a tiny new endpoint
      // for this in documents.ts. For simplicity we POST a synthesized body.
      const result = await internalFetchJson(env, "/api/documents/create-from-text", {
        method: "POST",
        body: { roleId, name, text, type },
      });
      return toolText(result);
    },
  );

  agent.server.tool(
    "delete_role_document",
    "Delete a role's document row from D1. The underlying Google Doc is NOT removed from Drive — the user can recover it from the Drive folder if needed.",
    { id: z.string() },
    async ({ id }) => {
      const result = await internalFetchJson(env, `/api/documents/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      return toolText(result);
    },
  );
}
