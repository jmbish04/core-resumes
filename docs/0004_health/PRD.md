# PRD — Comprehensive Health Service (`core-resumes`)

> Phase **0004**. Supersedes the prior `implementation_plan.md` in this directory.
> The implementation agent must use this PRD as the spec and [`TASKS.json`](./TASKS.json) as the build queue.
> See [`PROMPT.md`](./PROMPT.md) for the agent initialization brief.

---

## 1. Context

The current health service exists and is not a literal `return { status: 'ok' }`, but it falls short of the cloudflare-jedi standard in three concrete ways:

1. **Architectural drift.** All health logic lives in one monolithic `src/backend/services/health.ts` instead of modular `health.ts` files co-located with each subsystem. Persistence uses one JSON-blob `health_screenings` table instead of the relational `health_runs` + `health_results` + `health_test_definitions` schema. There is no `src/health/coordinator.ts`.
2. **Coverage gaps.** Five entire bindings have no health check at all (`BROWSER`, `R2_AUDIO_BUCKET`, `EMAIL_OUT`, `SESSIONS` KV, `SANDBOX` standalone). API routes are never validated for response **shape** (only HTTP 200). The auth middleware has no round-trip probe. There is no D1 table scan to surface stale or empty tables.
3. **Shape-shallow probes.** Existing checks accept "any truthy response" as success. Workers AI and AI Gateway checks don't validate the model output shape; agent RPC validates only `'status' in result`. The Drive lifecycle creates docs but never exposes the URLs to the frontend, so the user cannot manually verify the document actually rendered correctly (styling, formatting). One agent — `NotebookLMMcpAgent` — is missing `@callable()` on its `checkHealth` method, which the rest already have.

**Outcome.** Migrate to the cloudflare-jedi modular layout (using the existing `@/`, `@db/`, `@ai/` tsconfig path aliases throughout — never relative paths), split the schema into runs + results + test_definitions, add the missing checks, deepen all existing checks with response-shape validation, surface created Drive doc URLs on the frontend so the user can visually verify rendering, and rename agent RPC to `healthProbe` while adding `@callable()` to all four agents (including `NotebookLMMcpAgent`).

---

## 2. Decisions Already Made (do NOT relitigate)

| Decision             | Resolution                                                                                                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File layout          | Migrate to `src/health/` (cloudflare-jedi standard). Use tsconfig aliases (`@/db`, `@ai/...`) — never relative paths.                                                                                                               |
| Schema               | Split `health_screenings` → `health_runs` + `health_results` + `health_test_definitions`. Drop `health_screenings` after one transition window.                                                                                     |
| Agent RPC            | Add `@callable()` to all four agents incl. `NotebookLMMcpAgent`. Rename method to `healthProbe`. Coordinator uses `getAgentByName(env.X, 'health-probe').healthProbe()`.                                                            |
| New subsystem checks | Bindings sweep (BROWSER / R2 / EMAIL_OUT / SESSIONS KV / SANDBOX standalone) + API route shape validation + D1 table scan + Auth round-trip + improved Drive lifecycle (retain latest run's docs so user can visually verify URLs). |

---

## 3. Architecture (target)

```
src/health/                                      ← central coordinator
├── types.ts                                     ← HealthStepResult, HealthRun, HealthCategory
├── coordinator.ts                               ← HealthCoordinator: runs all checks, persists to D1
└── (no inline check logic — every check is a co-located health.ts)

src/backend/health/checks/                       ← cross-cutting checks not owned by a single module
├── bindings.ts                                  ← BROWSER, R2, EMAIL_OUT, SESSIONS KV, SANDBOX standalone
├── d1-table-scan.ts                             ← scan all tables for empty/stale rows (warning-level)
├── secrets.ts                                   ← 12 required Secrets Store bindings
├── env-vars.ts                                  ← required vars
├── notebooklm-credentials.ts                    ← 4 credential sources for NotebookLM
├── tts.ts                                       ← Deepgram Aura-2 (with first-chunk byte assertion)
└── stt.ts                                       ← Whisper (with response shape assertion)

src/backend/db/health.ts                         ← D1 reachability + table presence assertions
src/backend/ai/health.ts                         ← Workers AI native (embedding + chat)
src/backend/ai/providers/health.ts               ← AI Gateway multi-provider probe
src/backend/ai/tools/google/health.ts            ← Drive + Docs full lifecycle (REPLACES existing)
src/backend/ai/agents/${name}/health.ts          ← per-agent RPC bridge (4 agents)
src/backend/api/health.ts                        ← API route shape validation (loopback fetch)
src/backend/api/middleware/health.ts             ← Auth round-trip (with/without WORKER_API_KEY)

src/backend/db/schemas/health/                   ← relational persistence (NEW)
├── runs.ts
├── results.ts
├── test-definitions.ts
└── index.ts

src/backend/api/routes/health.ts                 ← three Hono routes (refactored to use coordinator)

src/frontend/components/HealthDashboard.tsx      ← consumes { run, results } shape
src/frontend/components/HealthBadge.tsx          ← updated status enum
```

The coordinator imports `checkHealth` from **every** modular location. Modular `health.ts` files never import the coordinator — they only export `checkHealth(env: Env): Promise<HealthStepResult>`.

---

## 4. Schema (D1 / Drizzle)

Three new tables in `src/backend/db/schemas/health/`:

### `health_runs`

| Column        | Type      | Notes                                               |
| ------------- | --------- | --------------------------------------------------- |
| `id`          | text PK   | `crypto.randomUUID()`                               |
| `status`      | text enum | `healthy` \| `degraded` \| `unhealthy` \| `unknown` |
| `trigger`     | text enum | `manual` \| `scheduled` \| `api` (default `manual`) |
| `duration_ms` | integer   | total suite duration                                |
| `created_at`  | text      | `CURRENT_TIMESTAMP` default                         |
| `metadata`    | json      | `{ checkCount: number, ... }`                       |

### `health_results`

| Column          | Type                       | Notes                                                                                                                                       |
| --------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | text PK                    | `crypto.randomUUID()`                                                                                                                       |
| `run_id`        | text FK → `health_runs.id` | `onDelete: 'cascade'`                                                                                                                       |
| `category`      | text enum                  | `api` \| `database` \| `ai` \| `agents` \| `providers` \| `frontend` \| `auth` \| `storage` \| `queue` \| `binding` \| `google` \| `custom` |
| `name`          | text                       | check name                                                                                                                                  |
| `status`        | text enum                  | `success` \| `failure` \| `pending` \| `skipped`                                                                                            |
| `message`       | text                       | nullable                                                                                                                                    |
| `details`       | json                       | per-check structured details (stores `createdDocUrls` for Drive, `pingMs/probeMs` for agents, etc.)                                         |
| `duration_ms`   | integer                    | per-check                                                                                                                                   |
| `ai_suggestion` | text                       | nullable (reserved for future AI-driven analysis)                                                                                           |
| `timestamp`     | text                       | `CURRENT_TIMESTAMP` default                                                                                                                 |

### `health_test_definitions`

| Column            | Type              | Notes                                                        |
| ----------------- | ----------------- | ------------------------------------------------------------ |
| `id`              | text PK           |                                                              |
| `name`            | text unique       |                                                              |
| `target`          | text              | URL or binding name                                          |
| `method`          | text enum         | `GET` \| `POST` (default `GET`)                              |
| `expected_status` | integer           | default 200                                                  |
| `expected_body`   | text              | substring or JSON path assertion                             |
| `body_assertion`  | text              | e.g. `status=ok`                                             |
| `criticality`     | text enum         | `low` \| `medium` \| `high` \| `critical` (default `medium`) |
| `enabled`         | integer (boolean) | default `true`                                               |
| `created_at`      | text              |                                                              |

All three exported from `src/backend/db/schemas/health/index.ts` and re-exported from `src/backend/db/schema.ts`.

---

## 5. Shared types

`src/health/types.ts`:

```typescript
export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";
export type CheckStatus = "success" | "failure" | "warning" | "SKIPPED";

export type HealthCategory =
  | "api"
  | "database"
  | "ai"
  | "agents"
  | "providers"
  | "frontend"
  | "auth"
  | "storage"
  | "queue"
  | "binding"
  | "google"
  | "custom";

export interface HealthStepResult {
  name: string;
  status: CheckStatus;
  message: string;
  durationMs: number;
  details?: Record<string, unknown>;
  analysis?: { rootCause: string; suggestedFix: string } | null;
}

export interface HealthRun {
  /* matches health_runs row */
}
export interface HealthResult {
  /* matches health_results row */
}
```

Every modular `health.ts` exports:

```typescript
export async function checkHealth(env: Env): Promise<HealthStepResult>;
```

Every check file ships the `safeRun` helper inline (5 lines, copy-paste — easier than importing a shared util when the timing semantics matter):

```typescript
async function safeRun(name: string, fn: () => Promise<Record<string, unknown>>) {
  const t = Date.now();
  try {
    return [name, { status: "OK" as const, latency: Date.now() - t, ...(await fn()) }] as const;
  } catch (e: any) {
    return [
      name,
      { status: "FAILURE" as const, latency: Date.now() - t, error: e.message },
    ] as const;
  }
}
```

---

## 6. Quality bar — every check must clear all 6

1. **Actually call** the binding/endpoint — never fake.
2. **Measure latency** with `Date.now()` before/after each sub-check.
3. **Run sub-checks in parallel** (`Promise.all`) when independent.
4. **Validate response shape**, not just HTTP 200 — a 200 with the wrong Content-Type is a failure.
5. **Wrap every sub-check in `safeRun`** so a single crash doesn't kill the suite.
6. **Surface enough `details`** for a developer to diagnose without re-running.

| ❌ Lazy (never acceptable)     | ✅ Comprehensive (required)                                     |
| ------------------------------ | --------------------------------------------------------------- |
| `return { status: 'success' }` | Actually call the binding/endpoint                              |
| HTTP 200 = healthy             | Validate response shape matches what the frontend expects       |
| No latency measurement         | `Date.now()` before and after each sub-check                    |
| Crash = unknown                | `safeRun` wraps every sub-check; crash = failure with details   |
| Single check per module        | Sub-checks per capability (text gen, embeddings, stream format) |
| No details                     | Enough details to diagnose without re-running                   |

---

## 7. Per-check specifications

### 7.1 `@/db/health.ts` — D1

- `SELECT 1` round-trip.
- **NEW**: `PRAGMA table_list` → assert key tables exist (`roles`, `documents`, `threads`, `messages`, `health_runs`, `health_results`).
- Returns `{ tableCount, latencyMs, expectedTablesPresent: boolean, missingTables: string[] }`.

### 7.2 `@ai/health.ts` — Workers AI native (no gateway)

- Sub-check 1 (embedding): `env.AI.run(env.DEFAULT_MODEL_EMBEDDING, { text: ['health'] })`. Validate shape: `result.data` is `number[][]`, `data[0].length > 0`. Reject empty arrays.
- Sub-check 2 (chat): `env.AI.run('@cf/meta/llama-3.1-8b-instruct', { messages: [{ role:'user', content: 'Reply with the word Pong.' }], max_tokens: 10 })`. Reject empty `response`.

### 7.3 `@ai/providers/health.ts` — AI Gateway multi-provider

- Pattern from cloudflare-jedi `references/health-system.md` lines 213–294.
- Probes: `workers-ai` (always), `openai` / `anthropic` / `google` (only when their API key is present — else `SKIPPED` with reason).
- Each: `generateText({ prompt: 'Reply with exactly the word: Pong', maxTokens: 10 })`. Reject empty/non-string responses. Surface `{ response, latency, provider }` in details.
- Verify `env.AI_GATEWAY_ACCOUNT_ID` and `env.AI_GATEWAY_GATEWAY_ID` are present at the top — fail fast if missing.

### 7.4 `@ai/tools/google/health.ts` — Drive + Docs lifecycle (REPLACES existing one)

This check is special — it intentionally leaves artifacts behind so the user can visually verify rendering quality.

1. **List** `PARENT_DRIVE_FOLDER_ID` and `HEALTH_CHECK_DRIVE_FOLDER_ID` (validates auth + folder ACLs).
2. **Retain the most recent prior run's docs**; delete only docs older than the most recent. Stable `?recent=1` query at top of folder = stable URL the user can click. (Cleanup logic: order children by `modifiedTime desc`, keep the first run's set, delete the rest.)
3. **Create doc from HTML**: `GoogleDriveClient.createDocFromHtml` (existing — `drive.ts:71`) with the resume HTML template via `renderDocumentTemplate('resume', ...)`.
4. **Create doc from template copy**: requires adding `GoogleDriveClient.copyFile(sourceFileId, name, parentFolderId)` (Drive API `files.copy` — POST `/drive/v3/files/{id}/copy`). Validates the template-copy path independently of HTML rendering. Use `env.RESUME_TEMPLATE_DOC_ID` (new env var — see §10).
5. **Append + read-back**: `GoogleDocsClient.appendText(docId, marker)` then `GoogleDocsClient.getDocument(docId)` and assert the body contains the marker. Proves writes persist, not just ack.
6. **Surface URLs**: return `details: { createdDocIds: [...], createdDocUrls: [...], folderUrls: { parent, health }, retainedPriorRunIds: [...], deletedCount }`.
7. The frontend renders `createdDocUrls` and `folderUrls` as clickable links so the user can manually inspect styling (this is how we catch "doc created but styling is wrong" issues that no automated check can detect).

### 7.5 `@ai/agents/${name}/health.ts` — per-agent (4 agents)

Each `health.ts` exports **two** functions:

```typescript
// Called from inside the agent class (this/env in scope) — does the deep work.
export async function healthProbe(agent: AgentClass, env: Env): Promise<HealthStepResult>;

// Called from the coordinator — opens a stub via getAgentByName and invokes the @callable.
export async function checkHealth(env: Env): Promise<HealthStepResult>;
```

The agent class (in `index.ts`):

```typescript
import { Agent, callable } from "agents";
import { healthProbe } from "./health";

export class OrchestratorAgent extends Agent<Env, OrchestratorState> {
  // ... existing methods ...

  @callable()
  async healthProbe(): Promise<HealthStepResult> {
    return healthProbe(this, this.env);
  }
}
```

The coordinator-side bridge:

```typescript
export async function checkHealth(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  if (!env.ORCHESTRATOR_AGENT) {
    return {
      name: "OrchestratorAgent",
      status: "failure",
      message: "binding missing",
      durationMs: 0,
    };
  }
  try {
    const stub = await getAgentByName<Env, OrchestratorAgent>(
      env.ORCHESTRATOR_AGENT,
      "health-probe",
    );
    if (!stub) throw new Error("getAgentByName returned null");
    const probeStart = Date.now();
    const report = await stub.healthProbe();
    if (typeof report?.status !== "string") throw new Error("malformed healthProbe response");
    return {
      ...report,
      name: "OrchestratorAgent",
      durationMs: Date.now() - start,
      details: { ...report.details, probeMs: Date.now() - probeStart },
    };
  } catch (e: any) {
    return {
      name: "OrchestratorAgent",
      status: "failure",
      message: e.message,
      durationMs: Date.now() - start,
      details: { errorName: e.name },
    };
  }
}
```

`'health-probe'` is the agent **instance** name. Using a fixed name routes every probe to the same DO instance so probe-internal state stays consistent across runs.

Per-agent depth requirements:

- **Orchestrator**: existing `count(roles)` + read agent state (`pendingTasks`, `roleId`), confirm state hydrates, exercise scheduled-task subsystem with `this.schedule(...)` no-op + `cancelSchedule`.
- **NotebookLM** + **NotebookLM-MCP**: existing 4-credential validation + ping. **NEW**: assert `consultNotebook` returns a **non-empty answer**. Treat empty answer as failure; surface `rawResponse` in details.
- **Transcription**: existing R2/SANDBOX bindings + Python ping. **NEW**: write a tiny test object to `R2_AUDIO_BUCKET`, exec a Python script that reads it back, assert content matches. Cleans up the test object.

Why `@callable()` on all four (per [agents-llm-full.md:6658-6667](../cloudflare-docs/agents-llm-full.md)):

> | Worker calling agent (same codebase) | Durable Object RPC (no decorator needed) |
> | Agent calling another agent | Durable Object RPC via getAgentByName() |

`@callable()` is **strictly required** only for browser/external WebSocket RPC. It is **harmless** when also called via DO RPC from a Worker. Adding it to all four catches the case where the health page calls the probe directly via `useAgent`'s `agent.stub.healthProbe()` over WebSocket from the browser, AND lets the coordinator call it via DO RPC `getAgentByName(...).healthProbe()`.

### 7.6 `@/api/health.ts` — API route shape validation (loopback)

Adapted from cloudflare-jedi `references/health-system.md` lines 596–672.

- `BASE = 'http://localhost'` for in-Worker fetch.
- Probes:
  - `GET /openapi.json` → assert `body.openapi === '3.1.0'`, `Object.keys(body.paths).length > 0`.
  - `GET /api/ping` → assert `Content-Type: application/json`, body shape `{ status: 'ok', timestamp: number }`.
  - `GET /api/health/latest` → assert new `{ run, results }` shape, **NOT** the legacy `{ screening }` shape (catches Phase 6 cleanup regressions).

### 7.7 `@/api/middleware/health.ts` — Auth round-trip

- Loopback `fetch /api/auth/...` (whichever route the existing auth middleware protects) **without** `Authorization` header → assert 401.
- Same with `Authorization: Bearer ${WORKER_API_KEY}` → assert 200.
- Both must hold. Catches auth middleware regressions.

### 7.8 `@/health/checks/bindings.ts` — Binding sweep (5 sub-checks in parallel)

- **`BROWSER`**: `puppeteer.launch(env.BROWSER)`, navigate to `data:text/html,<h1>Health</h1>`, screenshot, assert PNG bytes > 100. Close browser. `SKIPPED` if binding missing.
- **`R2_AUDIO_BUCKET`**: `put('__health_check', new Uint8Array([1,2,3]))` → `get` → assert bytes match → `delete`.
- **`EMAIL_OUT`**: assert binding exists; construct + serialize a `MIMEMessage` from `mimetext`. **Does NOT send mail.**
- **`SESSIONS`** (separate KV): `put('__health_check', '1', { expirationTtl: 60 })` → `get` → assert `=== '1'` → `delete`.
- **`SANDBOX`** standalone: `provisionSandbox(env, 'binding-health-check')` → `sandbox.exec('echo ready')` → assert stdout includes `ready` → destroy. Independent of `TranscriptionAgent`.

### 7.9 `@/health/checks/d1-table-scan.ts`

- `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`.
- For each table: `SELECT COUNT(*) FROM "${name}"`.
- Returns `status: 'success'` with `details.warnings: [...]` when expected-non-empty tables are empty (warning, not failure). Surfaces in the dashboard UI as yellow not red.

### 7.10 `@/health/checks/{secrets,env-vars,notebooklm-credentials,tts,stt}.ts`

- Move existing logic from `services/health.ts:125-228, 383-475` verbatim into these files.
- **NEW for TTS**: read first chunk of returned `ReadableStream`, assert byte count > 0.
- **NEW for STT**: assert `result.text !== undefined` (allow empty string for silent input but key must exist).

---

## 8. Coordinator (`src/health/coordinator.ts`)

Pattern from cloudflare-jedi `references/health-system.md` lines 374–504.

- `PER_CHECK_TIMEOUT_MS = 8_000` (per-check hard timeout).
- Inserts `health_results` rows in batches of 9 (10 columns × 9 = 90 params, under D1's 100-param cap).
- Single `CHECKS` registry — adding a check = one new row.
- All imports use tsconfig aliases (`@/...`, `@db/...`, `@ai/...`):

```typescript
import { checkHealth as checkDb } from "@/db/health";
import { checkHealth as checkAi } from "@ai/health";
import { checkHealth as checkProviders } from "@ai/providers/health";
import { checkHealth as checkGoogle } from "@ai/tools/google/health";
import { checkHealth as checkOrchestrator } from "@ai/agents/orchestrator/health";
import { checkHealth as checkNotebookLM } from "@ai/agents/notebooklm/health";
import { checkHealth as checkNotebookLMMcp } from "@ai/agents/notebooklm-mcp/health";
import { checkHealth as checkTranscription } from "@ai/agents/transcription/health";
import { checkHealth as checkApi } from "@/api/health";
import { checkHealth as checkAuth } from "@/api/middleware/health";
import { checkBindings } from "@/health/checks/bindings";
import { checkD1TableScan } from "@/health/checks/d1-table-scan";
import { checkSecrets } from "@/health/checks/secrets";
import { checkEnvVars } from "@/health/checks/env-vars";
import { checkNotebookLMCreds } from "@/health/checks/notebooklm-credentials";
import { checkTts } from "@/health/checks/tts";
import { checkStt } from "@/health/checks/stt";
```

`runAllChecks(trigger)` returns `{ runId, status, results, durationMs }`.

---

## 9. Hono routes (`src/backend/api/routes/health.ts`)

Three routes, paths unchanged so the frontend continues to work after the response-shape migration:

| Method | Path                 | Behavior                                                                    |
| ------ | -------------------- | --------------------------------------------------------------------------- |
| `GET`  | `/api/health`        | Run suite, persist with trigger `manual`, return `{ run, results }`.        |
| `GET`  | `/api/health/latest` | Read latest persisted run + its results. Returns `{ run, results }` or 404. |
| `POST` | `/api/health/run`    | Run suite, persist with trigger `api`, return `{ run, results }`.           |

Response body for all three is `{ run: HealthRun, results: HealthResult[] }`.
Zod schemas reuse `selectHealthRunSchema` and `selectHealthResultSchema` from drizzle-zod — no hand-maintained shapes.

---

## 10. wrangler.jsonc / Env vars

Existing bindings cover everything except one **new env var** for the Drive template-copy probe:

```jsonc
"vars": {
  "RESUME_TEMPLATE_DOC_ID": "<google-doc-id-of-the-source-resume-template>"
}
```

After adding this, run `pnpm run cf-typegen` (or `wrangler types`) to regenerate `worker-configuration.d.ts`. **Never** hand-edit that file.

Cron trigger `"0 */4 * * *"` is already present at [wrangler.jsonc:138-141](../../wrangler.jsonc) — verify, no change needed.

---

## 11. Frontend changes

### `src/frontend/components/HealthDashboard.tsx`

- Update fetch types to consume `{ run, results }` instead of `{ screening: { resultsJson } }`.
- Render results grouped by `category` (api / database / ai / providers / agents / google / binding / auth / custom).
- For Google Drive results: render `details.createdDocUrls` and `details.folderUrls` as clickable links so the user can manually verify rendering — this is the user-facing escape hatch when the doc is created but styled wrong.
- Keep existing skeleton-on-run, copy-to-clipboard, age display, localStorage event behaviors.

### `src/frontend/components/HealthBadge.tsx`

- Read `data.run.status` instead of `data.screening.status`.
- Status enum becomes `healthy | degraded | unhealthy | unknown` (was `ok | degraded | down | unknown`). Update the color map.

---

## 12. `_worker.ts` scheduled handler

Replace the existing call at [src/\_worker.ts:102-110](../../src/_worker.ts):

```typescript
import { HealthCoordinator } from "@/health/coordinator";

export default {
  async scheduled(event, env, ctx) {
    if (event.cron === "0 */4 * * *") {
      const coord = new HealthCoordinator(env);
      ctx.waitUntil(coord.runAllChecks("scheduled"));
    }
  },
  // ... fetch handler unchanged
};
```

---

## 13. Cleanup (Phase 6)

After §11 is verified end-to-end:

- **Delete** `src/backend/services/health.ts`.
- **Delete** `src/backend/db/schemas/health-screenings.ts` and remove its re-export from `db/schema.ts`.
- **Delete** the `health_screenings` table via a new drizzle migration (`pnpm run db:generate` after schema removal).
- **Delete** the legacy `*RPC` exports in each agent's `health.ts` (replaced by the new `checkHealth(env)` bridge).
- Remove the `ModuleResult` shim re-export from `src/health/types.ts` (added in Phase 1 for transition compat).

---

## 14. Verification (must pass before merge)

1. `pnpm run cf-typegen` — clean.
2. `pnpm run db:generate` — produces a new migration adding the three health tables. Inspect SQL but don't hand-edit.
3. `pnpm exec tsc --noEmit` — zero errors. Catches `@callable` type mismatches and shape regressions.
4. `pnpm run db:migrate:local` so dev D1 has the new tables.
5. `pnpm run dev` — boot wrangler in dev mode.
6. `curl -X POST http://localhost:8787/api/health/run` → `{ run: { status: 'healthy' | 'degraded' | 'unhealthy' }, results: [...] }`. Every registered check appears in `results`. `degraded` is fine on first run if optional providers are unconfigured (they show `status: 'skipped'`, not `failure`).
7. `curl http://localhost:8787/api/health/latest` immediately after — same payload as step 6.
8. `wrangler d1 execute core-resumes --local --command "SELECT * FROM health_runs ORDER BY created_at DESC LIMIT 1"` and corresponding `SELECT ... FROM health_results WHERE run_id = '...'`. Confirms relational persistence works and the 9-row batch limit is respected.
9. Frontend smoke: `/health` shows latest results with age display, working "Run Now" button (skeleton → results), copy-prompt button. **Google Drive section renders `createdDocUrls` as clickable links.** Click one — opens the actual doc in Drive; visually validate the resume template renders correctly.
10. Navbar badge pulses green/yellow/red on every page matching the latest run's status.
11. Cron simulation: `curl "http://localhost:8787/__scheduled?cron=0+*%2F4+*+*+*"`. Confirm a new row in `health_runs` with `trigger = 'scheduled'`.
12. Failure injection: temporarily comment out a binding (e.g. `EMAIL_OUT`) in `wrangler.jsonc`, restart, run health. Bindings sweep reports `failure` for that binding only; everything else stays healthy. Restore.
13. Agent RPC validation: each of the 4 agent results has `details.probeMs` populated — proves the coordinator opened a stub and called `healthProbe`, not a stale fallback.
14. Drive doc retention: run `/api/health/run` twice in succession. After the second run, list `HEALTH_CHECK_DRIVE_FOLDER_ID` — only the most recent run's docs remain. The first run's docs were deleted by the second.
15. Production deploy: `pnpm run deploy` (chains build + db:generate + migrate:remote + wrangler deploy). Hit production `/api/health/latest` to confirm the new shape ships.

If any step fails, the failure surfaces in `health_results.details` with structured info — that's the whole point.
