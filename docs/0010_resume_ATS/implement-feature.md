# Workflow: Google Docs CV Optimizer, Core AI Tasks, & Real-Time ATS Dashboard

Use this order for feature work:

1. D1 schema and Drizzle zod schemas.
2. AI provider, model, and task files.
3. Tools that wrap external services.
4. Colby Agent orchestration.
5. Hono routes with zod-openapi schemas.
6. Frontend pages and React components.

Frontend work should start with Stitch mockups when the connector is healthy. If Stitch generation fails, record the connector error and keep the implementation aligned to the PRD and shadcn dark design rules.

## 1. Context & Setup

- Read `src/backend/ai/tools/google/docs.ts` and `src/backend/ai/tasks/respond-to-comments.ts` to understand the existing Google Workspace I/O patterns.
- Read `src/frontend/components/role/RoleViewport.tsx` to understand the current frontend layout.

## 2. Backend Implementation (Core AI Tasks)

- [ ] Update `src/backend/ai/tasks/generate/resume-bullets.ts` to replace the stub with a comprehensive prompt enforcing the "What + How + Result/Impact" rules and explicit hallucination guards.
- [ ] Update `src/backend/ai/tasks/analyze/role.ts` (Phase 2). Modify the system prompt to apply Implicit Skill Mapping and incorporate the new ATS taxonomy categories when computing `hire_likelihood` and `counter_positioning`.

## 3. Backend Implementation (ATS Engine)

- [ ] Create `src/backend/ai/tasks/analyze/ats-score.ts`. Implement a lightweight LLM call utilizing `generateStructuredOutput` that extracts 30-50+ atomic keywords from a given job description (Languages, Testing, Engineering Practices, Business Domain, Infrastructure).
- [ ] Update Zod schemas in `types.ts` to support the new `JobPosting` and `JobPostingExtraction` structures.
- [ ] Create a new Hono API route in `src/backend/api/routes/analysis.ts` (e.g., `POST /api/roles/:id/ats-score`) that accepts a Google Doc ID, fetches the latest text via the Google Docs tool, runs the `ats-score` task, and returns the real-time match percentage and missing synonyms.

## 4. Backend Implementation (Google Docs Agent)

- [ ] Implement a listener or queue processor that handles Google Drive comment webhooks.
- [ ] When a comment containing `@colby` or `#colby` is detected, extract the highlighted document text.
- [ ] Run the text through a CV optimization prompt enforcing the "What + How + Result/Impact" rules and banning fluff words.
- [ ] Utilize the Google Drive/Docs API to insert the optimized bullet as a reply to the original comment thread.

## 5. Frontend Implementation

- [ ] Create `src/frontend/components/role/ATSScoreDashboard.tsx`.
- [ ] Implement UI for real-time scoring, displaying missing ATS keywords, and a "Refresh" button that triggers the new ATS backend route.
- [ ] Integrate this component into the main `RoleViewport.tsx` layout. Ensure it adheres to the internal UI component registry patterns (Dark Theme default).
