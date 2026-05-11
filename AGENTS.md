# Career Orchestrator Worker Briefing

This repo builds a single Cloudflare Worker for managing job applications, resume/cover-letter workflows, inbound recruiting email, and the Colby Durable Object agent.

## Architecture

- Backend: Hono API with `@hono/zod-openapi`.
- Frontend: Astro + React + shadcn dark UI served from the same Worker.
- Data: Drizzle ORM on D1. One table per file under `src/backend/db/schemas/`; `src/backend/db/schema.ts` is a barrel only.
- Schema Docs: Every table module must export `<TABLE_NAME>_TABLE_DESCRIPTION` (string) and `<TABLE_NAME>_COLUMN_DESCRIPTIONS` (Record<string, string>) for the docs frontend. The column descriptions map uses the **D1 column name** (snake_case), not the Drizzle camelCase property. These are imported by `src/backend/api/routes/docs.ts` to serve live documentation.
- AI: `env.AI.run()` binding through AI Gateway. One provider per file, one model per file, and one task per file under `src/backend/ai/`.
- Agent: `OrchestratorAgent` in `src/backend/ai/agents/orchestrator.ts`, exported by `src/_worker.ts`.
- Email: Worker `email()` delegates to `src/backend/email/handler.ts`.

## Golden Rules

- `worker-configuration.d.ts` is generated. Run `pnpm run cf-typegen` after every `wrangler.jsonc` binding change.
- `Env` is global. Do not import or redefine it.
- Do not hand-edit SQL migrations. Use `pnpm run db:generate`.
- All Workers AI calls use `env.AI.run(model, body, { gateway: { id: env.AI_GATEWAY_ID } })`. Do not construct gateway URLs manually.
- Routes and agents import AI tasks only from `src/backend/ai/tasks/`.
- Deploy with `pnpm run deploy`, never direct `wrangler deploy`.

## Intelligent Email-to-Role Routing & Global Inbox
- **AI Matching Engine:** Inbound emails are routed through `src/backend/ai/tasks/classify/email-role.ts`. The AI analyzes the email context (Subject, Body, Sender) against all active roles to compute an `aiRoleMatchConfidence` score and `aiRoleMatchRationale`, which are persisted to D1.
- **Auto-Generated Capabilities:** Based on the classification `nextAction`, the backend agent can automatically trigger actions such as drafting reply messages for scheduling, auto-updating role status upon a rejection letter, or drafting emails for negotiating compensation/thank you notes.
- **Global Inbox UI:** The `/emails` global inbox uses a `sidebar-09` inspired layout to prominently display the AI's role association, rationale, and confidence score. Unmatched emails flag a manual override alert.
- **Context-Aware Assistant-UI:** The Global Inbox features an assistant-ui modal that is aware of the currently viewed email in the preview editor. Users can interact with the agent via chat to CRUD documents, generate draft replies, edit existing drafts, or execute other context-aware actions.

## Secrets & Credentials

All secret access is centralized in `src/backend/utils/secrets.ts`.

### Three storage tiers (choose per use case)

| Tier              | Mechanism                                   | Access pattern            | Mutability            | Use when                                                    |
| ----------------- | ------------------------------------------- | ------------------------- | --------------------- | ----------------------------------------------------------- |
| **Secrets Store** | `secrets_store_secrets` in `wrangler.jsonc` | `await env.BINDING.get()` | Read-only (immutable) | Static credentials: API keys, tokens, service account creds |
| **Worker Secret** | `wrangler secret put NAME`                  | `env.NAME` (string)       | Updatable via CLI/API | Credentials that change occasionally                        |
| **KV**            | `env.KV.get("KEY")`                         | `await env.KV.get("KEY")` | Read/write at runtime | Values the worker itself needs to refresh or rotate         |

### `secrets.ts` API

- `getSecret(env, key)` — Generic accessor for any secrets store binding. Detects `.get()` method vs plain string.
- `getGoogleServiceAccountPrivateKey(env)` — Concatenates `GOOGLE_CREDS_SA_PRIVATE_KEY_PT_1` + `_PT_2` from secrets store (key was split due to 1024-byte secret store limit).
- `getGoogleServiceAccountClientEmail(env)` — Reads `GOOGLE_CREDS_SA_CLIENT_EMAIL` from secrets store.
- `getNotebookLMCookieSigningKey(env)` — Reads `NOTEBOOKLM_COOKIE_SIGNING_KEY` from **KV** (mutable, writable at runtime for cookie rotation).
- `getCareerNotebookLMId(env)` — Reads `CAREER_NOTEBOOKLM_ID` from **env vars** (`wrangler.jsonc` vars).
- `getWorkerApiKey(env)`, `getAgenticWorkerApiKey(env)`, etc. — Typed accessors for specific secrets store bindings.

### NotebookLM credential setup

NotebookLM uses the [notebooklm-sdk](https://github.com/agmmnn/notebooklm-sdk) with cookie-based authentication. CSRF tokens are discovered via Browser Rendering `/content` with a Chrome User-Agent to avoid Google's bot detection.

**KV-only session model** — cookies are managed exclusively through KV:

| Key                         | Purpose          | Update method                                              |
| --------------------------- | ---------------- | ---------------------------------------------------------- |
| `ACTIVE_NOTEBOOKLM_SESSION` | Session cookies  | Config → NotebookLM Session UI, or `pnpm run session:sync` |
| `NOTEBOOKLM_CSRF_CACHE`     | Cached CSRF auth | Auto-managed with sliding-window TTL (30 min idle expiry)  |

| Credential  | Storage | Binding                | Access                              |
| ----------- | ------- | ---------------------- | ----------------------------------- |
| Notebook ID | Env var | `CAREER_NOTEBOOKLM_ID` | `env.CAREER_NOTEBOOKLM_ID` (string) |

**Cookie refresh:** Run `pnpm run session:sync` to push local `~/.notebooklm/session.json` to KV instantly. Alternatively, paste raw cookies from Chrome DevTools via the Config UI.

**Session expiration:** When cookies expire, `consultNotebook()` throws `SessionExpiredError`. The `/api/notebook/chat` route returns 401 with the exact recovery command.

**CSRF token discovery:** Uses Browser Rendering `/content` endpoint with `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36` User-Agent. Tokens are cached in KV (`NOTEBOOKLM_CSRF_CACHE`) with an activity-based sliding window — active usage refreshes the 30-minute TTL, idle periods let it expire naturally.

**⚠️ Session Preservation Rule:** Health checks for NotebookLM must be **passive only** — validate cookie presence, structure, and age without making outbound requests to Google. Only explicit **user-initiated** actions (chat, resume drafts, analysis tasks) should trigger Browser Rendering CSRF fetch.

### Google Service Account credential setup

| Credential         | Storage                                          | Notes                                                            |
| ------------------ | ------------------------------------------------ | ---------------------------------------------------------------- |
| Private key part 1 | Secrets Store `GOOGLE_CREDS_SA_PRIVATE_KEY_PT_1` | Split across two bindings due to 1024-byte limit                 |
| Private key part 2 | Secrets Store `GOOGLE_CREDS_SA_PRIVATE_KEY_PT_2` | Concatenated at runtime by `getGoogleServiceAccountPrivateKey()` |
| Client email       | Secrets Store `GOOGLE_CREDS_SA_CLIENT_EMAIL`     |                                                                  |
| Access tokens      | KV (cached)                                      | Cached with `expires_in - 60s` TTL                               |

### Rules for adding new secrets

1. **Never** put secret values in `wrangler.jsonc` or source code.
2. **Immutable credentials** → add to Cloudflare Secrets Store, bind in `wrangler.jsonc` `secrets_store_secrets`.
3. **CLI-updatable credentials** → use `wrangler secret put NAME`, declare in `wrangler.jsonc` `secrets.required`.
4. **Runtime-mutable values** → use `env.KV.put()` / `env.KV.get()`.
5. **Always** add a typed accessor in `src/backend/utils/secrets.ts`.
6. **Always** run `pnpm run cf-typegen` after changing `wrangler.jsonc`.

## Frontend Rules

- Use dark shadcn-style UI.
- `BaseLayout.astro` renders `Navbar` and `ErrorLogger` on every page.
- Never use `window.alert`, `window.confirm`, or `window.prompt`.
- No mock data. Empty states must come from real empty API responses.
- Tables need sort and filter controls.

## Chat & Assistant-UI Architecture

- The role-scoped chat interface uses `@assistant-ui/react` and `@assistant-ui/react-ai-sdk`.
- **Runtime:** `useChatRuntime` from `@assistant-ui/react-ai-sdk` connects to `/api/chat` (AI SDK v6 data stream protocol).
- **Thread primitives:** Use `ThreadPrimitive`, `MessagePrimitive`, `ComposerPrimitive`, `ActionBarPrimitive` from `@assistant-ui/react`. Do NOT build custom chat components.
- **Dictation:** Use `ComposerPrimitive.Dictate` / `StopDictation` with the custom `CloudflareWhisperAdapter` in `src/frontend/lib/cloudflare-whisper-adapter.ts`. Do NOT create custom audio recording buttons.
- **TTS:** Use `ActionBarPrimitive.Speak` with the custom `CustomTTSAdapter` in `src/frontend/lib/custom-tts-adapter.ts`.
- **Tool UIs:** Register tool-specific UIs using `makeAssistantToolUI` in `src/frontend/components/assistant-ui/tool-ui.tsx`.
- **Provider:** `RoleChatProvider` wraps the runtime, adapters, and tool UIs — used by `RoleViewport.tsx`.

## UI Component Management

- **Manual Merge policy:** Never force-install shadcn components with `-y` or `-o`. Use `shadcn add --diff` and review changes before applying.
- **Side-car scoping:** Custom modifications to shadcn components should use wrapper components or CSS overrides, not direct edits to `src/frontend/components/ui/*.tsx`.
- **assistant-ui primitives first:** Always extend via adapters (`SpeechSynthesisAdapter`, `DictationAdapter`) rather than rebuilding UI from scratch.

## Voice Pipeline

- **TTS:** `/api/tts` → Deepgram Aura-2 (`@cf/deepgram/aura-2-en`) → streaming MP3.
- **STT:** `/api/transcribe` → Whisper (`@cf/openai/whisper-large-v3-turbo`) → JSON `{ text }`. Audio persisted to R2 (`R2_AUDIO_BUCKET`).
- Both routes go through AI Gateway.

## Hireability Analysis

- **Pipeline:** `src/backend/ai/tasks/analyze-role.ts` — multi-step (extract requirements → NotebookLM evidence → gpt-oss-120b structured scoring → D1 persistence).
- **Tables:** `role_analyses` (top-level scores) + `role_alignment_scores` (per-requirement).
- **API:** `GET /api/roles/:roleId/analysis`, `POST /api/roles/:roleId/analysis`, `GET /api/roles/:roleId/analysis/alignment`.
- **UI:** `HireabilityHeader.tsx` (radial gauge charts) + `AlignmentBreakdown.tsx` (grouped tiered scores).
- **Trigger:** Via OrchestratorAgent task queue (`role_analysis` task type) or POST API.

## OpenRoute Integration

- **API:** HeiGIT `api.heigit.org/openrouteservice/v2/`.
- **Service:** `src/backend/services/openroute-service.ts` encapsulates directions and geocoding.
- **Commute Analysis:** Used in `generateLocationInsight` to inject factual driving metrics into the LLM prompt.
- **Resilience:** OpenRoute API calls use a strict `AbortSignal.timeout(2500)` per step. If OpenRoute times out or fails, the pipeline immediately falls back to `GoogleMapsService` (which itself has a 5000ms abort signal) to prevent worker hang during health checks.

## Health Service

- Health check modules: d1, kv, secrets, envVars, notebookLm, workersAi, aiGateway, googleDrive, **tts**, **stt** (10 total).
- Service: `src/backend/services/health-service.ts`.
- Screenings persisted to `health_screenings` table.

## Career Memory System

- **Dual Storage:** Every memory is persisted in both D1 (`career_memory` table) and Vectorize (`core-resumes-career-memory` index).
- **Same UUID:** D1 primary key = Vectorize vector ID, enabling consistent cross-referencing.
- **Embedding Model:** `@cf/baai/bge-large-en-v1.5` (1024 dimensions).
- **Service:** `src/backend/services/career-memory-service.ts` — `remember()`, `recall()`, `list()`, `stats()`, `softDelete()`, `update()`.
- **API:** `GET /api/memory`, `GET /api/memory/stats`, `GET /api/memory/search?q=`, `GET /api/memory/:id`, `PATCH /api/memory/:id`, `DELETE /api/memory/:id`.
- **UI:** `/memory` page — browse by category, semantic search, inline edit (revision tracking), soft-delete with confirmation.
- **Soft Delete:** Sets `is_active=0` + `deleted_at` in D1, hard-deletes from Vectorize (no soft-delete support). `replaced_by_id` links old → new revisions.
- **Categories:** `career_fact`, `role_analysis`, `resume_draft`, `cover_letter`, `interview_prep`, `comment_feedback`, `general`.
- **Sources:** `notebooklm`, `user_input`, `draft_review`, `comment_response`.

## NotebookLM Query Pipeline

- **Auth Decoupling:** All session checks centralized in `src/backend/ai/tools/notebooklm.ts` via `checkNotebookLMSession()`. Agents never touch KV/secrets directly.
- **Query Preparation:** `src/backend/ai/tasks/prepare-query.ts` — Workers AI (`gpt-oss-120b`) refines raw queries into evidence-seeking prompts before sending to NotebookLM.
- **Response Evaluation:** Same task evaluates NotebookLM responses for completeness and generates automatic follow-up queries if gaps detected.
- **Memory Integration:** Every NotebookLM consultation stores the full exchange (query, answer, references, metadata) in career memory.

## Resume Pipeline (Google Docs & ATS-Backed)

- **Task:** `src/backend/ai/tasks/draft-with-notebook.ts` — 4-phase pipeline + Real-time ATS Dashboard.
- **ATS Taxonomy Engine:** `src/backend/ai/tasks/analyze/ats-score.ts` parses job postings to extract 30-50+ atomic keywords across 5 strict categories (Languages/Frameworks, Testing/Quality, Engineering Practices, Business Domain, Infrastructure/DevOps).
- **Google Docs Webhook & Polling:** `respond-to-comments.ts` listens for `@colby` or `#colby` tags in comments. The agent extracts the surrounding text, applies strict CV Optimization rules (e.g., "What + How + Result/Impact", no fluff words), and replies with the optimized bullet point directly in Google Docs.
- **Live Scoring Dashboard:** The frontend `ATSScoreDashboard` component fetches the latest live text from the connected Google Doc, runs the ATS scoring task, and provides real-time gap analysis and alignment metrics.
- **Assistant-UI Integration:** The Resume Viewport contains an assistant-ui modal allowing the user to chat with the agent to make resume changes. The agent uses its Google Docs skills to execute CRUD operations on the resume in real time.
- **Phase 1:** Pre-Draft Consultation — NotebookLM identifies relevant career evidence for the specific role.
- **Phase 2:** AI Draft — Workers AI synthesizes evidence + resume bullets into document content.
- **Phase 3a:** Accuracy Review — NotebookLM verifies factual accuracy, triggers auto-correction if issues found.
- **Phase 3b:** Strategic Review — NotebookLM evaluates positioning, triggers strategic improvements.
- **Phase 4:** Google Doc Creation — renders branded template → uploads to Google Drive → persists `documents` record.
- **RPC:** `OrchestratorAgent.draft_resume(roleId, docType)` and `OrchestratorAgent.respond_to_comments(roleId, gdocId)`.
- **Task Types:** `resume_review`, `cover_letter_draft`, `resume_comment_response`.
- **WebSocket Progress:** Each phase broadcasts via `{ type: "draft_progress" | "comment_progress" }` messages.

## Deterministic Document Generation (Script-Backed)

- **Service:** `src/backend/services/docs-generator.ts` — Deterministic HTML generation for resumes and cover letters.
- **API:** `POST /api/docs-generator/generate-resume`, `POST /api/docs-generator/generate-cover-letter`.
- **Pipeline:** Generates HTML from structured JSON input → uploads to Google Drive via `GoogleDriveClient.createDocFromHtml` → persists `documents` record.
- **RPC:** `OrchestratorAgent.generate_docs_from_script(data, docType)`.
- **Usage:** Alternative to the NotebookLM pipeline for explicitly parameterized, template-driven document creation without LLM generation variance.

## Google Docs Comment Response

- **Task:** `src/backend/ai/tasks/respond-to-comments.ts` — processes `@colby` / `#colby` tagged comment threads.
- **Pipeline:** Read doc + comments → extract highlighted text context → consult NotebookLM → Workers AI formats reply → post reply → store in career memory.

## Prompt Engineering & Token Allocation

- **No `.join("\\n")`:** Never construct prompts using arrays joined by escaped line breaks (`.join("\\n")`). This breaks LLM structural parsing. Always use native ES6 template literals (`` ` ``) to preserve real new lines.
- **Aggressive XML:** Non-negotiable instructions (such as "DO NOT SUMMARIZE" or "VERBATIM EXTRACTION") must be wrapped in strict XML tags (e.g. `<STRICT_VERBATIM_EXTRACTION>...</STRICT_VERBATIM_EXTRACTION>`) to ensure enforcement.
- **Max Tokens Allocation:** By default, LLMs summarize text if they feel constrained by implicit output window limits. For large text extraction or heavy generative tasks, explicitly set `max_tokens: 8096` in the AI invocation to guarantee the model does not prematurely truncate or paraphrase.

## Frontend Documentation Rules

- **On every agentic turn**, agents MUST ensure that any code modified, fixed, or created is comprehensively covered in the frontend documentation (`src/frontend/content/docs/**/*.md`).
- **Metadata**: Update the `date_last_updated` (or similar metadata) visible on the page whenever a doc page is modified.
- **Organization**: Ensure the doc pages and sidebar navbar are organized logically. If a doc page becomes too large, split it into standalone pages. Create new categories if existing ones do not fit.
- **Standalone Docs**: All standalone docs must have dedicated page URLs.
- **Hyperlinkable Sections**: Document sections must be hyperlinkable. As the user scrolls, the URL parameter must update to reflect the active section, and loading a URL with a section parameter must scroll to that exact spot.

## References

- Product spec: `docs/0001_init/PRD.md`
- Build queue: `docs/0001_init/TASKS.json`
- Local agent rules: `.agent/rules/*`
- Local workflow: `.agent/workflows/implement-feature.md`
