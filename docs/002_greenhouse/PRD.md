# PRD — Greenhouse Retrofit into core-resumes

> Initiative: **002_greenhouse**
> Source project: `/Volumes/Projects/greenhouse` (Python FastAPI + Astro/React)
> Target project: `/Volumes/Projects/workers/core-resumes` (Cloudflare Workers, Astro+Hono+D1+Drizzle)

## Context

`/Volumes/Projects/greenhouse` is a Python FastAPI + SQLAlchemy + Astro/React job-scanning service. It scrapes Greenhouse boards, runs a two-pass AI pipeline (Jules triage → Workers AI gpt-oss-120b deep analysis), embeds snapshots via Gemini → Cloudflare Vectorize, and presents a "Command Center" UI for human-in-the-loop (HITL) feedback. It runs against a local SQLite DB and a separately-hosted FastAPI backend.

`/Volumes/Projects/workers/core-resumes` is a single Cloudflare Worker that already runs the parallel "downstream" experience: a Hono+OpenAPI API, D1+Drizzle data layer, an Astro+shadcn dark-theme frontend, NotebookLM integration (RPC + WebSocket + MCP), Browser Rendering, an AI Gateway-routed Workers AI provider, OrchestratorAgent task-queue Durable Object, and a 10-module cron-driven health system. It already owns the `roles` (job applications), `resume_bullets` (verified accomplishments), `documents` (Google Drive refs), and `role_analyses` (hireability scoring) domain — i.e. the resume + cover letter experience the user wants the scanned jobs to flow into.

The retrofit folds the greenhouse scanner into core-resumes so a single Worker:

1. Scans Greenhouse boards (replaces Python pipeline) and stores postings as D1 + R2 (markdown + PDF) artifacts
2. Runs AI triage and deep analysis via Cloudflare Agents SDK Durable Objects
3. Consults the existing NotebookLM (career history) per-role to ground the analysis in 13+ years of performance reviews, paychecks, and promotions
4. Presents a Command Center frontend matching greenhouse's UX, with PDF preview modal sourced from R2
5. Bridges scanned jobs into core-resumes' existing `roles` lifecycle via an "Apply" button that pre-fills a role from the snapshot and redirects to the existing resume/cover-letter experience
6. Adds an Applications dashboard for status tracking (preparing → applied → interview → offer/rejected/archived)

The outcome is one Worker handling discovery → analysis → resume tailoring → application tracking, with everything running on Cloudflare primitives (D1, R2, Vectorize, Browser Rendering, Workers AI, AI Gateway, Durable Objects).

---

## Architecture Overview

```
                ┌───────────────────────────────────────────────────────┐
                │              core-resumes Worker (single)             │
                │                                                       │
   ┌────────────┴───┐  Hono+OpenAPI (zod-openapi)                       │
   │ /api/jobs/*    │  /api/roles/*, /api/applications/*, /api/notebook │
   │ /api/applications│ + existing /api/chat /api/tts /api/transcribe   │
   └────────────┬───┘                                                   │
                │                                                       │
   ┌────────────┴────────────┐  ┌──────────────────────────────────┐    │
   │  Astro SSR + shadcn     │  │  Durable Object Agents (new)     │    │
   │  /jobs (Command Center) │  │  • JobScannerAgent               │    │
   │  /jobs/history          │  │  • JobAnalysisAgent              │    │
   │  /jobs/sessions         │  │  + existing OrchestratorAgent /         │    │
   │  /jobs/companies/[token]│  │    NotebookLMAgent /             │    │
   │  /applications          │  │    NotebookLMMcpAgent            │    │
   │  + existing /roles/[id] │  └──────────────────────────────────┘    │
   └────────────┬────────────┘                                          │
                │                                                       │
   ┌────────────┴───────────────────────────────────────────────────┐   │
   │  AI Providers (modular)                                        │   │
   │   • workers-ai (existing) → env.AI.run via AI Gateway          │   │
   │   • google-ai-studio (NEW) → @google/genai SDK with            │   │
   │       baseURL = await env.AI.gateway(ID).getUrl("google-ai-studio")│
   │       header: cf-aig-authorization: Bearer {AI_GATEWAY_TOKEN}  │   │
   └────────────┬───────────────────────────────────────────────────┘   │
                │                                                       │
   ┌────────────┴───────────────────────────────────────────────────┐   │
   │  D1 (Drizzle, modular schemas in 5 categories:                 │   │
   │  applications/, career/, communications/, jobs/, system/)      │   │
   └────────────────────────────────────────────────────────────────┘   │
                                                                        │
   R2 (NEW: core-resumes-jobs)   Vectorize (binding: greenhouse-jobs)   │
   Browser Rendering /pdf /md    NotebookLM (existing) for evidence    │
   └────────────────────────────────────────────────────────────────────┘
```

### Resolved decisions

1. **Vectorize index `greenhouse-jobs` is 768 dims.** Gemini embedding-001 is invoked with `outputDimensionality: 768` to match.
2. **Triage layer = Workers AI `@cf/openai/gpt-oss-120b` only.** Jules is dropped entirely. One model handles both triage and deep analysis. The existing `JULES_API_KEY` Secrets Store binding stays (used by an unrelated existing Jules MCP integration).
3. **Schema modularization: full refactor.** Existing flat schemas move into `applications/`, `career/`, `communications/`, `system/`; new greenhouse tables live under `jobs/`. Drizzle migrations are unaffected because table definitions don't change — only file paths.
4. **Settings UX:** the existing `/config` page becomes a **multi-tab layout** using shadcn `Tabs`. Board-token management is a new "Job Boards" tab.

### BYOK Gemini path (critical)

Per Cloudflare docs ([worker-binding-methods](https://developers.cloudflare.com/ai-gateway/integrations/worker-binding-methods/)): "BYOK is not supported for third-party models called through the AI binding." So `env.AI.run("google-ai-studio/gemini-embedding-001", …)` uses Unified Billing — Cloudflare manages the key. To honor the user's BYOK preference (own `GEMINI_API_KEY` + `CLOUDFLARE_AI_GATEWAY_TOKEN` in Secrets Store), we use the Gemini SDK with the AI Gateway URL as base URL — still flowing through AI Gateway analytics/caching/rate-limiting:

```ts
import { GoogleGenAI } from "@google/genai";

const baseUrl = await env.AI.gateway(env.AI_GATEWAY_NAME).getUrl("google-ai-studio");
const apiKey = await env.GEMINI_API_KEY.get();
const aigToken = await env.CLOUDFLARE_AI_GATEWAY_TOKEN.get();

const client = new GoogleGenAI({
  apiKey,
  httpOptions: {
    baseUrl,
    headers: { "cf-aig-authorization": `Bearer ${aigToken}` },
  },
});
```

If the user later moves the Gemini key into AI Gateway BYOK dashboard storage, drop the `apiKey` line — `cf-aig-authorization` alone suffices.

---

## Phase 1 — wrangler.jsonc bindings & env vars

Critical file: `wrangler.jsonc`

Additions:

- **Vectorize binding** (existing 768-dim index):
  ```jsonc
  "vectorize": [
    { "binding": "VECTORIZE_JOBS", "index_name": "greenhouse-jobs", "remote": true }
  ]
  ```
- **R2 bucket for job archives** (markdown + PDF + raw HTML):
  ```jsonc
  "r2_buckets": [
    { "binding": "R2_AUDIO_BUCKET", "bucket_name": "core-resumes-audio", "remote": true },
    { "binding": "R2_JOBS_BUCKET",  "bucket_name": "core-resumes-jobs",  "remote": true }
  ]
  ```
- **Secrets Store binding for GEMINI_API_KEY** (already in store):
  ```jsonc
  {
    "binding": "GEMINI_API_KEY",
    "store_id": "8c42fa70938644e0a8a109744467375f",
    "secret_name": "GEMINI_API_KEY",
  }
  ```
- **New env vars**:
  ```jsonc
  "AI_GATEWAY_NAME": "default-gateway",
  "GREENHOUSE_API_BASE": "https://boards-api.greenhouse.io/v1/boards",
  "VECTORIZE_INDEX_NAME": "greenhouse-jobs",
  "VECTORIZE_DIMENSIONS": "768",
  "MODEL_EMBED_JOBS": "gemini-embedding-001",
  "MODEL_TRIAGE": "@cf/openai/gpt-oss-120b",
  "DEFAULT_BOARD_TOKENS": "cloudflare,vercel,anthropic,headway"
  ```
- **New Durable Objects**:

  ```jsonc
  { "name": "JOB_SCANNER_AGENT",  "class_name": "JobScannerAgent" },
  { "name": "JOB_ANALYSIS_AGENT", "class_name": "JobAnalysisAgent" }
  ```

  - migrations `v4` (JobScannerAgent), `v5` (JobAnalysisAgent).

- **Cron**: keep `0 */4 * * *` for health, add `0 */6 * * *` for scheduled greenhouse pipeline (gated on `global_config.pipeline_enabled === true`).

After editing: `pnpm run cf-typegen` regenerates `worker-configuration.d.ts`.

---

## Phase 2 — D1 schema (modular, full refactor)

Existing flat schemas move into category folders. File contents are unchanged — only paths move and a barrel `index.ts` is added per folder. Drizzle migrations are unaffected for the move itself (Drizzle compares table definitions, not file locations).

### Final structure

```
src/backend/db/schemas/
├── applications/
│   ├── roles.ts                    (moved; + new columns `source`, `source_snapshot_id`)
│   ├── role-analyses.ts            (moved)
│   ├── role-alignment-scores.ts    (moved)
│   ├── documents.ts                (moved)
│   └── index.ts
├── career/
│   ├── resume-bullets.ts           (moved)
│   └── index.ts
├── communications/
│   ├── threads.ts                  (moved)
│   ├── messages.ts                 (moved)
│   ├── emails.ts                   (moved)
│   └── index.ts
├── jobs/                           (ALL NEW)
│   ├── boards/
│   │   ├── board-tokens.ts
│   │   ├── board-template-analyses.ts
│   │   └── index.ts
│   ├── postings/
│   │   ├── jobs.ts
│   │   ├── job-snapshots.ts
│   │   └── index.ts
│   ├── analysis/
│   │   ├── job-req-snapshots.ts
│   │   ├── job-skill-snapshots.ts
│   │   ├── job-responsibility-snapshots.ts
│   │   ├── job-notebook-consultations.ts
│   │   ├── ai-log-workers-ai.ts
│   │   └── index.ts
│   ├── taxonomy/
│   │   ├── job-categories.ts
│   │   ├── job-category-mappings.ts
│   │   ├── job-category-hitl-feedback.ts
│   │   ├── job-tags.ts
│   │   ├── job-tag-mappings.ts
│   │   ├── job-tag-hitl-feedback.ts
│   │   └── index.ts
│   ├── hitl/
│   │   ├── hitl-reviews.ts
│   │   └── index.ts
│   ├── sessions/
│   │   ├── session-runs.ts
│   │   └── index.ts
│   ├── lists/
│   │   ├── starred-job-lists.ts
│   │   ├── starred-job-list-mappings.ts
│   │   └── index.ts
│   └── index.ts
├── system/
│   ├── health-screenings.ts        (moved)
│   ├── global-config.ts            (moved)
│   ├── job-failures.ts             (moved)
│   └── index.ts
└── index.ts                        // top-level barrel
```

### Move mechanics

For each existing schema file:

1. `git mv src/backend/db/schemas/<name>.ts src/backend/db/schemas/<category>/<name>.ts`.
2. Add the file's named exports to `<category>/index.ts`.
3. Update every consumer that imports from `@/backend/db/schemas/<name>` (or relative path) to import from the category folder. Recommended search: `rg "from .*db/schemas/(roles|documents|threads|messages|emails|resume-bullets|role-analyses|role-alignment-scores|health-screenings|global-config|job-failures)" -t ts`.
4. Verify `src/backend/db/schema.ts` re-exports everything via the new category folders.

### Schema conventions (matching AGENTS.md)

- Drizzle table + `insert<Table>Schema` + `select<Table>Schema` (drizzle-zod) + TypeScript types.
- `<TABLE_NAME>_TABLE_DESCRIPTION` (string) and `<TABLE_NAME>_COLUMN_DESCRIPTIONS` (Record with **D1 snake_case keys** — read by `docs.ts` for live schema docs).
- Every folder with multiple files has an `index.ts` re-export barrel.
- Consumers import from the category folder, never from individual files.

### Single migration for new tables + roles columns

`pnpm run db:generate` produces one migration covering:

- All new `jobs/*` tables.
- Two new columns on `roles`: `source` (text, default `"manual"`) and `source_snapshot_id` (text, nullable).

Apply with `pnpm run migrate:local` first, then `pnpm run migrate:remote` during deploy.

---

## Phase 3 — AI providers (modular)

```
src/backend/ai/providers/
├── base.ts                  (existing)
├── workers-ai.ts            (existing)
├── google-ai-studio.ts      (NEW — Gemini SDK via AI Gateway URL, BYOK)
└── index.ts                 (extended — multi-provider registry)
```

```
src/backend/ai/models/
├── gpt-oss-120b.ts                    (existing)
├── llama-3-3-70b-instruct-fp8-fast.ts (existing)
├── llama-3-1-8b-instruct.ts           (existing)
├── bge-large-en-v1-5.ts               (existing)
├── whisper.ts                         (existing)
├── aura-1.ts                          (existing)
├── llava-1-5-7b-hf.ts                 (existing)
├── gemini-embedding-001.ts            (NEW — 768-dim via outputDimensionality)
└── index.ts                           (extended: + embedJobs)
```

### `google-ai-studio.ts`

Implements `AIProvider` interface (`invokeModel`, `invokeStructured`, `streamModel`). See "BYOK Gemini path" above for the client construction snippet.

### `gemini-embedding-001.ts`

Outputs 1536 dims by default; we set `outputDimensionality: env.VECTORIZE_DIMENSIONS` (768). Mirrors the Python `_build_embedding_text` helper (task: retrieval document/query prefixes for asymmetric search) — port into the model's `serialize()`.

### `providers/index.ts` updates

```ts
export type ProviderName = "workers-ai" | "google-ai-studio";

export function getProvider(env: Env, name: ProviderName = "workers-ai"): AIProvider {
  switch (name) {
    case "workers-ai":       return new WorkersAIProvider(env);
    case "google-ai-studio": return new GoogleAIStudioProvider(env);
  }
}

export async function embedJobsBatch(env: Env, texts: string[]): Promise<number[][]> { … }
export async function embedJobsQuery(env: Env, text: string): Promise<number[]> { … }
```

The existing `generateStructuredOutput` and `streamChat` keep their workers-ai default. Triage and deep-analysis both use `gpt-oss-120b` via the existing workers-ai provider — the only AI work that crosses into google-ai-studio is embeddings.

---

## Phase 4 — Cloudflare Agents SDK Durable Objects (modular)

```
src/backend/ai/agents/
├── colby/                   (existing — refactored to folder form)
├── notebooklm/              (existing — refactored)
├── notebooklm-mcp/          (existing — refactored)
├── job-scanner/
│   ├── types.ts
│   ├── health.ts
│   ├── index.ts             // export class JobScannerAgent extends Agent<Env, State>
│   └── methods/
│       ├── scan-board.ts
│       ├── scan-all.ts
│       ├── triage-batch.ts
│       └── index.ts
└── job-analysis/
    ├── types.ts
    ├── health.ts
    ├── index.ts             // export class JobAnalysisAgent extends Agent<Env, State>
    └── methods/
        ├── consult-notebook.ts
        ├── deep-analyze.ts
        ├── persist.ts
        ├── archive.ts
        ├── embed.ts
        └── index.ts
```

Existing single-file agents (`colby.ts`, `notebooklm.ts`, `notebooklm-mcp.ts`) are refactored into folder form. Class names and wrangler bindings stay identical so no migration tag changes.

**JobScannerAgent state**: `{ runs: Record<token, RunState>, queue: AnalyzeJob[] }`.

- Public RPC: `scanBoard(token)`, `scanAll()`, `getRunStatus(sessionId)`.
- WebSocket: streams `ScanProgress` events to the Command Center (replaces SSE).
- Scheduled processor: every 30 s drains the queue → calls JobAnalysisAgent.

**JobAnalysisAgent state**: `{ inFlight: Record<snapshotId, Phase>, lastError?: string }`.

- Public RPC: `analyze(snapshotId)`, `reanalyze(jobSiteId, hitlContext)`.
- Phases (one method per file): consult NotebookLM → deep analyze → persist → archive (PDF/MD) → embed → mark done. Each phase is independently retryable.

Both register in `src/backend/index.ts` (Worker entrypoint exports for the Astro Cloudflare adapter).

---

## Phase 5 — Service modules (greenhouse domain logic)

```
src/backend/services/jobs/
├── scraper/
│   ├── fetch-board.ts        // GET https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
│   ├── fetch-single.ts       // for reprocess
│   ├── parse.ts              // BeautifulSoup → htmlparser2 / linkedom port
│   ├── apply-template.ts     // per-company template-driven boilerplate stripping
│   └── index.ts
├── archive/
│   ├── markdown.ts           // POST /accounts/{id}/browser-rendering/markdown → R2
│   ├── pdf.ts                // POST /accounts/{id}/browser-rendering/pdf      → R2
│   ├── r2-keys.ts            // jobs/{token}/{job_site_id}/{snapshot_id}/{posting.md|posting.pdf|raw.html}
│   ├── health.ts
│   └── index.ts
├── vectorize/
│   ├── upsert.ts             // env.VECTORIZE_JOBS.upsert(vectors)
│   ├── query.ts              // env.VECTORIZE_JOBS.query(vector, { topK, returnMetadata: "all" })
│   ├── health.ts
│   └── index.ts
├── triage/
│   ├── prompt.ts             // ports app/config.py TRIAGE prompt (candidate stories injected)
│   ├── batch.ts              // pack jobs into context-aware batches (~30% reserved for schema+response)
│   ├── run.ts                // gpt-oss-120b structured-output call → IncludeDecision[]
│   └── index.ts
├── analysis/
│   ├── prompt.ts             // ports app/config.py JOB_ASSESSMENT prompt
│   ├── schema.ts             // Zod schema mirroring app/models.py JobAssessment
│   ├── notebook-questions.ts // builds N targeted NotebookLM queries from a job posting
│   └── index.ts
├── hitl/
│   ├── load-context.ts       // ports get_hitl_context_for_analysis (D1)
│   └── index.ts
└── index.ts
```

Each subfolder owns its `health.ts` (per skill rule). The coordinator in `src/backend/services/health-service.ts` imports them.

---

## Phase 6 — Hono routes (modular)

```
src/backend/api/routes/jobs/
├── tokens.ts            // GET/POST/PATCH /api/jobs/tokens
├── scan.ts              // POST /api/jobs/scan, WebSocket /api/jobs/scan/ws
├── pipeline.ts          // POST /api/jobs/pipeline
├── list.ts              // GET /api/jobs (filters: company, since, score, verdict, fav)
├── detail.ts            // GET /api/jobs/{job_site_id}/history
├── search.ts            // GET /api/jobs/search?q=…&top_k=…  (Vectorize)
├── taxonomy.ts          // GET/POST /api/jobs/categories, /api/jobs/tags, mappings
├── hitl.ts              // POST /api/jobs/{id}/review, /api/jobs/category-feedback, /api/jobs/tag-feedback
├── lists.ts             // starred lists CRUD
├── archive.ts           // GET /api/jobs/{snapshot_id}/markdown, /api/jobs/{snapshot_id}/pdf
├── analytics.ts         // GET /api/jobs/stats/boards, /api/jobs/companies/{token}/analytics
├── apply.ts             // POST /api/jobs/{snapshot_id}/apply → creates roles row, returns role_id
├── reprocess.ts         // POST /api/jobs/{job_site_id}/reprocess
└── index.ts             // mounts all subroutes under /api/jobs/*
```

Mounted in `src/backend/api/index.ts` alongside existing routes. Every route uses `OpenAPIHono` + zod-openapi → automatically appears in `/openapi.json`, `/scalar`, `/swagger`.

`apply.ts` flow:

1. Validate snapshot exists.
2. Insert into existing `roles` with: `title`, `company`, `salary_min/max`, `job_posting_url`, `source = "greenhouse_scan"`, `source_snapshot_id`, `status = "preparing"`.
3. Return `{ role_id }`. Frontend navigates to `/roles/{role_id}` (existing experience).

`archive.ts` streams the R2 object directly with proper `Content-Type: text/markdown` or `application/pdf` so `<iframe>` and viewers work natively.

---

## Phase 7 — Frontend migration

### Pages (NEW under `src/frontend/pages/`)

```
jobs/
├── index.astro          // Command Center
├── history.astro        // historical jobs view
├── sessions.astro       // pipeline session history
└── companies/
    └── [token].astro    // company analytics (charts + Leaflet map)

applications/
└── index.astro          // status pipeline view of `roles` rows
```

Board-token management is **not** a separate page — it lives as the "Job Boards" tab on the existing `/config` page.

### Components (NEW under `src/frontend/components/jobs/`)

Ported from `/Volumes/Projects/greenhouse/frontend/src/components`:

- `CommandCenter.tsx` — adapted to fetch `/api/jobs/*` (drop the `BACKEND_PORT` constant; same-origin fetch)
- `JobsTable.tsx` — sort + multi-select filters (extracted from CommandCenter for reusability)
- `JobDetailModal.tsx` — tabs: Summary, HITL Review, Notebook Evidence, Markdown, PDF, Apply
- `JobMarkdownViewer.tsx` — fetches `/api/jobs/{snapshot_id}/markdown`, renders with the existing `assistant-ui/markdown-text.tsx`
- `JobPdfViewer.tsx` — `<iframe src="/api/jobs/{snapshot_id}/pdf" />` inside shadcn `Dialog`
- `ApplyButton.tsx` — confirms via shadcn `AlertDialog` → POST `/api/jobs/{id}/apply` → navigates to `/roles/{role_id}`
- `HitlReviewTab.tsx` — port verbatim, swap fetch URLs
- `SessionsTable.tsx`, `CompanyProfile.tsx` — port verbatim
- `JobBoardsTab.tsx` — replaces greenhouse's standalone `SettingsPanel.tsx`; rendered inside the multi-tab config page
- `PipelineProgress.tsx` — WebSocket-based (replaces EventSource)
- `ApplicationsTable.tsx` — pipeline view (preparing | applied | interview | offer | rejected | archived) over `roles` table

### Multi-tab config page

The existing `/config` page is rebuilt as a tabbed layout using shadcn `Tabs`.

```
/config (multi-tab)
├── Resume          — existing ResumeBulletsEditor
├── Career Stories  — existing CareerStoriesEditor
├── Agent Rules     — existing AgentRulesEditor
├── Prompts         — existing PromptEditor
├── Compensation    — existing comp config UI (if currently rendered on /config)
├── Templates       — existing template config UI (if currently rendered on /config)
└── Job Boards      — NEW JobBoardsTab.tsx (board-token CRUD)
```

Tab state persists via `?tab=…` query param so deep-linking and reloads stay on the right tab. The page itself stays a single Astro file — only the React island changes shape.

### Sidebar additions

Update `src/frontend/components/Sidebar.tsx`: add "Jobs" group with sub-items {Command Center, History, Sessions, Companies}, and a top-level "Applications" link. Existing "Settings" / "Config" link continues to point at `/config`.

### Reuse-not-port

- shadcn primitives — already installed, dark theme matches.
- Recharts — already used by `dashboard/SalaryRangeChart.tsx`. No new install.
- Leaflet + leaflet.markercluster — NEW deps. Install via `pnpm add leaflet leaflet.markercluster @types/leaflet`. Wrap in client-only Astro island.

### Convention guards

- All pages wrap in existing `BaseLayout.astro` (preserves Navbar, ErrorLogger, HealthBadge).
- No `window.alert/confirm/prompt` — use shadcn `AlertDialog`.
- No mock data — every component fetches from `/api/*`.
- All tables include sort + filter.

---

## Phase 8 — Apply flow → Application tracking

1. Schema: `roles` already has `status` (`preparing | applied | interviewing | offer | rejected | withdrawn | archived`). Add new optional columns: `source` (text), `source_snapshot_id` (text, nullable).
2. `POST /api/jobs/{snapshot_id}/apply` (Phase 6) creates the role row.
3. New `/applications` page renders a kanban-style board grouped by `status`, plus a table view toggle. Each card → `/roles/{id}` (existing resume + cover letter UX with chat).
4. The existing `/roles/{id}` page already supports document creation, AI drafting with bullet injection, and Google Docs sync. Once a role originates from a snapshot, the page additionally surfaces "View original posting (PDF)" and "Re-analyze" buttons that hit `/api/jobs/{snapshot_id}/pdf` and `/api/jobs/{job_site_id}/reprocess` respectively.

---

## Phase 9 — NotebookLM consultation during analysis

JobAnalysisAgent's `consult-notebook.ts` method:

1. Read agent rules from `global_config` (existing pattern from `src/backend/ai/tools/notebooklm.ts`).
2. Generate N (≈ 5–8) targeted questions per role using gpt-oss-120b with a small extraction prompt over the job posting + the candidate's career stories. Examples:
   - "Has the candidate demonstrated 0-to-1 product leadership in {requirement_area}? Cite specific role + year + outcome."
   - "What is the largest budget/team the candidate has owned in a context similar to {company_size_or_industry}?"
   - "Has the candidate's compensation history ever included {detected_pay_component}?"
3. For each question: `await consultNotebook(env, q)` (existing helper).
4. Persist `{ snapshot_id, question, answer, references_json, turn_number, conversation_id }` rows to `job_notebook_consultations`.
5. Inject the consultations as a structured `<notebook_evidence>…</notebook_evidence>` block into the deep-analysis prompt — gpt-oss-120b uses this to ground per-requirement match scores in actual candidate history.
6. Surface the Q&A on the JobDetailModal "Notebook Evidence" tab.

---

## Phase 10 — Browser Rendering → R2 (markdown + PDF)

Two endpoints, both via Cloudflare REST:

```
POST https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/browser-rendering/markdown
POST https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/browser-rendering/pdf
Authorization: Bearer {CF_BROWSER_RENDER_TOKEN}    // already in Secrets Store
```

For each new snapshot in JobAnalysisAgent's `archive.ts`:

1. POST URL of the original Greenhouse posting page → receive markdown body.
2. POST same URL → receive PDF blob.
3. Write both to R2:
   - `jobs/{token}/{job_site_id}/{snapshot_id}/posting.md`
   - `jobs/{token}/{job_site_id}/{snapshot_id}/posting.pdf`
4. Persist R2 keys on `jobs_snapshots.archive_md_key` / `archive_pdf_key`.

Frontend modal calls `/api/jobs/{snapshot_id}/pdf` which streams the R2 object with `Content-Type: application/pdf` so the iframe renders inline.

Browser Rendering REST limit on Workers Paid is 10 req/s — cap parallel archives at 5 inside JobAnalysisAgent's queue.

---

## Phase 11 — Health system extensions

Existing 10 modules in `src/backend/services/health-service.ts`. Add:

1. **vectorize** — `env.VECTORIZE_JOBS.query(testVector, { topK: 1 })`.
2. **r2Jobs** — `env.R2_JOBS_BUCKET.head("__health__")`.
3. **googleAiStudio** — embed "ping" via `embedJobsQuery(env, "ping")` and assert dim length matches `VECTORIZE_DIMENSIONS`.
4. **greenhouseApi** — fetch one known board's jobs list (e.g. `cloudflare`), assert 2xx.
5. **jobScanner** + **jobAnalysis** — `getStub().checkHealth()` on each Durable Object class.

Total: 16 modules. Update `src/frontend/components/HealthDashboard.tsx` (it iterates dynamically — only new labels).

---

## Phase 12 — Cron + scheduled scanning

`_worker.ts` `scheduled()` already handles `0 */4 * * *` health. Branch on cron pattern:

- `0 */4 * * *` → existing health screening.
- `0 */6 * * *` → if `global_config.pipeline_enabled === true`: call `JobScannerAgent.scanAll()` once per active board token. Results stream to D1 via the agent's persist methods.

Add a `pipeline_enabled` row to `global_config` (boolean, default false, toggleable from the Job Boards config tab).

---

## Phase 13 — Verification

Run from `/Volumes/Projects/workers/core-resumes`:

1. `pnpm run cf-typegen` — confirms all new bindings parse.
2. `pnpm run db:generate` — review the migration in `drizzle/`; confirm new tables + the `roles.source` / `roles.source_snapshot_id` additions appear once.
3. `pnpm run migrate:local` — applies to local D1, validates SQL.
4. `pnpm run dev` — starts Astro+Wrangler locally.
5. Hit `http://localhost:4321/health` — confirm 16 modules render, all green or yellow with explanations.
6. Hit `http://localhost:4321/config?tab=job-boards` — add a board token (`cloudflare`), enable it.
7. Click "Start Pipeline" on `/jobs` — WebSocket connects, scan progress streams. Confirm jobs persist to D1 (`pnpm run db:studio`).
8. Click a job row → JobDetailModal opens with Summary, HITL, Notebook Evidence, Markdown, PDF tabs. Verify:
   - Markdown tab renders content fetched from `/api/jobs/{id}/markdown`.
   - PDF tab iframe loads `/api/jobs/{id}/pdf` (R2-streamed).
   - Notebook Evidence tab shows the questions and answers from `job_notebook_consultations`.
9. Click "Apply" → confirms role created in `/applications` and frontend redirects to `/roles/{role_id}`.
10. From the role page, draft a resume and cover letter — confirm the existing chat + bullet-injection drafting still works.
11. `GET /api/jobs/search?q=senior%20engineer&top_k=5` — confirm Vectorize returns matches with metadata.
12. Trigger a HITL review on a snapshot, then call reprocess — confirm a new snapshot is created with the HITL context injected.
13. `pnpm run deploy` — full pipeline. Visit production URL, repeat 5–11 against remote bindings.

---

## Critical files modified or created

**Modified:**

- `wrangler.jsonc` — bindings, env vars, DO migrations (Phase 1)
- `src/backend/db/schema.ts` — barrel re-export across all 5 categories (Phase 2)
- `src/backend/ai/providers/index.ts` — multi-provider registry (Phase 3)
- `src/backend/ai/models/index.ts` — `embedJobs` model (Phase 3)
- `src/backend/api/index.ts` — mount `/api/jobs` (Phase 6)
- `src/backend/services/health-service.ts` — 16 modules (Phase 11)
- `src/backend/index.ts` — export new DO classes (Phase 4)
- `src/frontend/components/Sidebar.tsx` — Jobs + Applications nav (Phase 7)
- `src/frontend/pages/config.astro` — multi-tab layout (Phase 7)
- `src/_worker.ts` — second cron branch (Phase 12)
- existing `roles` schema file — `source` + `source_snapshot_id` columns; moved to `applications/roles.ts` (Phase 2 + 8)
- All existing schema-importing files (routes, agents, services, tasks) — import paths updated for the schema move (Phase 2)

**Created:** all files listed in Phases 2, 3, 4, 5, 6, 7. Roughly:

- 21 schema files + 8 index.ts barrels under `src/backend/db/schemas/jobs/`
- 1 new provider + 1 new model
- 2 agent folders ≈ 14 files
- 6 service folders ≈ 22 files under `src/backend/services/jobs/`
- 13 route files + 1 index.ts under `src/backend/api/routes/jobs/`
- ~6 Astro pages + ~12 React components under `src/frontend/`

**Reused without modification:**

- `src/backend/ai/tools/notebooklm.ts` — `consultNotebook(env, query)` is exactly what JobAnalysisAgent needs
- `src/backend/ai/tools/browser-rendering.ts` — extend with `markdown` + `pdf` helpers
- `src/backend/ai/providers/workers-ai.ts` — handles deep analysis via gpt-oss-120b
- `src/frontend/components/assistant-ui/markdown-text.tsx` — markdown viewer
