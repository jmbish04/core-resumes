# Build Prompt — Observability, AI-Troubleshooting Tooling, and D1 Relief for `core-resumes`

> Paste this into Claude Code (or Cursor/Codex) at the root of `jmbish04/core-resumes`.
> It is written as a single, self-contained engineering brief. Work the phases in order.

---

## 0. Read first

1. **Load the `cloudflare-jedi` skill** and follow its conventions throughout (Hono + zod-openapi → D1 + Drizzle → Astro SSR + shadcn → Agents SDK + AI Gateway; pnpm; TS strict; `wrangler.toml` + `worker-configuration.d.ts` kept in sync). Do not deviate from the stack.
2. Skim the repo and build a quick map of: the Hono app + route mounts, the `/mcp` server (this worker already exposes the "Justin Resume" MCP), the Durable Object agents (at minimum `FreelanceScannerAgent`), the Drizzle schema, the D1 bindings, and every cron handler.
3. Treat the **Incident Context** below as ground truth — it came from live Workers Observability + the existing MCP. Do not re-derive it; build to fix it.

---

## 1. Incident Context (what is actually broken)

Pulled from production telemetry for this account:

**A. The "freelancer" (Upwork) pipeline = `FreelanceScannerAgent`** (Durable Object in `core-resumes`, fronted by `/api/freelance/*` and `/agents/freelance-scanner-agent/*`).
- Read API is healthy: `/api/freelance/stats`, `/scan-runs`, `/opportunities` all return `200` quickly.
- **Scans are triggered but never visibly execute.** `POST /api/freelance/scan` is received (multiple times over days) but there is **no logged completion** (`--> POST /api/freelance/scan <status>` never appears) and **zero scan-lifecycle log lines** — no "scan started", "scan complete", "opportunities found", and **no `upwork` string anywhere in logs**. The trigger fires and the pipeline goes dark.
- Agent WebSocket churns (≈22 connects vs ≈19 disconnects) — UI polling an agent that does no work.

**B. The Greenhouse company-scan pipeline** (cron `0 */6 * * *`, surfaced via MCP `get_pipeline_stats`) fails **100% every run**: `totalScraped: 0, totalTriaged: 0, totalAnalyzed: 0, totalFailed: 100` across the last 14 sessions. The perfectly round "100 failed / 0 success" implies a systemic failure where every item in the batch dies before persisting — and the real per-item error is **invisible** because nothing structured is logged.

**C. `core-browser-ops` worker (the scrape/browser-rendering dispatcher) is leaking the real errors:**
- `[cron.scheduled-scrapes] dispatched: 0` — the 15-minute scheduler is enqueuing **nothing**, so downstream scanners (incl. freelance) may never be told to run.
- `[cron.notebooklm-cookies] failed Error: destination_unavailable` (≈22×) and `... status: failed cookies: 22` — the NotebookLM cookie-sync destination/tunnel is down.
- **`D1_ERROR: D1 DB is overloaded. Requests queued for too long.`** on both `scheduled-scrapes` and `notebooklm-cookies`.

**D. D1 is the throughput bottleneck.** In addition to (C), the freelance agent logged `[LOGGER_DB_ERROR] Failed to insert log to D1: insert into "logs" ...`. **The app is writing its log firehose into a D1 `logs` table**, and that write pressure is overloading D1 and dropping both logs and (likely) scan results.

**E. There is no first-class way for an AI assistant to troubleshoot this.** During the incident, diagnosis was only possible via raw Cloudflare Workers Observability telemetry API access. The existing MCP exposes business tools (`get_pipeline_stats`, `get_role_logs`, `scan_pipeline_jobs`, `reprocess_role`, …) but **no log-query, run-inspection, error-summary, or health tools**. That gap is what this brief closes.

---

## 2. Objectives

1. **Unified, structured, queryable observability** for every pipeline and agent (freelance, Greenhouse, notebooklm-cookies, salary, and any future pipeline).
2. **Two coordinated interfaces — a REST API and MCP tools** — that let an AI assistant self-serve troubleshooting (query logs, inspect runs, summarize errors, check health, trigger + watch a pipeline) without raw Cloudflare API access.
3. **Fix the outlined bugs** and **relieve D1** by moving the high-volume firehose off D1 (evaluate/implement R2 Data Catalog + R2 SQL via Pipelines, with Workers Analytics Engine as the low-friction fallback).

These are interdependent: do the logging foundation (§4) first, because §5 (the tools) and §6 (the fixes) both depend on it.

---

## 3. Architecture decision: where data lives (READ THIS — it drives everything)

Split the data by access pattern. **Do not put append-only firehose data in D1.**

| Data | Volume / pattern | Home | Queried by |
|---|---|---|---|
| Operational state: current opportunities, **pipeline_runs** (run status + aggregate counts), roles, config | low, transactional, relational | **D1 (Drizzle)** — keep | UI + MCP |
| **Structured logs** (per-step events) | firehose, append-only, analytical | **R2 Data Catalog (Iceberg) via Pipelines** | **R2 SQL** |
| Raw scrape payloads / historical opportunity snapshots | large, append-only | **R2 Data Catalog (Iceberg) via Pipelines** | **R2 SQL** |

**Why R2 SQL fixes D1:** R2 SQL is Cloudflare's serverless query engine over Apache Iceberg tables in R2 Data Catalog, purpose-built for logs/time-series/event data. Ingestion is via **Cloudflare Pipelines** (Stream → transform → Sink to R2 Data Catalog), which accepts events over an **HTTP endpoint or a Worker binding**. Moving the log/event firehose to this path removes the writes that are overloading D1 today. R2 SQL itself is **read-only** (retrieval SQL: SELECT, JOINs, CTEs, JSON functions) and currently **open beta with usage not yet billed** — so it complements D1, it does not replace it as the system-of-record.

**Implementation guidance — make logging sink-pluggable.** Define a `LogSink` interface and ship two implementations so we are not blocked on the beta and can flip with config:
- `AnalyticsEngineSink` — **default / phase 1.** Write structured events via a Workers Analytics Engine binding (`env.OBS.writeDataPoint(...)`); query via the AE SQL API. GA, trivial, zero D1 load. Use this to unblock immediately.
- `PipelineSink` — **phase 3.** Write events to a Cloudflare Pipelines Stream (Worker binding) → R2 Data Catalog; query via R2 SQL (`wrangler r2 sql query` / the R2 SQL HTTP API). Use for long-retention, large-payload, JOIN-heavy analysis.
- **Always** also `console.log`/`console.error` the structured JSON so the built-in Workers Observability captures it for free (this is what made diagnosis possible at all). Keep `trace_id`/`span_id` so app logs correlate with platform traces.
- **Remove the D1 `logs` table write path entirely** (this is the single biggest immediate D1 win). Migrate/retire the table.

Confirm current R2 SQL / Pipelines availability and exact binding syntax against `developers.cloudflare.com` before implementing the `PipelineSink` (it is moving fast).

### 3.1 Concrete `PipelineSink` recipe (verified against the R2 SQL end-to-end tutorial)

Reference: `https://developers.cloudflare.com/r2-sql/tutorials/end-to-end-pipeline/`. The mechanics below are confirmed from that tutorial — follow them, but re-verify flags against current docs.

**Provisioning (one-time, wrangler):**
```bash
# 1. Bucket + Iceberg catalog (note the printed WAREHOUSE = ACCOUNTID_BUCKETNAME and Catalog URI)
npx wrangler r2 bucket create core-resumes-obs
npx wrangler r2 bucket catalog enable core-resumes-obs
# 2. Compaction ON — logs produce many small files; this is required for sane query perf/cost
npx wrangler r2 bucket catalog compaction enable core-resumes-obs --token $CATALOG_TOKEN
# 3. Stream with a declared schema (see logs_schema.json below)
npx wrangler pipelines streams create obs_logs_stream --schema-file logs_schema.json
# 4. Sink → Iceberg table; rolls to the table every N seconds, auto-adds __ingest_ts partitioned by DAY
npx wrangler pipelines sinks create obs_logs_sink --type r2-data-catalog \
  --bucket core-resumes-obs --namespace observability --table logs \
  --roll-interval 30 --catalog-token $CATALOG_TOKEN
# 5. Pipeline = SQL connecting stream → sink
npx wrangler pipelines create obs_logs_pipeline \
  --sql "INSERT INTO obs_logs_sink SELECT * FROM obs_logs_stream"
# 6. Derived ERROR table (second pipeline off the SAME stream) so get_error_summary scans little
npx wrangler pipelines sinks create obs_errors_sink --type r2-data-catalog \
  --bucket core-resumes-obs --namespace observability --table errors \
  --roll-interval 30 --catalog-token $CATALOG_TOKEN
npx wrangler pipelines create obs_errors_pipeline \
  --sql "INSERT INTO obs_errors_sink SELECT * FROM obs_logs_stream WHERE level = 'error' OR level = 'fatal'"
```

**Schema (`logs_schema.json`)** — flat typed columns for everything you filter/group on, plus one JSON string column for the variable bag (query it with R2 SQL JSON functions like `json_get_str(metadata, 'board')`). Pipelines appends `__ingest_ts` automatically; do **not** declare it.
```json
{ "fields": [
  { "name": "ts",          "type": "string",  "required": true },
  { "name": "level",       "type": "string",  "required": true },
  { "name": "pipeline",    "type": "string",  "required": true },
  { "name": "service",     "type": "string",  "required": true },
  { "name": "run_id",      "type": "string",  "required": false },
  { "name": "step",        "type": "string",  "required": false },
  { "name": "source",      "type": "string",  "required": false },
  { "name": "message",     "type": "string",  "required": false },
  { "name": "error",       "type": "string",  "required": false },
  { "name": "error_type",  "type": "string",  "required": false },
  { "name": "duration_ms", "type": "float64", "required": false },
  { "name": "attempted",   "type": "int64",   "required": false },
  { "name": "succeeded",   "type": "int64",   "required": false },
  { "name": "failed",      "type": "int64",   "required": false },
  { "name": "trace_id",    "type": "string",  "required": false },
  { "name": "metadata",    "type": "string",  "required": false }
] }
```

**Writing from the worker:** prefer the **Pipelines Worker binding** for `core-resumes` (bind the stream in `wrangler.toml`, write events from `PipelineSink` — no fetch hop, no token in the worker). Use the stream's **HTTP ingest endpoint** (`https://<stream_id>.ingest.cloudflare.com`, POST JSON batches of ≤100) only for `core-browser-ops` if it stays a separate worker. Batch writes; never block business logic on the sink.

**Querying (powers §5 tools):** always bound time so the DAY partition prunes the scan (R2 SQL bills per compressed byte scanned).
```bash
npx wrangler r2 sql query "$WAREHOUSE" \
  "SELECT ts, pipeline, error_type, message FROM observability.errors \
   WHERE __ingest_ts > '<iso>' AND pipeline = 'freelance-scan' ORDER BY ts DESC LIMIT 50"
```

> ⚠️ **Latency caveat that shapes the design:** the sink rolls on an interval (e.g. 30s) + compaction, so R2 SQL is **near-real-time, not live**. Therefore: **live tail / `tail_recent` must read Workers Observability or Analytics Engine**, and R2 SQL backs the historical/analytical tools (`query_logs` over a range, `get_error_summary`, `get_pipeline_run` timelines). Keep the `LogSink` writing to AE *and* the Pipeline so both surfaces have data.

---

## 4. Phase 1 — Logging foundation (do first)

### 4.1 One structured logger, used everywhere
Create a single `Logger` utility (e.g. `src/lib/observability/logger.ts`) and route **all** pipelines, agents, cron handlers, and route handlers through it. No more ad-hoc `console.log("[cron.x] ...")` strings.

Every event is a typed object:

```ts
interface LogEvent {
  ts: string;            // ISO8601
  level: "debug" | "info" | "warn" | "error" | "fatal";
  pipeline: string;      // "freelance-scan" | "greenhouse-scan" | "notebooklm-cookies" | "salary" | ...
  run_id?: string;       // uuid per pipeline execution (correlation)
  step?: string;         // "dispatch" | "fetch" | "parse" | "persist" | "complete"
  source?: string;       // "upwork" | greenhouse board token | platform
  service: string;       // "core-resumes" | "core-browser-ops"
  message: string;
  error?: string;        // full error message
  error_type?: string;   // normalized: D1_OVERLOAD | TIMEOUT | DEST_UNAVAILABLE | PARSE_ERROR | AUTH | UPSTREAM_4XX | UPSTREAM_5XX | UNKNOWN
  duration_ms?: number;
  counts?: { attempted?: number; succeeded?: number; failed?: number };
  trace_id?: string;
  span_id?: string;
  metadata?: Record<string, unknown>;
}
```

Requirements:
- `logger.forRun(pipeline, run_id)` returns a child logger that auto-stamps `pipeline`/`run_id`/`service` so callers can't forget them.
- A `normalizeError(e)` helper maps raw errors to `error_type` (so "100 failed" becomes "100 failed: 98×TIMEOUT, 2×D1_OVERLOAD").
- Writes go to the configured `LogSink` **and** stdout; logging must **never throw** into business logic (wrap the sink write, swallow+counter on failure). The current bug is that a failed D1 log insert surfaced as a pipeline error — that must be impossible.
- Sampling/level threshold configurable via the existing config mechanism.

### 4.2 First-class `pipeline_runs` (stays in D1 — it's small + transactional)
Add a Drizzle table + lifecycle so every run is recorded and inspectable:

```
pipeline_runs(
  run_id PK, pipeline, trigger ("cron"|"manual"|"api"),
  status ("running"|"success"|"failed"|"degraded"),
  started_at, finished_at, duration_ms,
  attempted, succeeded, failed,
  error_summary (json: [{error_type, count, sample_message}]),
  source_breakdown (json), metadata (json)
)
```
- On start: insert `status="running"`.
- Per item: structured log + increment counters.
- On finish: update to `success` / `degraded` (some failures) / `failed` (all/critical), persist `error_summary` (top error types with counts + a sample message) and `source_breakdown`.
- **Every** pipeline gets this: wrap each pipeline's body in a `runPipeline(pipeline, trigger, fn)` helper that opens the run, provides the child logger, and closes the run in a `finally`.

### 4.3 Instrument the dark spots
- `FreelanceScannerAgent`: log the **full scan lifecycle** — scan requested, queued/dispatched, per-source (`upwork`) fetch start/end + result count, parse, persist, complete, and **every catch**. The `POST /api/freelance/scan` handler must log request received → run_id issued → response returned (even on error/timeout), so a triggered scan can never again go silent.
- Greenhouse scan: log **per-board** outcome with `error_type`, so the "100 failed" is explained item-by-item.
- `core-browser-ops` crons (`scheduled-scrapes`, `notebooklm-cookies`): adopt the same logger + `pipeline_runs`; log *why* `dispatched: 0` (empty queue? filter? upstream empty?).

---

## 5. Phase 2 — The two troubleshooting interfaces (REST + MCP)

Build a **shared service layer** (`src/services/observability.ts`) and expose it through both a REST router (`/api/obs/*`, zod-openapi) **and** new tools on the **existing** `/mcp` server. Both surfaces call the same service — no duplicated logic. The goal: an AI assistant connected to the MCP can do everything this incident required, with **no raw Cloudflare API access**.

### 5.1 Capabilities (each = one service fn → one REST route → one MCP tool)

1. **`query_logs`** — filters: `pipeline?`, `run_id?`, `level?` (min level), `error_type?`, `source?`, `since`/`until` (or `lookback`), `q` (substring), `limit` (≤500), `cursor`. Returns normalized `LogEvent[]` + `next_cursor`. Backed by the log sink (AE SQL or R2 SQL).
2. **`list_pipeline_runs`** — filters: `pipeline?`, `status?`, `lookback`, `limit`. Returns run rows incl. counts + `error_summary`. (This alone would have instantly shown "freelance scans triggered, never completed".)
3. **`get_pipeline_run`** — `run_id` → full run record **+ its correlated log timeline** (joins runs to logs by `run_id`).
4. **`get_error_summary`** — `pipeline?`, `lookback` → top `error_type`s grouped+counted with sample messages and affected sources. (Turns "100 failed" into a ranked cause list.)
5. **`get_pipeline_health`** — for each pipeline: last run time, last status, success rate over N runs, **staleness** (is data older than the expected cadence?), and a rolled-up `ok | degraded | failing | stale | idle`. Include a top-level system verdict.
6. **`get_infra_diagnostics`** — D1 health signals (recent `D1_OVERLOAD` count + trend, slow-query hints), sink write-failure counts, and cron freshness (last fire per cron + `dispatched` counts). This is the "is the platform itself struggling?" probe.
7. **`tail_recent`** — last N events across all pipelines (level filter), for a quick "what's happening right now".
8. **`trigger_pipeline`** — `pipeline`, optional params (e.g. `source: "upwork"`, or board token) → starts a run, returns `run_id`. Then `get_pipeline_run(run_id)` lets the assistant watch it. (Generalize the existing `scan_pipeline_jobs` / freelance `POST /scan`; reuse, don't fork.)

### 5.2 Tool quality (so an AI actually uses them well)
- Rich MCP tool **descriptions** with: when to use, param meanings, and an example call. Make `get_pipeline_health` and `get_error_summary` the obvious **first** tools ("start here to triage").
- zod schemas shared between REST validation and MCP input schemas (single source of truth).
- Responses are compact, structured JSON (no giant time-series blobs by default; that bit us — large telemetry responses got truncated). Always paginate; always cap `limit`; strip ANSI; truncate long messages with a `…` + a way to fetch full.
- **Auth/safety:** these are read/diagnostic tools — keep them behind the same auth as the existing MCP; `trigger_pipeline` is the only mutating one (rate-limit it, log who/what triggered, never expose secrets/cookies in any log or response — redact like the existing `_pk=REDACTED`).

### 5.3 Definition of done for §5
> A fresh AI assistant with only the MCP connected can, unaided: (1) call `get_pipeline_health` and see "freelance-scan: failing/idle, greenhouse-scan: failing (100/100)", (2) call `get_error_summary` and get "D1_OVERLOAD ×N, TIMEOUT ×M", (3) `get_pipeline_run` to read a single run's timeline, (4) `trigger_pipeline("freelance-scan")` and watch it complete — **all without touching the Cloudflare API.**

---

## 6. Phase 3 — Fixes + D1 relief

1. **Kill D1 log writes** — remove the `logs`-table insert path; route to `LogSink` (§3/§4). Expect the `D1_overloaded` / `LOGGER_DB_ERROR` rate to drop immediately. Verify via `get_infra_diagnostics`.
2. **Freelance scan execution** — with §4.3 logging in place, find where `POST /api/freelance/scan` dies after acknowledging: is the agent never dispatched (tie to `scheduled-scrapes dispatched: 0`), hanging on the Upwork fetch, or timing out? Fix the root cause; ensure the run always reaches a terminal `pipeline_runs` status. Add a per-scan timeout + retry-with-backoff and a "stuck run" reaper.
3. **`scheduled-scrapes dispatched: 0`** — diagnose the empty dispatch (queue population logic / active-source filter / schedule) so freelance + other scanners actually get work. Add an explicit log of the candidate set size and why items were/weren't dispatched.
4. **Greenhouse 100/100 failures** — with per-board `error_type` logging, fix the dominant cause. If it's D1 write contention during fan-out: batch writes (chunked `INSERT`/`UPSERT`), cap concurrency, write large/raw results to R2 not D1, and add backoff on `D1_OVERLOAD`. Replace the unconditional 100-failure batch with bounded-concurrency + retry.
5. **`notebooklm-cookies destination_unavailable`** — separate root cause (the tunnel/destination the cookie-sync posts to is down). Add a reachability pre-check, structured `DEST_UNAVAILABLE` logging, and alerting; don't let it spam-fail silently.
6. **Stand up the R2 path (the lasting D1 relief)** — implement `PipelineSink` exactly per the **§3.1 recipe**: provision bucket + catalog (compaction ON), the `obs_logs_stream` + `logs` sink, and the derived `errors` table via a second filtering pipeline; write from the worker via the Pipelines **binding**; back the *historical/range* tools (`query_logs`, `get_error_summary`, `get_pipeline_run` timelines) with R2 SQL, always time-bounding on `__ingest_ts`. Respect the latency caveat: keep `tail_recent`/live on AE/Observability. Keep AE writing in parallel and make the query backend config-selectable. Optionally add a `raw-payloads` Iceberg table for large scrape bodies so they never hit D1. Validate binding/flag syntax against current Cloudflare docs.

---

## 7. Guardrails

- **Do not break the existing MCP/business tools or routes.** Add, don't rename. The "Justin Resume" MCP tools must keep working.
- Keep `wrangler.toml`, `worker-configuration.d.ts`, and Drizzle migrations in sync (cloudflare-jedi rules). New bindings: Analytics Engine (`OBS`), Pipelines, R2 Data Catalog — declare them properly.
- Never log secrets, cookies, tokens, or PII. Redact. The diagnostic tools must be safe for an AI to read aloud.
- Logging must never throw into pipeline logic.
- Ship incrementally and verify each phase against production telemetry before moving on.

## 8. Suggested order & PRs
1. PR1: `Logger` + `LogSink(AE)` + `pipeline_runs` + `runPipeline()` wrapper + remove D1 log table. (Phase 1)
2. PR2: instrument freelance / greenhouse / browser-ops crons. (Phase 1)
3. PR3: observability service + REST `/api/obs/*` + MCP tools. (Phase 2)
4. PR4: bug fixes 6.1–6.5. (Phase 3)
5. PR5: `PipelineSink` + R2 Data Catalog + R2 SQL backend, config flip. (Phase 3)

**Acceptance:** `get_pipeline_health` reports all pipelines green or explains why; D1 `D1_OVERLOAD` count trends to ~0; a triggered freelance scan produces a complete, inspectable run timeline ending in a terminal status; and the whole §5.3 walkthrough works from the MCP alone.