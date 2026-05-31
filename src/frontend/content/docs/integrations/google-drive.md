---
title: "Google Drive"
date_last_updated: "2026-05-31"
---

# Google Drive

The Worker integrates with **Google Drive v3** using a **Google Cloud service account** and **domain-wide delegation** (impersonation). Drive is used for folder layout, file lifecycle, and native Google Doc creation from HTML — not for end-user OAuth flows.

## Authentication

- **Mechanism:** `getServiceAccountAccessToken()` in `src/backend/lib/google-auth.ts` exchanges the service account JWT for an access token with the Drive scope `https://www.googleapis.com/auth/drive`.
- **Secrets:** Private key and client email come from the Cloudflare Secrets Store (see [Configuration](/docs/configuration) and `src/backend/utils/secrets.ts`).
- **Caching:** Tokens are cached in KV with TTL slightly shorter than Google's `expires_in` to avoid edge-of-expiry failures.

## What the app uses Drive for

The **`GoogleDriveClient`** in `src/backend/ai/tools/google/drive.ts` wraps Drive REST calls used across the stack:

1. **Folders** — `createFolder()` creates role- or health-scoped folders under a parent folder ID from configuration (e.g. `PARENT_DRIVE_FOLDER_ID`, health-check folders).
2. **Listing and cleanup** — `listFiles()`, `deleteFile()` support health checks and retention (e.g. pruning older health run artifacts).
3. **HTML → native Google Doc** — `createDocFromHtml()` uploads multipart `multipart/related` content so the result is a real `application/vnd.google-apps.document`, not a flat HTML file in Drive.

Orchestrator callable methods in `src/backend/ai/agents/orchestrator/methods/docs/google-docs.ts` delegate folder and upload-style work to this client where appropriate.

## Configuration

Relevant bindings and vars are documented on the [Configuration](/docs/configuration) page. Typical inputs include:

- Parent folder IDs for generated resumes and cover letters
- Health-check Drive folder IDs used by `checkGoogleDrive` in `src/backend/ai/tools/google/health.ts`

Template document IDs for resume/cover letter **copy** flows may be stored in D1 `global_config` and resolved at runtime (see health check and draft pipelines).

## Health checks

`checkGoogleDrive` verifies listing, optional template copy, HTML-to-doc creation, and Docs API writes. Failures surface on the **Health** dashboard with actionable messages (auth, folder permission, or API errors).

## Related documentation

- [Google Docs](/docs/integrations/google-docs) — Docs API client, templates, and comment workflows
- [OrchestratorAgent](/docs/agents/orchestrator) — Agent entry points that create and manage documents
- [Configuration](/docs/configuration) — Secrets, folders, and env vars
