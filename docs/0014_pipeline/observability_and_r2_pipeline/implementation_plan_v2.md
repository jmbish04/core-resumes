# Implementation Plan v2 — Observability, AI-Troubleshooting Tooling & D1 Relief

> **Supersedes** `implementation_plan.md` (which was the verbatim build brief).
> This v2 is **grounded against the actual `core-resumes` code** (read 2026-05-29). It keeps the
> brief's architecture (sink-pluggable logger, `pipeline_runs`, REST+MCP twin interfaces, R2 SQL
> for the firehose) but **corrects the incident root-causes** the brief assumed, re-sequences the
> work around them, and pins every change to a real file path.

---

## A. What the brief got right (keep as-is)

- **D1 is being used as a log firehose.** Confirmed: `src/backend/lib/logger.ts:30-45` does an
  `await db.insert(logs)` on **every single** `info/warn/error/debug` call, *and* (lines 47-72) an
  RPC to the `SYNC_BROADCAST_AGENT` Durable Object on every call. Two cross-network writes per log
  line is the firehose overloading D1. Schema: `src/backend/db/schemas/system/logs.ts`.
- **The fix shape is correct**: sink-pluggable `LogSink` (AnalyticsEngine first, Pipelines/R2 SQL
  later), structured `LogEvent`, first-class `pipeline_runs` in D1, twin REST `/api/obs/*` + MCP
  tools over one shared service, R2 SQL for the historical firehose.
- **The MCP integration approach is correct**: the MCP is an `McpAgent` DO
  (`src/backend/ai/agents/core-resumes-mcp/index.ts`) whose tools **proxy to the Hono API** via
  `internalFetchJson` (`methods/internal-fetch.ts`). So new tools = new `/api/obs/*` routes +
  thin tool wrappers. No risk to existing "Justin Resume" tools.

## B. What the brief got WRONG (these change the plan)

| # | Brief assumption | Ground truth | Plan impact |
|---|---|---|---|
| B1 | "A failed D1 log insert surfaced as a pipeline error." | The logger **already swallows** DB errors (`logger.ts:40-45`, `[LOGGER_DB_ERROR]`) — it does **not** throw into business logic. | The *throw-into-pipeline* bug doesn't exist. The real harm is **write pressure + latency** (every log blocks on 2 network round-trips), not crashes. Reframe §4.1 "never throw" as **"never block / never await the sink."** |
| B2 | Freelance scan "goes dark" because the agent is never dispatched (tied to `core-browser-ops` `scheduled-scrapes dispatched: 0`). | Freelance does **not** go through `core-browser-ops`. `FreelanceScannerAgent.scanUpwork()` fires `ctx.waitUntil(handleScanUpwork())` (`agents/job/freelance-scanner/index.ts:107-113`) and fetches **RapidAPI directly** (`services/jobs/freelance/rapidapi-client.ts`). The route returns **202 immediately** (`api/routes/freelance/index.ts:113-140`). | Root cause is **local, not cross-worker**: the `catch` in `scan-upwork.ts:104-120` (and `scan-freelancer.ts`) sets in-memory state + emits a WS progress event but **persists nothing** — no `recordScanRun` on the failure path, no log. So a RapidAPI budget/auth/timeout failure inside `waitUntil` vanishes silently. **`freelance_scan_runs` only ever gets `"completed"` rows.** |
| B3 | Greenhouse cron `0 */6 * * *` runs and fails 100/100. | The `0 */6 * * *` cron is **documented** (`_worker.ts:196`) but has **no handler**. `scheduled()` only branches on `0 */12 * * *` (freelance); everything else falls through to the health/salary/discovery default branch (`_worker.ts:199-309`). `JobScannerAgent.scanAll()` is therefore **never cron-triggered**. | The Greenhouse board scan isn't failing — **it isn't running at all** via cron. The "100 failed / 0 scraped" rows come from the **discovery-analyzer cron** (`backend/cron/discovery-analyzer.ts:~321`) writing `session_runs` with `totalScraped:0, totalFailed=failedCount` — those are *analysis* failures (per-job `scrapeGreenhouseJob` failures), not board-scan failures. Also `JobScannerAgent` **never writes `session_runs` at all** (it keeps `RunState` in memory only). |
| B4 | `get_pipeline_stats` reports `totalFailed: 100`. | `api/routes/pipeline/stats.ts` sums `totalScraped/triaged/analyzed` over the last 100 `session_runs` rows and **does not aggregate `totalFailed`**. | The stats source that surfaced "100 failed" needs reconciliation; either the MCP reads a different field or the number came from raw `session_runs` rows. Add `totalFailed` to the stats aggregation and treat `session_runs` rows from discovery-analyzer vs board-scan distinctly. |
| B5 | `core-browser-ops` is part of this repo. | It is a **separate worker** not present in this tree. | Its crons (`scheduled-scrapes`, `notebooklm-cookies`) can only be instrumented by the **HTTP ingest** path (§3 PipelineSink) or by editing that repo. **Out of scope for code changes here**; we expose the *ingest endpoint* + schema so that worker can adopt the same logger. Document the contract; don't pretend to fix its code from here. |

## C. Pre-existing run-tracking tables (reconcile, don't duplicate blindly)

The brief's `pipeline_runs` is a **new unifying abstraction**, but these already exist and must be mapped into it (or kept as the per-pipeline detail layer):

- `session_runs` — Greenhouse/discovery (`schemas/pipeline/jobs/session-runs.ts`)
- `freelance_scan_runs` — freelance (`schemas/pipeline/freelance/freelance-scan-runs.ts`)
- `api_company_sync_stats` — GitHub-action company sync
- `sync_run_events` — granular sync progress events

**Decision:** add **`pipeline_runs`** as the single normalized run-status table that every pipeline
writes via the `runPipeline()` wrapper. The existing tables stay as **domain detail** (read by the
existing business tools); `pipeline_runs` is the **cross-pipeline index** the new obs tools query.
Do **not** rip out the existing tables in this effort.

> ⚠️ **Working-tree caveat:** a schema reorg (`schemas/jobs/` → `schemas/pipeline/jobs/`) is
> **in progress and uncommitted** on branch `feat/salary-agent-sandbox-diagnostics`. Land/commit
> that reorg (or branch from a clean point) **before** generating new migrations, or
> `db:generate` will entangle the new `pipeline_runs` migration with the reorg diff.

---

## D. Revised phasing & PRs

Same spirit as the brief's 5 PRs, re-ordered so the **highest-leverage, lowest-risk** wins land
first and each PR is independently shippable & verifiable against production telemetry.

### PR1 — Logging foundation (non-blocking) + `pipeline_runs` + kill D1 log writes
*Biggest immediate D1 win; unblocks everything else.*

1. `src/backend/lib/observability/logger.ts` — new structured `Logger` emitting the `LogEvent`
   shape from §4.1. **Hard rule (revised per B1): the sink write is fire-and-forget** — never
   `await`ed in the business path. Always `console.log/error` the JSON (Workers Observability
   captures it for free — this is what made the incident diagnosable).
   - `logger.forRun(pipeline, run_id)` child logger auto-stamps `pipeline`/`run_id`/`service`.
   - `normalizeError(e)` → `error_type` enum (`D1_OVERLOAD | TIMEOUT | DEST_UNAVAILABLE |
     PARSE_ERROR | AUTH | UPSTREAM_4XX | UPSTREAM_5XX | UNKNOWN`).
   - `LogSink` interface + `AnalyticsEngineSink` (default) + `ConsoleSink` (test/local).
2. `LogSink(AE)` — bind **Analytics Engine** `OBS` in `wrangler.jsonc` → `pnpm run types`.
   Write via `env.OBS.writeDataPoint({ blobs, doubles, indexes })`. (AE is **not** currently
   declared — confirmed.) Map `LogEvent` fields to blobs/doubles; `pipeline` as an index.
3. `pipeline_runs` Drizzle table under `schemas/pipeline/pipeline-runs.ts` (cross-pipeline, so
   directly under `pipeline/`, not `pipeline/jobs/`). Columns per §4.2 (`run_id` PK, `pipeline`,
   `trigger`, `status`, `started_at`, `finished_at`, `duration_ms`, `attempted`, `succeeded`,
   `failed`, `error_summary` json, `source_breakdown` json, `metadata` json). drizzle-zod exports
   + `TABLE_DESCRIPTION`/`COLUMN_DESCRIPTIONS` per repo convention. Add to the `pipeline` barrel.
4. `src/backend/lib/observability/run-pipeline.ts` — `runPipeline(env, pipeline, trigger, fn)`
   that inserts `status:"running"`, hands `fn` a child logger + counters, and in a `finally`
   updates the terminal status + `error_summary` + `source_breakdown`. **Also writes a single
   summary `LogEvent`** so the firehose has the run rollup.
5. **Migrate off the D1 `logs` table**: replace `Logger` (`lib/logger.ts`) usages with the new
   logger; retire the `logs` insert path. Keep the WS broadcast **only** behind an explicit
   `logger.progress()` call (not on every log) so the UI keeps live progress without 1 DO RPC
   per log line. Drop/deprecate `schemas/system/logs.ts` in a follow-up migration once writers
   are gone.
6. `pnpm run db:generate` → `migrate:remote`; `pnpm run types`. **Do not hand-edit migrations.**

### PR2 — Instrument the dark spots (depends on PR1)
1. **Freelance** (`agents/job/freelance-scanner/methods/scan-upwork.ts`, `scan-freelancer.ts`,
   `scan-all.ts`, route `api/routes/freelance/index.ts`): wrap each scan in `runPipeline(...)`;
   **call `recordScanRun` on the failure path too** (currently only on success — this is the
   silent-death bug, B2); log request-received → run_id issued → terminal status. A triggered
   scan can never again produce zero rows.
2. **Greenhouse / discovery** (`agents/job/scanner/methods/scan-board.ts`, `scan-all.ts`;
   `cron/discovery-analyzer.ts`): wrap in `runPipeline`; log **per-board / per-job** outcome with
   `error_type` and `source` (board token), and **persist `session_runs` from the scanner** (B3 —
   it currently only mutates in-memory `RunState`). Distinguish board-scan vs analysis runs.
3. Document the **`core-browser-ops` ingest contract** (HTTP endpoint + `logs_schema.json`) so the
   separate worker can emit the same `LogEvent`s. No code change in this repo (B5).

### PR3 — Observability service + REST `/api/obs/*` + MCP tools (depends on PR1/PR2 data)
1. `src/backend/services/observability.ts` — single service implementing the 8 capabilities
   (§5.1). Backend is **config-selectable** (`AE` now, `R2 SQL` after PR5) behind one interface.
   - `query_logs`, `list_pipeline_runs`, `get_pipeline_run` (run row + correlated log timeline by
     `run_id`), `get_error_summary`, `get_pipeline_health`, `get_infra_diagnostics`,
     `tail_recent` (always AE/Observability — live), `trigger_pipeline` (generalizes the existing
     freelance `POST /scan` + `scan_pipeline_jobs`; reuse, don't fork).
2. `src/backend/api/routes/obs/` — zod-openapi router (mirror `routes/pipeline/stats.ts`),
   mounted `app.route("/api/obs", obsRouter)` in `backend/api/index.ts`. Shared zod schemas in
   `routes/obs/types.ts` are the **single source of truth** for REST + MCP.
3. `agents/core-resumes-mcp/methods/tools/observability.ts` — `registerObservabilityTools(agent,
   env)`, each tool a thin `internalFetchJson` proxy + rich description. Register in
   `methods/mcp.ts`. Make `get_pipeline_health` + `get_error_summary` the explicit
   **"start here to triage"** tools. Compact, paginated, `limit`-capped, ANSI-stripped, truncated
   responses (large blobs got truncated during the incident). Auth: inherits the existing MCP gate
   (`WORKER_API_KEY` fast path + OAuth); `trigger_pipeline` is the only mutator — rate-limit + log
   the caller; never echo secrets/cookies (redact like `_pk=REDACTED`).

### PR4 — Targeted bug fixes (depends on PR2/PR3 visibility)
1. **Wire the `0 */6 * * *` cron** in `_worker.ts` `scheduled()` to call
   `JobScannerAgent.scanAll()` inside `runPipeline("greenhouse-scan","cron", …)` (B3).
2. **Freelance terminal-status guarantee**: per-scan timeout + retry-with-backoff around the
   RapidAPI call; a "stuck run" reaper (alarm) that fails any `running` row older than N minutes
   so `pipeline_runs` never sits `running` forever (B2).
3. **`get_pipeline_stats`**: aggregate `totalFailed`; separate board-scan vs analysis rows (B4).
4. **Greenhouse fan-out hardening** (only if telemetry shows D1 contention after PR1 relieves the
   firehose): chunked upserts, bounded concurrency, `D1_OVERLOAD` backoff, large/raw payloads to
   R2 not D1.
5. **`notebooklm-cookies`**: reachability pre-check + structured `DEST_UNAVAILABLE` logging —
   *contract only* here (lives in `core-browser-ops`), tracked via the ingest path.

### PR5 — `PipelineSink` + R2 Data Catalog + R2 SQL backend, config flip (depends on PR3)
Implement the brief's §3.1 recipe **after re-verifying against current docs** (R2 SQL is open beta,
syntax moves):
- Provision `core-resumes-obs` bucket + Iceberg catalog (**compaction ON**), `obs_logs_stream`
  with `logs_schema.json`, `logs` sink, and the derived `errors` sink/pipeline.
- Bind the Pipelines **stream** in `wrangler.jsonc`; `PipelineSink` writes via the binding (no
  token in the worker). Keep `AnalyticsEngineSink` writing **in parallel**.
- Point the *historical/range* tools (`query_logs`, `get_error_summary`, `get_pipeline_run`
  timelines) at R2 SQL, **always time-bounded on `__ingest_ts`**. `tail_recent` stays on
  AE/Observability (latency caveat). Backend selection is a config flag.
- Optional `raw-payloads` Iceberg table so large scrape bodies never touch D1.

---

## E. New bindings checklist (wrangler.jsonc → `pnpm run types` after each)

- [ ] `analytics_engine_datasets: [{ binding: "OBS", dataset: "core_resumes_obs" }]` (PR1)
- [ ] Pipelines stream binding for `obs_logs_stream` (PR5; confirm exact key against current docs)
- [ ] R2 bucket `core-resumes-obs` is **provisioned via wrangler CLI**, not bound as a normal R2
      binding (the catalog is queried by R2 SQL, not `env.BUCKET`) (PR5)
- [ ] crons already include `0 */6 * * *` — no wrangler change, just wire the handler (PR4)

## F. Acceptance (unchanged from brief, now testable)

1. `get_pipeline_health` → "freelance-scan", "greenhouse-scan", "salary", "discovery" each show
   last-run/status/staleness; a fresh AI triages with no Cloudflare API access (§5.3).
2. `get_error_summary` turns "N failed" into ranked `error_type`s with sample messages.
3. A `trigger_pipeline("freelance-scan")` produces a **complete, inspectable `pipeline_runs`
   timeline ending in a terminal status** — even on RapidAPI failure (the B2 fix).
4. D1 `D1_OVERLOAD` count trends toward ~0 once the firehose leaves D1 (PR1), verified via
   `get_infra_diagnostics`.

## G. Guardrails (carried from brief §7)

- Add, don't rename — existing MCP/business tools and routes keep working.
- `wrangler.jsonc` + `worker-configuration.d.ts` + Drizzle migrations stay in sync; never
  hand-edit `worker-configuration.d.ts` or generated migrations.
- Never log secrets/cookies/PII — redact.
- Logging never blocks or throws in the business path (revised per B1).
- Ship incrementally; verify each PR against production telemetry before the next.

### G1. Browser-render + multi-method scraping is a HARD guardrail (do not regress)

This effort moves **raw scrape *storage*** to R2 (PR5). It must **not** remove or weaken any
**scrape *capture* method**. The worker deliberately attempts several methods so it always
captures the **core of the role/proposal — all bullets, full description (HTML + markdown)**.
Losing a fallback silently degrades every downstream pipeline (extract → analysis → salary →
proposal drafting). Retain all of the following:

- **`BrowserRendering`** (`src/backend/ai/tools/browser-rendering.ts`) — Cloudflare Browser
  Rendering HTTP API (auth via `env.CLOUDFLARE_ACCOUNT_ID` + `env.CF_BROWSER_RENDER_TOKEN`).
  Methods: `/markdown`, `/scrape`, `/content`, `/snapshot`, `/pdf`. Keep the `BROWSER` binding in
  `wrangler.jsonc`.
- **`scrapeWithFallback()`** (`src/backend/api/routes/intake.ts:59-268`) — orchestrates the 4
  concurrent BR calls, then falls back to the **Greenhouse API** (lines 108-142), then to hybrid
  AI extraction. Keep the full fallback chain intact.
- **Hybrid extraction** (`src/backend/ai/tasks/extract/role-hybrid.ts`, `extract/facts.ts`,
  `classify/headings.ts`, `classify/narrative.ts`) — Pass H (headings) + Pass A (narrative) +
  Pass B (facts) run via `Promise.all` and merged deterministically. Keep all passes.
- Storage today: PDFs → `R2_FILES_BUCKET` (`job-postings/{uuid}.pdf`); facts/bullets/narrative →
  D1 `roles` + `role_bullets`. PR5 may add an R2 raw-payloads table, but **must not** remove the
  D1 structured fields the business tools read.

**Acceptance for any pipeline-touching PR:** a role submitted via `/intake` still yields the full
bullet set + HTML + markdown + narrative, exercising the BR-first path and the Greenhouse-API
fallback. If a PR cannot demonstrate this, it does not ship. See memory
`project-job-scraping-multimethod`.
