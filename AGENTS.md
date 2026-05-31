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
- Real-time Broadcasting: `SyncBroadcastAgent` in `src/backend/ai/agents/sync-broadcast/index.ts` — dedicated single-concern Agent DO for fanning out sync-progress WebSocket events to the Pipeline dashboard.

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

- Health check modules: d1, kv, secrets, envVars, notebookLm, workersAi, aiGateway, googleDrive, **tts**, **stt**, **job_board_api_connectivity** (11 total).
- The `job_board_api_connectivity` check aggregates all registered job board API providers (Greenhouse, AshbyHQ, Gem, **RSS feeds**) into a single result with per-provider breakdown.
- Service: `src/backend/services/health-service.ts`.
- Screenings persisted to `health_screenings` table.

## RSS Feed Aggregator Pipeline (Pipeline C)

- **Cron:** Runs on the 12-hour cron (`0 */12 * * *`) alongside the freelance scanner.
- **Service:** `src/backend/services/rss/aggregator.ts` — `runRssAggregator()`.
- **XML Parser:** `src/backend/services/rss/xml-parser.ts` — V8-native regex parser, no npm dependencies. Handles RSS 2.0 and Atom feeds.
- **Feed Providers:** Modular registry at `src/backend/services/rss/feeds/`. Each provider implements `RssFeedProvider`.
  - ATS providers (per-company token): `greenhouse-rss.ts`, `lever-rss.ts`
  - Industry feeds (static URLs): `weworkremotely.ts`, `remotive.ts`
  - Registry barrel: `src/backend/services/rss/feeds/index.ts`
- **To add a new feed:** Create `{name}.ts` implementing `RssFeedProvider`, import and add to `RSS_FEED_PROVIDERS` array in `index.ts`.
- **Dedup:** R2-backed catalog at `src/backend/services/rss/dedup-catalog.ts`. Key: `rss-dedup/{provider}.json` on `R2_JOBS_BUCKET`. Persists seen job IDs indefinitely.
- **Config:** ATS tokens loaded from `health_check_config.greenhouse_tokens` / `.lever_tokens`. Industry feeds from `health_check_config.rss_industry_feeds`.
- **API:** `POST /api/pipeline/rss/scan` (manual trigger), `GET /api/pipeline/rss/feeds` (list feeds + catalog stats), `POST /api/pipeline/rss/migrate-ids` (one-time ID normalization).
- **HITL Flow:** RSS jobs enter the same `jobs_postings` table and Discovery Dashboard pipeline as Pipelines A/B. The `isRelevantJob()` utility scores jobs at insertion time, setting `isRecommended` for the HITL queue.

## Shared Job Pipeline Utilities

- **`isRelevantJob()`** — `src/backend/services/jobs/relevance.ts`. Pure keyword + location matching against `applicant_profile` config. Used by all pipelines and the discovery scorer cron. No AI.
- **`normalizeJobSiteId()`** — `src/backend/services/jobs/normalize-id.ts`. Strips pipeline prefixes (`gh-{token}-`, `lv-{token}-`, `as-{token}-`) to produce the raw ATS job ID for cross-pipeline dedup.
- **`migrateJobSiteIds()`** — `src/backend/services/jobs/migrate-ids.ts`. One-time migration to normalize existing prefixed `job_site_id` values in D1. Run via `POST /api/pipeline/rss/migrate-ids`.

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

## NotebookLM FastAPI Bridge & VPC Tunneling

To bypass Google edge bot detection and prevent 1-hour session cookie expirations, all NotebookLM SDK calls can be offloaded to a local background FastAPI bridge server (`scripts/notebooklm_fastapi_server.py`) running on the host GUI session and securely tunneled via a private **VPC Service binding**.

### Architecture & Bindings
* **VPC Service Binding (`VPC_SERVICE`)**: Binds the Cloudflare Worker to the Cloudflare Tunnel private endpoint, allowing secure HTTP requests to private local endpoints.
* **Worker Factory Interceptor**: `createNotebookClient` automatically returns a transparent `NotebookLMFastAPIProxy` that proxies all method invocations over the VPC fetch client whenever `env.NOTEBOOKLM_FASTAPI_URL` is set in `wrangler.jsonc`.
* **Cookie Self-Healing**: The FastAPI bridge pins its cookie state path to the single canonical state `/Users/126colby/.notebooklm/storage_state.json`. On any auth failure, it automatically invokes `sync-cookies.py` to extract fresh decrypted session cookies from Chrome Profile 6, copies them to the canonical state file, and auto-retries the failed query loop zero-touch.
* **VPC Connection health check**: The `notebooklm_credentials` health module runs an active connection test to `${NOTEBOOKLM_FASTAPI_URL}/health` over `env.VPC_SERVICE`. If the connection fails, it wraps the error in a detailed troubleshooting prompt in the `aiSuggestion` parameter to guide coding agents in debugging plist or tunnel configurations.

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

- **⛔ No Array-Based Prompt Construction:** Never build prompts as `string[]` arrays (whether joined with `.join("\n")`, `.join("\\n")`, or any other separator). This includes `parts.push(...)` patterns. Array-joined prompts serialize escaped `\n` characters in JSON payloads instead of real newlines, which degrades LLM structural parsing. **Always use native ES6 template literals (`` ` ``)** with real line breaks. For dynamic conditional sections, build each section as a separate template literal string and interpolate it into the main template literal.

```ts
// ❌ WRONG — every variation of this pattern is banned:
const parts: string[] = ["You are an assistant.", "", "## Rules", "- Rule 1"];
parts.push("- Rule 2");
return parts.join("\n");

// ❌ ALSO WRONG — .join("\\n") doesn't fix it:
return parts.join("\\n");

// ✅ CORRECT — single template literal with real newlines:
const rulesSection = hasRules ? `
## Rules
- Rule 1
- Rule 2` : "";

return `You are an assistant.
${rulesSection}

## Instructions
Do the thing.`;
```

- **Aggressive XML:** Non-negotiable instructions (such as "DO NOT SUMMARIZE" or "VERBATIM EXTRACTION") must be wrapped in strict XML tags (e.g. `<STRICT_VERBATIM_EXTRACTION>...</STRICT_VERBATIM_EXTRACTION>`) to ensure enforcement.
- **Max Tokens Allocation:** By default, LLMs summarize text if they feel constrained by implicit output window limits. For large text extraction or heavy generative tasks, explicitly set `max_tokens: 8096` in the AI invocation to guarantee the model does not prematurely truncate or paraphrase.

## Frontend Documentation Rules

- **On every agentic turn**, agents MUST ensure that any code modified, fixed, or created is comprehensively covered in the frontend documentation (`src/frontend/content/docs/**/*.md`).
- **Frontmatter Template**: Every doc page MUST include YAML frontmatter with at minimum `title` and `date_last_updated` fields. The layout template renders a timestamp badge from `date_last_updated` — green if within 30 days, amber with "Xd ago" if stale. Example:
  ```yaml
  ---
  title: "Page Title"
  description: "Brief description of the page content."
  date_last_updated: "2026-05-31"
  ---
  ```
- **Metadata**: Update the `date_last_updated` field whenever a doc page's content is modified.
- **Stale Check**: Agents MUST scan for stale documentation (> 30 days since `date_last_updated`) in areas related to their current work. If stale docs are found and the agent has context to update them, update both the content and the `date_last_updated` field. This is a **mandatory quality gate** — do not leave stale docs in areas you are actively modifying.
- **Organization**: Ensure the doc pages and sidebar navbar are organized logically. If a doc page becomes too large, split it into standalone pages. Create new categories if existing ones do not fit.
- **Standalone Docs**: All standalone docs must have dedicated page URLs.
- **Hyperlinkable Sections**: Document sections must be hyperlinkable. As the user scrolls, the URL parameter must update to reflect the active section, and loading a URL with a section parameter must scroll to that exact spot.
- **Mermaid Diagrams**: All architectural charts, lifecycles, and flow sequences MUST be drawn as Mermaid diagrams. ASCII art or plain text graphical drawings are strictly forbidden. Always use standard syntax and enclose node labels in double quotes.

## References

- Product spec: `docs/0001_init/PRD.md`
- Build queue: `docs/0001_init/TASKS.json`
- Local agent rules: `.agent/rules/*`
- Local workflow: `.agent/workflows/implement-feature.md`

## Aggregator Sync & WebSocket Broadcasting

The aggregator sync pipeline connects a GitHub Action script to the Pipeline dashboard via a dedicated Cloudflare Agents SDK Durable Object.

### Flow

```
GitHub Action (sync-upstream.py)
  → POST /api/pipeline/api-companies/sync-progress  (Hono, api-companies.ts)
    → getAgentByBinding(env, "SYNC_BROADCAST_AGENT", "global")
      → agent.reportProgress(body)                   (Worker → Agent DO RPC, typed)
        → this.broadcast()                           → all open WebSocket clients

Pipeline dashboard (PipelineOperations.tsx)
  → useAgent({ agent: "SyncBroadcastAgent", name: "global" })
    → routeAgentRequest in _worker.ts handles WS upgrade at
      /agents/SyncBroadcastAgent/global
```

### `SyncBroadcastAgent`

- **Location:** `src/backend/ai/agents/sync-broadcast/index.ts`
- **Binding:** `SYNC_BROADCAST_AGENT` (wrangler.jsonc `durable_objects.bindings`)
- **Migration:** `v5` (`new_sqlite_classes: ["SyncBroadcastAgent"]`)
- **Export:** Named export in `src/_worker.ts` — required for the runtime to instantiate the DO class.
- **Instance name:** Always `"global"` (singleton — one per deployment).
- **Purpose:** Single-concern — holds WebSocket connections open and calls `this.broadcast()` to fan-out events. No AI, no database writes, no business logic.

#### RPC protocol — Worker → Agent (DO RPC)

Calling an agent **from the same Worker** uses Durable Object RPC via `getAgentByName`
from the Agents SDK. Modern `wrangler types` emits the namespace generic referencing the
agent class (e.g. `DurableObjectNamespace<import("./dist/_worker.js/index").SyncBroadcastAgent>`),
so the returned stub is fully typed at the callsite with no casts and no explicit generics.
No `@callable()` decorator is needed on the agent method when the caller is inside the
same Worker.

```ts
import { getAgentByName } from "agents";

// In the Hono route:
const agent = await getAgentByName(c.env.SYNC_BROADCAST_AGENT, "global");
await agent.reportProgress(body); // typed against reportProgress signature
```

**Prerequisite:** the Env binding type must carry the agent class generic. That happens
automatically when you run `pnpm run cf-typegen` after each `wrangler.jsonc` change. The
generated import points to `dist/_worker.js/index`, so the build output must exist for
the type to fully resolve — `pnpm run build` once, and the types are in place.

`@callable()` is **only** for WebSocket RPC from external clients (browsers/mobile).
See [Callable methods docs](https://developers.cloudflare.com/agents/api-reference/callable-methods/) — specifically the "Why the distinction" table.

#### Anti-patterns — never do these

```ts
// ❌ Wrong: scattered casts that pre-date the typed Env generic
const agent = await getAgentByName<Env, SyncBroadcastAgent>(
  env.SYNC_BROADCAST_AGENT as unknown as DurableObjectNamespace<SyncBroadcastAgent>,
  "global",
);

// ❌ Wrong: raw DO stub.fetch to a /rpc/ path
const stub = c.env.SYNC_BROADCAST_AGENT.get(id);
await stub.fetch(new Request("https://agent/rpc/reportProgress", ...));

// ❌ Wrong: as any cast — hides real type errors
await getAgentByName<Env, SyncBroadcastAgent>(env.SYNC_BROADCAST_AGENT as any, "global");

// ❌ Wrong: (stub as any).method() — silently fails at runtime
(stub as any).reportProgress(body);
```

#### WebSocket client (frontend)

The dashboard connects using the Agents SDK React hook:

```tsx
const agent = useAgent({
  agent: "SyncBroadcastAgent", // must match the class name
  name: "global", // must match idFromName() on the server
  onMessage: (message) => {
    /* handle { type: "sync_progress", payload } */
  },
});
```

`routeAgentRequest` in `_worker.ts` automatically handles the WebSocket upgrade — no custom HTTP handler needed.

#### Adding new broadcast events

1. Add the event shape to `SyncProgressPayload` in `src/backend/ai/agents/sync-broadcast/index.ts`.
2. If the Python script sends a different schema, update `syncProgressBody` in `src/backend/api/routes/pipeline/types.ts`.
3. Update the `onMessage` handler in `PipelineOperations.tsx` to handle the new event type.
4. No wrangler.jsonc changes are needed — the agent is already registered.

---

## Job Board Provider Registry

- **Registry:** `src/backend/pipeline/job-board-providers/` — single source of truth for all ATS providers.
- **Providers:** Greenhouse, AshbyHQ, Gem (3 registered). Each implements `JobBoardProvider` interface from `types.ts`.
- **Tool Clients:** `src/backend/ai/tools/{greenhouse,ashby,gem}.ts` — low-level API clients.
- **Unified Scraper:** `scrapeJobFromBoard()` in `index.ts` auto-detects the provider by explicit system name or ID-format heuristic.
- **Board Def Seeding:** On company promote, the provider registry determines the `company_job_board_defs` entry. No fallback assumptions — only confirmed providers get board mappings.
- **Health Checks:** `src/backend/health/checks/job-board-apis/index.ts` runs all provider checks in parallel.
- **Onboarding:** See `.agent/rules/job-board-providers.md` for the 8-step checklist.

## Maintenance Instructions for Job Board Pipeline Agents

The `JobScannerAgent`, `JobAnalysisAgent`, and `SyncBroadcastAgent` manage the automated job discovery, analysis, and real-time pipeline observability. All are Cloudflare Durable Objects mapped to the `Agent<Env, State>` class from the Cloudflare Agents SDK.

### `JobScannerAgent`

- **Location:** `src/backend/ai/agents/job/scanner/`
- **State:** Tracks active runs by token and maintains a processing queue of `AnalyzeJob` objects.
- **Maintenance:**
  - When updating the scraping logic, modify `methods/scan-board.ts`.
  - Ensure the WebSocket progress broadcasting (`agent.broadcastProgress`) is preserved so the frontend `PipelineProgress` component stays in sync.
  - The scheduled triage batcher lives in `methods/triage-batch.ts`. If batch sizes or analysis routing logic changes, update it here.

### `JobAnalysisAgent`

- **Location:** `src/backend/ai/agents/job/analysis/`
- **State:** Tracks the current phase (`consult-notebook`, `deep-analyze`, `persist`, `archive`, `embed`, `done`) of in-flight snapshot analyses.
- **Maintenance:**
  - The analysis pipeline executes sequentially via `runPipeline`. Each phase is isolated in its own file under `methods/` for maintainability.
  - If a new analysis step is required (e.g., scoring a new dimension), add it to `types.ts` as a new `Phase`, create a corresponding method file, and inject it into the `runPipeline` sequence.
  - Failures are caught globally per snapshot. If you need phase-specific retry logic, wrap the specific handle method call in `runPipeline`.

### `SyncBroadcastAgent`

- **Location:** `src/backend/ai/agents/sync-broadcast/index.ts` (single file — no `methods/` subdirectory, intentional)
- **State:** Stateless (`Record<string, never>`) — this agent holds no persistent state. Its only job is to hold WebSocket connections and broadcast messages.
- **Binding:** `SYNC_BROADCAST_AGENT` → `wrangler.jsonc` durable_objects.bindings
- **Migration tag:** `v5`
- **Maintenance:**
  - **Do not add business logic here.** If you find yourself writing D1 queries, AI calls, or complex state in this file, that logic belongs in a different agent or service.
  - `reportProgress(payload)` is a plain public method (NOT `@callable`). It is invoked Worker → Agent via the typed `getAgentByBinding(env, "SYNC_BROADCAST_AGENT", "global")` helper, then calls `this.broadcast()` to fan the message out.
  - `onConnect` / `onClose` are lifecycle hooks only. They log connection events; do not add stateful side-effects.
  - The broadcast message envelope is always `{ type: "sync_progress", payload: SyncProgressPayload }`. If the frontend needs new event types, add them as additional public methods (e.g., `reportError`, `reportComplete`) rather than overloading the payload shape.
  - If you add or rename a binding, run `pnpm run cf-typegen`, then add the new entry to `AgentBindingMap` in `src/backend/ai/agents/registry.ts`.

### SalaryAgent

- **Location:** `src/backend/ai/agents/salary/`
- **State:** Stateful DO (`Agent<Env, Record<string, never>>` currently, holds in-memory context for chat sessions).
- **Binding:** `SALARY_AGENT` → `wrangler.jsonc` durable_objects.bindings
- **Migration tag:** `v7`
- **Maintenance:**
  - **No Sandbox:** This agent strictly uses deterministic SQL via AST validation (`node-sql-parser`). Do not introduce Python sandboxing.
  - **Modes:** Routing happens in `index.ts` to `single-role.ts`, `aggregate.ts`, or `chat.ts`.
  - **SQL Security:** AST validation requires `ast.type === 'select'`, rejects stacked statements, limits tables to `ALLOWED_TABLES`, wraps queries with `LIMIT`, and logs to `salary_agent_queries`.

### Adding New Agent Methods

For `JobScannerAgent` and `JobAnalysisAgent` (modular `methods/` pattern):

1. Create a standalone function in `methods/<method-name>.ts`.
2. Export it from `methods/index.ts`.
3. Wrap it in a `@callable()` method on the corresponding agent class in `index.ts`.
4. Update `docsMetadata` to include the new method name and parameters for live documentation generation.

For `SyncBroadcastAgent` (single-file pattern):

1. Add the new public method directly to `index.ts` (no `@callable()` — Worker → Agent only).
2. Update `SyncProgressPayload` if the payload shape changes.
3. Update `docsMetadata.methods` array.
4. Update the `onMessage` handler in `PipelineOperations.tsx` to handle the new message type.

### Adding a new Agent class

1. Add the binding + migration in `wrangler.jsonc` (`durable_objects.bindings` + `migrations.new_sqlite_classes`).
2. Implement the class. For Cloudflare Agents SDK agents use `class MyAgent extends Agent<Env, State>` from `"agents"`; for chat use `extends AIChatAgent<Env>` from `"@cloudflare/ai-chat"`.
3. Re-export the class from `src/_worker.ts` (named export — required at runtime).
4. Run `pnpm run cf-typegen` to regenerate `worker-configuration.d.ts` with the new typed namespace binding.
5. `pnpm run build` once so `dist/_worker.js/index.js` exists for the generated import path to resolve.
6. `pnpm run types` to confirm zero errors.
