# Document Generation Rules

## Dual Pipeline Architecture

The platform supports two distinct document generation paths. Do not conflate them:
1.  **NotebookLM Pipeline (Agentic):** High variance, multi-step LLM pipeline via `draft-with-notebook.ts`.
2.  **Deterministic Pipeline (Script-Backed):** Predictable, parameter-driven HTML-to-Doc generation via `docs-generator.ts`.

## Deterministic Generation

When interacting with the deterministic pipeline:
-   **Service Location:** `src/backend/services/docs-generator.ts`.
-   **Methodology:** Accepts structured JSON (e.g. `ResumeRequestSchema`, `CoverLetterRequestSchema`), generates styled HTML, and uploads to Google Drive.
-   **Idempotency:** Always ensure document links are persisted to the D1 `documents` table so the frontend can retrieve them deterministically.
-   **Drive Folders:** Ensure `role.driveFolderId` is created via `ensureRoleDriveFolder` before placing documents to keep the Drive organized.

## NotebookLM Document Pipeline

When interacting with the agentic pipeline:
-   **Service Location:** `src/backend/ai/tasks/draft-with-notebook.ts`.
-   **Execution:** Executed exclusively via `OrchestratorAgent.draft_resume()` or `OrchestratorAgent.respond_to_comments()`.
-   **Progress Reporting:** WebSocket `draft_progress` and `comment_progress` messages MUST be broadcasted at each phase to update the UI.

## Google Drive Integration

All document pipelines MUST use `src/backend/services/google-drive.ts` (`GoogleDriveClient`).
-   Never recreate multipart upload logic. Use `GoogleDriveClient.createDocFromHtml`.
-   Never use hardcoded folder IDs. Always use `env.PARENT_DRIVE_FOLDER_ID` and dynamically created role sub-folders.

## ATS Engine & Live CV Optimization

When interacting with the real-time resume tools:
-   **Service Location:** `src/backend/ai/tasks/analyze/ats-score.ts` and `src/backend/api/routes/analysis.ts`.
-   **Taxonomy Requirement:** ATS matching MUST use the strict 5-tier taxonomy (Programming/Frameworks, Testing/Quality, Engineering Practices, Business Domain, Infrastructure/DevOps).
-   **Google Docs Polling/Webhooks:** The `respond-to-comments.ts` task actively processes Google Doc comments. When the agent is mentioned (`@colby`), it must strictly follow the CV Optimization rules (What + How + Result/Impact, no fluff) and post its response directly in Google Docs.
-   **Assistant-UI Context:** The Resume Viewport exposes an assistant-ui modal. Agents MUST use Google Docs tooling (`src/backend/ai/tools/google/docs.ts`) to read, modify, and optimize the document in real time based on user chat, rather than generating detached markdown text.
