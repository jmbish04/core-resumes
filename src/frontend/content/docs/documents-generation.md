# Document Generation

Last updated: May 11, 2026

The `core-resumes` architecture provides two distinct paths for generating Google Docs (Resumes and Cover Letters): a non-deterministic LLM pipeline driven by NotebookLM, and a deterministic Script-Backed pipeline. Both paths utilize the `GoogleDriveClient` wrapper for robust, cached multipart uploads to Google Drive.

## 1. NotebookLM Pipeline (Agentic)

This is a multi-phase AI workflow orchestrated by the Colby (`OrchestratorAgent`) and NotebookLM (`NotebookLMAgent`) agents.

- **Trigger:** Chat interactions or orchestration pipeline tasks (`OrchestratorAgent.draft_resume()`).
- **Phases:** 
  0. Draft Planning (Workers AI selects focus areas + keyword targets).
  1. Pre-Draft Consultation (NotebookLM locates evidence).
  2. AI Draft (Workers AI synthesizes).
  3. Review (NotebookLM verifies facts/strategy).
  4. Evaluate + Improve (Workers AI scores + iterates until threshold).
  5. Google Doc Creation.
- **File:** `src/backend/ai/tasks/draft/notebook.ts`

### Evaluation Loop Notes

- The evaluation loop uses a hybrid signal (programmatic keyword coverage + embedding similarity + LLM rubric scoring) to produce an `overall` score and actionable issues.
- Evaluation snapshots are stored to Career Memory (`source=draft_review`, category `resume_draft` / `cover_letter`).
- A short rolling history is also persisted to `roles.metadata.draftEvaluation` for UI trend display.

## 2. Deterministic Generation (Script-Backed)

The deterministic pipeline generates a highly formatted, predictable resume or cover letter using direct script-based HTML templates without LLM variance. It uses the exact same `GoogleDriveClient.createDocFromHtml()` infrastructure as the NotebookLM pipeline.

- **Trigger:** API invocation or direct Agent RPC (`OrchestratorAgent.generate_docs_from_script(data, type)`).
- **Service:** `src/backend/services/docs-generator.ts`
- **Endpoints:**
  - `POST /api/docs-generator/generate-resume`
  - `POST /api/docs-generator/generate-cover-letter`
- **Data Schemas:** `ResumeRequestSchema`, `CoverLetterRequestSchema`
- **Database:** When a `roleId` is passed in the payload, the newly generated document is persisted directly to the D1 `documents` table and will automatically appear in the Role Viewport's Documents tab.

### Schema Requirements
The deterministic generator endpoints accept rigid JSON payloads. For example, the `ResumeRequestSchema` demands fields such as `targetRole`, `summaryStatement`, `skillsProduct`, `skillsData`, `googleBullets` (Array of HTML strings), and `osdBullets`. These are then injected into a stylized, self-contained HTML payload before multipart upload to Google Drive.

## 3. Resume ATS Engine & Live CV Optimization

The platform utilizes a real-time Google Docs CV pipeline that automatically scores and optimizes resumes against job descriptions based on a strict 5-tier ATS Taxonomy (Programming/Frameworks, Testing/Quality, Engineering Practices, Business Domain, Infrastructure/DevOps).

### How It Works

- **ATS Extraction:** The `ats-score.ts` AI task performs a lightweight, highly structured extraction of 30-50+ atomic keywords from a job posting mapped against the 5-tier taxonomy.
- **Real-Time Integration:** The backend exposes an `ats-score` API endpoint that accepts a Google Doc ID, fetches the live content from the user's active resume via the Google Docs SDK, and matches it directly against the extracted taxonomy.
- **Google Docs Webhook / Comment Polling:** The system listens for `@colby` or `#colby` tags inside Google Doc comments. When the agent is mentioned, it extracts the highlighted text, runs it through the strict CV Optimizer prompt (enforcing the "What + How + Result/Impact" format and banning fluff words), and replies directly in the Google Doc with an optimized, ready-to-accept bullet point.

### Resume Viewport & Assistant-UI

The frontend exposes a dedicated **Resume Viewport** (`ATSScoreDashboard`) which provides actionable metrics on the resume's alignment:
- **Top-Level Metrics:** Displays an overall ATS alignment score, the count of missing high-priority keywords, # of warnings, and # of open Google Doc comments.
- **Gap Analysis:** Visually breaks down keyword matches vs. misses across the 5 ATS taxonomy categories, allowing the user to immediately identify missing skills.
- **Assistant-UI Modal:** The viewport contains a context-aware assistant-ui chat interface. The user can interact with the agent to discuss missing keywords. The agent, equipped with Google Docs tools, can automatically read, modify, and optimize the Google Doc in real time based on the chat discussion, eliminating the need to manually copy-paste content between the UI and the resume.
