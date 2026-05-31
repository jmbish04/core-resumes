---
title: "Google Docs"
date_last_updated: "2026-05-31"
---

# Google Docs

The Worker integrates with the **Google Docs API** alongside Drive, using the same **service account** and **domain-wide delegation** model. Docs operations focus on **content**: templates, reads, appends, and **comments** (including `@colby` reply flows).

## Authentication

- **Docs scope:** `https://www.googleapis.com/auth/documents` (combined with Drive where needed inside `GoogleDocsClient`).
- **Shared auth layer:** `getServiceAccountAccessToken()` in `src/backend/lib/google-auth.ts` — same KV-cached token pattern as [Google Drive](/docs/integrations/google-drive).

## GoogleDocsClient

`src/backend/ai/tools/google/docs.ts` defines **`GoogleDocsClient`**, which provides:

1. **`createFromTemplate(templateId, replacements, parentFolderId)`** — Copies a Drive file (Google Doc template), then runs a Docs `batchUpdate` with `replaceAllText` requests for each placeholder. Used for branded resume/cover letter generation.
2. **`read(docId)`** — Fetches the document JSON and extracts plain text for AI pipelines (e.g. comment threads, analysis).
3. **`appendText(docId, text)`** — Inserts text at the end of the document body.
4. **`addComment` / `replyToComment`** — Create anchors and threaded replies via the Drive comments API on the file backing the Doc.

Folder creation on this class is a **deprecated shim** that delegates to `GoogleDriveClient`; new code should use Drive for folders.

## How the product uses Docs

- **Resume / cover letter pipeline** — `draft-with-notebook` and orchestrator flows render HTML or template copies, persist `documents` rows in D1 with `gdoc_id`, and expose edit links in the UI (`docs.google.com/document/d/{id}`).
- **Comment response task** — `respond-to-comments.ts` reads the doc, finds tagged threads, consults NotebookLM, and posts replies through the Docs/Drive comment APIs.
- **Health validation** — `checkGoogleDrive` in `src/backend/ai/tools/google/health.ts` exercises template copy (when configured), HTML-to-doc upload via Drive, and a real **`appendText`** write to prove Docs mutability.

## Templates

Branded layout lives under `src/backend/ai/tools/google/templates/` (engine, styles, resume/cover letter templates). The [Resume Template](/docs/resume-template) and [Cover Letter Template](/docs/cover-letter-template) docs pages preview how rendered output maps into Google Docs.

## Related documentation

- [Google Drive](/docs/integrations/google-drive) — Folders, multipart native doc upload, file delete/list
- [NotebookLM](/docs/integrations/notebooklm) — Evidence layer used before drafting doc content
- [OrchestratorAgent](/docs/agents/orchestrator) — Callable surface for doc operations
- [Configuration](/docs/configuration) — Service account and template IDs
