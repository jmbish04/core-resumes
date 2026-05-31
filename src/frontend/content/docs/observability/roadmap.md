---
title: "Roadmap"
date_last_updated: "2026-05-31"
---

# Roadmap

Last updated: May 29, 2026

PR1 shipped the **foundation** — the non-blocking logger, the `pipeline_runs` index, and the `runPipeline()` wrapper. This page tracks what's built on top of it. PR1 is the highest-leverage, lowest-risk change; everything below depends on it.

## Status at a glance

| PR | Scope | Status |
| --- | --- | --- |
| **PR1** | Non-blocking logger + `pipeline_runs` + kill the D1 log firehose | ✅ Shipped |
| **PR2** | Instrument the dark spots (freelance, greenhouse, discovery) | Planned |
| **PR3** | Observability service + REST `/api/obs/*` + MCP tools | Planned |
| **PR4** | Targeted bug fixes (greenhouse cron, stuck-run reaper, stats) | Planned |
| **PR5** | `PipelineSink` + R2 Data Catalog + R2 SQL historical backend | Planned |

## PR2 — Instrument the dark spots

Wrap the pipelines that currently "go dark" in [`runPipeline()`](/docs/observability/run-pipeline) so every run leaves a terminal row.

- **Freelance** (`scan-upwork.ts`, `scan-freelancer.ts`, `scan-all.ts`, `api/routes/freelance/index.ts`): wrap each scan; **call `recordScanRun` on the failure path too** — today only the success path persists, so a RapidAPI failure inside `ctx.waitUntil(...)` vanishes. Log request-received → `run_id` → terminal status.
- **Greenhouse / discovery** (`agents/job/scanner/methods/scan-board.ts`, `scan-all.ts`; `cron/discovery-analyzer.ts`): wrap in `runPipeline`; **persist `session_runs` from the scanner** (currently `RunState` lives in memory only); log per-board/per-job outcome with `error_type` + `source`; distinguish board-scan from analysis.
- Document the `core-browser-ops` ingest contract (HTTP endpoint + `logs_schema.json`) — no code change in this repo.

## PR3 — Observability service + REST + MCP

One config-selectable service (`src/backend/services/observability.ts`) backing both a REST router and MCP tools, so the wire contract has a single source of truth.

Eight capabilities: `query_logs`, `list_pipeline_runs`, `get_pipeline_run`, `get_error_summary`, `get_pipeline_health`, `get_infra_diagnostics`, `tail_recent`, and `trigger_pipeline` (generalized from the existing freelance `POST /scan` — reuse, don't fork).

- REST: a `@hono/zod-openapi` router mounted at `app.route("/api/obs", obsRouter)`, mirroring `routes/pipeline/stats.ts`. Shared Zod schemas in `routes/obs/types.ts` are the single source of truth for REST + MCP.
- MCP: thin `internalFetchJson` proxies in `agents/core-resumes-mcp/methods/tools/observability.ts`. `get_pipeline_health` + `get_error_summary` are the "start here" tools. Responses are paginated / `limit`-capped / truncated; secrets redacted; only `trigger_pipeline` mutates (rate-limited + caller logged). Inherits the existing MCP auth gate.

## PR4 — Targeted bug fixes

Fixes that the PR2/PR3 visibility makes diagnosable and verifiable.

- **Greenhouse cron never runs:** wire `0 */6 * * *` in `_worker.ts` `scheduled()` → `JobScannerAgent.scanAll()` inside `runPipeline("greenhouse-scan", "cron", …)`. Today `scheduled()` only branches on the `0 */12` freelance cron; the documented `0 */6` Greenhouse cron falls through with no handler.
- **Stuck-run reaper:** a per-scan timeout + retry-with-backoff, plus an alarm that fails any `running` row older than N minutes — closing the one gap `finally{}` can't cover (a killed isolate).
- **Stats:** `get_pipeline_stats` aggregates `totalFailed` and separates board-scan vs analysis rows.
- **Greenhouse fan-out hardening** — only if telemetry still shows D1 contention after PR1 (chunked upserts, bounded concurrency, `D1_OVERLOAD` backoff, large payloads to R2).

## PR5 — Historical backend (R2 Data Catalog + R2 SQL)

The historical, queryable-over-time half of the architecture.

- Provision a `core-resumes-obs` bucket + Iceberg catalog (compaction ON), an `obs_logs_stream` + `logs_schema.json`, a `logs` sink and a derived `errors` sink. Bind the Pipelines stream in `wrangler.jsonc`; a new `PipelineSink` writes via the binding while [`AnalyticsEngineSink`](/docs/observability/analytics-engine) keeps running in parallel.
- Point historical/range tools at R2 SQL (always time-bounded on `__ingest_ts`); `tail_recent` stays on AE/Observability. Backend selection is a config flag.
- Optional `raw-payloads` Iceberg table so large scrape bodies never touch D1 — **storage only; capture methods untouched** (honoring the browser-render guardrail).

```mermaid
flowchart TD
  code["pipeline code"] -->|runPipeline()| logger["ObsLogger"]
  logger --> console["console.* (Workers Observability)"]
  logger --> ae["AnalyticsEngineSink (env.OBS)"]
  logger -. PR5 .-> r2["PipelineSink → R2 Data Catalog"]
  code -->|finally{}| runs["pipeline_runs (D1)"]
  runs --> svc["observability service (PR3)"]
  ae --> svc
  r2 -. PR5 .-> svc
  svc --> rest["REST /api/obs/* (PR3)"]
  svc --> mcp["MCP tools (PR3)"]
```

## Guardrail across every pipeline PR

Browser-render + multi-method scraping is a hard guardrail. Each PR must keep a `/intake` role yielding the full bullet set + HTML + markdown + narrative via the BR-first path and the Greenhouse-API fallback. PR5 moves raw scrape *storage* to R2 but never removes a *capture* method.

## Reference

- `docs/0014_pipeline/observability_and_r2_pipeline/implementation_plan_v2.md` — the grounded implementation plan (incl. §G1 guardrail).
- `docs/0014_pipeline/observability_and_r2_pipeline/walkthrough.md` — the full incident evidence.
