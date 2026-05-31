# Walkthrough — Observability & R2 Pipeline: Current-State Investigation

> **Status: investigation + grounded re-plan complete. No code changed yet.**
> This documents what the `core-resumes` code *actually does* today (read 2026-05-29 on branch
> `feat/salary-agent-sandbox-diagnostics`), verified against the incident brief. It is the evidence
> base for [`implementation_plan_v2.md`](./implementation_plan_v2.md).

---

## 1. How logging works today (the D1 firehose)

`src/backend/lib/logger.ts` — every `Logger.info/warn/error/debug` call does **three** things
synchronously, two of which are cross-network:

1. `console.*` mirror (free, captured by Workers Observability).
2. **`await db.insert(logs)`** into the D1 `logs` table (`schemas/system/logs.ts`) — *blocks the
   business path on a D1 write, every log line.*
3. **`await getAgentByName(SYNC_BROADCAST_AGENT).reportProgress(...)`** — *an RPC to a Durable
   Object, every log line.*

DB errors are caught and logged as `[LOGGER_DB_ERROR]` (lines 40-45) — so the logger **does not
crash** the pipeline (correcting the brief's assumption). The real damage is **latency + write
pressure**: two network round-trips per log line is what overloads D1 under any high-volume
pipeline. This is the single biggest D1 win to claw back.

## 2. Freelance scan — why it "goes dark"

Path: `POST /api/freelance/scan` (`api/routes/freelance/index.ts:113-140`)
→ `getAgentByName(FREELANCE_SCANNER_AGENT,"global")`
→ `agent.scanUpwork()` (`agents/job/freelance-scanner/index.ts:107-113`) which does
`ctx.waitUntil(handleScanUpwork(...))` and the route **returns 202 immediately**.

Inside `handleScanUpwork` (`methods/scan-upwork.ts`):
- **Success path** (lines 73-103): upserts opportunities, sets `status:"completed"`, calls
  `service.recordScanRun({... status:"completed" ...})`, emits a WS progress event.
- **Failure path** (lines 104-120): sets in-memory `run.status="failed"` and emits a WS progress
  event — **and nothing else.** No `recordScanRun`. No log. No DB row.

So when the RapidAPI call fails (budget exhausted, bad key, timeout) inside the `waitUntil`
background task, the run **leaves no trace**: `freelance_scan_runs` only ever accumulates
`"completed"` rows, the logs table gets nothing, and the only signal — a WebSocket broadcast — goes
to a UI client that has usually already disconnected (the ~22 connect / ~19 disconnect churn in the
incident). The fetch is **direct to RapidAPI** (`services/jobs/freelance/rapidapi-client.ts`);
there is **no dependency on `core-browser-ops`** for freelance, contrary to the brief.

**Fix (PR2/PR4):** wrap in `runPipeline`, persist a terminal `pipeline_runs` + `freelance_scan_runs`
row on the failure path, add a timeout/retry + a stuck-run reaper.

## 3. Greenhouse scan — it isn't running at all

`_worker.ts:196` documents a `0 */6 * * *` Greenhouse cron, but the `scheduled()` handler
(`_worker.ts:199-309`) only branches on `0 */12 * * *` (freelance). Every other cron — including
`0 */6` — **falls through to the default branch** (health check + salary refresh + github-watch +
discovery scorer + discovery analyzer + company enrichment). `JobScannerAgent.scanAll()` is
therefore **never triggered by cron**.

Two compounding gaps:
- `JobScannerAgent` (`agents/job/scanner/methods/scan-board.ts`) tracks `scraped/triaged/analyzed/
  failed` in an **in-memory `RunState` only** — it **never writes `session_runs`**. Board-scan
  failures are captured in `run.error` and then discarded.
- The "100 failed / 0 scraped" rows surfaced in the incident come from the **discovery-analyzer
  cron** (`backend/cron/discovery-analyzer.ts`), which writes `session_runs` with
  `totalScraped:0, totalFailed=failedCount` — those are *per-job analysis-scrape* failures, not
  board-scan failures.
- `api/routes/pipeline/stats.ts` sums `scraped/triaged/analyzed` over the last 100 `session_runs`
  but **does not aggregate `totalFailed`** — so the stats source needs reconciliation.

**Fix (PR4):** wire the `0 */6` cron to `JobScannerAgent.scanAll()` inside `runPipeline`, make the
scanner persist `session_runs`, separate board-scan vs analysis runs, and aggregate `totalFailed`.

## 4. The MCP server — clean extension point

`CoreResumesMcpAgent` (`agents/core-resumes-mcp/index.ts`) is an `McpAgent` Durable Object serving
`/mcp` (Streamable HTTP) + `/sse`, wired in `_worker.ts` and gated by `WORKER_API_KEY` (fast path)
then OAuth 2.1. Tools register via `agent.server.tool(name, description, zodShape, handler)` in
`methods/tools/*.ts`, orchestrated from `methods/mcp.ts`. Crucially, **tools proxy to the Hono API**
via `internalFetchJson(env, path, init)` rather than reimplementing logic.

This means the new observability tools are low-risk and additive: build `/api/obs/*` Hono routes,
then register thin tool wrappers that call them. ~70 existing business tools are untouched.

## 5. Bindings & data layout today

- **D1** `DB` = `core-resumes`. **R2**: `R2_AUDIO_BUCKET`, `R2_FILES_BUCKET`, `R2_JOBS_BUCKET`.
- **No Analytics Engine**, **no Pipelines** binding yet. **Observability is enabled** in
  `wrangler.jsonc` (logging + traces + head sampling) — this is why raw telemetry diagnosis worked.
- **Crons** already declared: `["0 */4 * * *", "0 */6 * * *", "0 */12 * * *"]`.
- **Run-tracking tables already exist**: `session_runs`, `freelance_scan_runs`,
  `api_company_sync_stats`, `sync_run_events`. The new `pipeline_runs` will be the cross-pipeline
  *index* on top of these, not a replacement.
- **A schema reorg (`schemas/jobs/` → `schemas/pipeline/jobs/`) is uncommitted in the working
  tree** — commit/land it before generating the `pipeline_runs` migration.

## 6. Target end-state (how the fixed system works)

```
pipeline code ──runPipeline()──▶ Logger ──┬─▶ console.* (Workers Observability)   [live, free]
                                           ├─▶ AnalyticsEngineSink (env.OBS)        [live tail]
                                           └─▶ PipelineSink → R2 Data Catalog       [historical]
                                                                    │
   pipeline_runs (D1) ◀── runPipeline finally{} writes terminal status + error_summary
                                                                    │
        observability service (src/backend/services/observability.ts)
        AE/Observability ← tail_recent, get_pipeline_health (live)
        R2 SQL           ← query_logs, get_error_summary, run timelines (historical)
                                   │                          │
                       REST /api/obs/* (zod-openapi)   MCP tools (proxy via internalFetchJson)
```

A fresh AI assistant connected only to the MCP can then: `get_pipeline_health` (see which pipelines
are failing/idle/stale) → `get_error_summary` (ranked `error_type`s) → `get_pipeline_run(run_id)`
(full timeline) → `trigger_pipeline("freelance-scan")` and watch it reach a terminal status — with
no raw Cloudflare API access.

## 7. Recommended next action

Start with **PR1** (non-blocking structured logger + `LogSink(AE)` + `pipeline_runs` + retire the
D1 `logs` write path) — it is the highest-leverage, lowest-risk change and immediately relieves D1.
Land the in-flight schema reorg first so the new migration is clean. PRs 2-5 follow the sequencing
in [`implementation_plan_v2.md`](./implementation_plan_v2.md) §D.
