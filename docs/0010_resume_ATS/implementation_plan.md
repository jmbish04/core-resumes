# Implementation Plan v3: Google Docs CV Optimizer, Core AI Tasks, & Real-Time ATS Dashboard

**Context:** This plan modernizes our core-resumes platform by porting advanced prompt engineering rules and ATS parsing taxonomies from the `cvforge-app` architecture. It pivots away from standalone HTML generation, focusing entirely on real-time Google Docs integration and a live frontend ATS dashboard, while ensuring our offline core AI tasks remain fully synced with the new rules.

## 1. Architectural Changes & Data Structures

### [MODIFY] [types.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/orchestrator/types.ts)

- Expand `JobPostingExtractionSchema` and `JobPostingSchema` to include an exhaustive `tags` array categorized strictly by the new ATS taxonomy:
  - `programmingLanguagesAndFrameworks`
  - `testingAndQuality`
  - `engineeringPractices`
  - `businessDomain`
  - `infrastructureAndDevOps`

---

## 2. Core AI Pipeline Updates

### [MODIFY] [resume-bullets.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/generate/resume-bullets.ts)

- **Action:** Replace the current stub implementation with a production-ready prompt.
- **Rules:**
  - Integrate the strict "What + How + Result/Impact" writing structure.
  - Ban fluff words ("spearheaded", "synergized", "passionate", "guru").
  - Add explicit hallucination guards: NEVER invent jobs, degrees, or certifications. Preserve dates and company names exactly as provided in the source material.

### [MODIFY] [role.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/analyze/role.ts) (Phase 2)

- **Action:** Update the system prompt for the holistic role analysis (Phase 2).
- **Rules:**
  - Implement **Implicit Skill Mapping** (e.g., infer "scalability" from "high-traffic", "distributed systems" from "multiple services").
  - Ensure the LLM leverages the newly extracted ATS taxonomy (Languages, Testing, Practices, Domain, Infrastructure) to accurately compute the `hire_likelihood` and `counter_positioning` scores.

---

## 3. Real-Time Engine & Google Docs Integration

### [NEW] [ats-score.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/analyze/ats-score.ts)

- **Action:** Implement a lightweight, standalone LLM task using `generateStructuredOutput`.
- **Purpose:** Extracts 30-50+ atomic keywords from a job description based on the new ATS taxonomy. It must return fast, predictable JSON without triggering the heavier holistic hireability pipeline.

### [MODIFY] [respond-to-comments.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/respond-to-comments.ts)

- **Action:** Enhance the Google Drive comment webhook listener/polling mechanism.
- **Purpose:** When a comment containing `@colby` or `#colby` is detected in a linked Google Doc, the agent must:
  1. Extract the highlighted/surrounding document text.
  2. Run the text through the CV optimizer prompt (enforcing the "What + How + Result/Impact" rules).
  3. Reply to the Google Doc comment thread with the optimized bullet point using `src/backend/ai/tools/google/docs.ts`.

### [NEW/MODIFY] [analysis.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/analysis.ts)

- **Action:** Create a new Hono API route (e.g., `POST /api/roles/:id/ats-score`).
- **Purpose:** Accepts a Google Doc ID, fetches the latest live text via the Google Docs tool, runs the `ats-score.ts` task, and returns the real-time match percentage and missing synonyms to the frontend.

---

## 4. Frontend Implementation

### [NEW] [ATSScoreDashboard.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/ATSScoreDashboard.tsx)

- **Action:** Create a real-time scoring dashboard component for ATS keyword matching.
- **Features:**
  - Display current score, matched keywords, and missing ATS keywords based on the 5-tier taxonomy.
  - Include a "Refresh Score" button that triggers the `POST /api/roles/:id/ats-score` backend route to fetch live Google Doc text.
  - Adhere to the internal Shadcn UI component registry patterns (Default Dark Theme).

### [MODIFY] [RoleViewport.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/RoleViewport.tsx)

- **Action:** Integrate the `ATSScoreDashboard` component into the main layout.

---

## 5. Agent Rules & Workflow Updates

### [MODIFY] [implement-feature.md](file:///Volumes/Projects/workers/core-resumes/.agent/workflows/implement-feature.md)

- Merge new workflow steps for Core AI Tasks, ATS Engine, Google Docs Agent, and Frontend.

### [MODIFY] [ai-prompts.md](file:///Volumes/Projects/workers/core-resumes/.agent/rules/ai-prompts.md)

- Append CV Optimization & ATS Parsing Rules (Resume Bullet Standards, ATS Taxonomy, Implicit Skill Mapping, Holistic Role Analysis guidance).

---

## 6. Verification Plan

- **Backend (`resume-bullets.ts`):** Trigger the task manually and verify output adheres strictly to the "What + How + Result" format without fluff words.
- **Backend (`role.ts`):** Run a full `analyzeRole` and verify the Phase 2 output references implicit skill mappings and ATS taxonomy categories in `hire_likelihood` and `counter_positioning`.
- **Frontend:** Click "Refresh Score" on the `ATSScoreDashboard` and verify the API correctly fetches live text from Google Docs and returns a score populated across all 5 taxonomy categories.
- **Google Docs:** Tag `@colby` in a test resume document comment and verify the agent replies with an optimized bullet point.
