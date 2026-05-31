---
title: "Observability & Pipeline Runs"
date_last_updated: "2026-05-31"
---

# Observability & Pipeline Runs

Last updated: May 29, 2026

The observability subsystem gives every background pipeline a **guaranteed, inspectable run record** and replaces the old D1 log firehose with a **non-blocking, sink-pluggable logger**. It exists to answer three questions that the system previously could not:

1. _Which pipelines ran, when, and did they succeed or fail?_
2. _When something failed, **what kind** of failure was it, and how often?_
3. _Why was D1 overloaded under load?_

This section documents the foundation (PR1) that ships these capabilities, the code that implements it, and the roadmap for the REST + MCP troubleshooting tools built on top of it.

## The incident that motivated this

Three production problems were diagnosed (full evidence in `docs/0014_pipeline/observability_and_r2_pipeline/walkthrough.md`):

| Symptom | Root cause | Fixed by |
| --- | --- | --- |
| **D1 overloaded under any high-volume pipeline.** | `src/backend/lib/logger.ts` did `await db.insert(logs)` **plus** a Durable Object RPC on **every** `info/warn/error/debug` call — two cross-network round-trips per log line. | [Structured Logger](/docs/observability/structured-logger) — fire-and-forget sinks, D1 `logs` write removed. |
| **Freelance scans "go dark".** | The failure path persisted nothing — only the success path called `recordScanRun`. A RapidAPI failure inside `ctx.waitUntil(...)` vanished with no trace. | [`runPipeline()`](/docs/observability/run-pipeline) guarantees a terminal row (PR2 wires it into the scanner). |
| **"100 failed / 0 scraped" with no detail.** | `JobScannerAgent` kept run state in memory only; failures were discarded with no `error_type` and no row. | [`pipeline_runs`](/docs/observability/pipeline-runs) + [Error Classification](/docs/observability/error-classification). |

> The logger **already** swallowed D1 errors, so it never crashed the pipeline. The damage was **write pressure and latency**, not crashes — which is why the fix is framed as "never block / never await the sink," not "never throw."

## What shipped in PR1

PR1 is the **foundation**: it is the highest-leverage, lowest-risk change and unblocks everything else.

- A **structured, non-blocking logger** (`ObsLogger`) that emits a typed `LogEvent` to pluggable sinks. The default chain is `console` (captured free by Workers Observability) + **Analytics Engine** (live-tailable). See [Structured Logger](/docs/observability/structured-logger).
- A first-class **`pipeline_runs`** D1 table — the cross-pipeline run-status index. See [Pipeline Runs Table](/docs/observability/pipeline-runs).
- A **`runPipeline()`** wrapper that claims a `running` row, hands the body a child logger + counters, and a `finally{}` block guarantees a terminal status — even on throw. See [runPipeline Wrapper](/docs/observability/run-pipeline).
- The legacy `Logger` facade was **rewritten to delegate** to `ObsLogger`. Its public API is unchanged, so all ~40 call sites are untouched, but the D1 `logs` firehose and the per-line DO RPC are gone. See [Rollout & Verification](/docs/observability/rollout).

## Target architecture

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

The live path (console + Analytics Engine) ships in PR1. The historical path (R2 Data Catalog + R2 SQL) and the twin REST/MCP interfaces follow in later PRs — see the [Roadmap](/docs/observability/roadmap).

## Pages in this section

- [Structured Logger](/docs/observability/structured-logger) — `ObsLogger`, `LogEvent`, the sink interface, and the fire-and-forget contract.
- [runPipeline Wrapper](/docs/observability/run-pipeline) — the run lifecycle, `RunHandle` counters, and the two-write model.
- [Pipeline Runs Table](/docs/observability/pipeline-runs) — the `pipeline_runs` schema, columns, indexes, and how it relates to the existing per-domain run tables.
- [Error Classification](/docs/observability/error-classification) — the `error_type` taxonomy and the `normalizeError()` heuristics.
- [Analytics Engine Sink](/docs/observability/analytics-engine) — the `OBS` binding and the `writeDataPoint` field mapping.
- [Rollout & Verification](/docs/observability/rollout) — what changed in `logger.ts`, the migration, and how to verify D1 relief.
- [Roadmap](/docs/observability/roadmap) — PR2–PR5: instrumenting the dark spots, the obs service, and the R2 SQL backend.

## Design guardrails

- **Logging never blocks or throws** in the business path. Sinks are fire-and-forget; all sink errors are swallowed.
- **Never log secrets, cookies, tokens, or PII** — callers redact before passing metadata.
- **Add, don't rename.** The `Logger` facade keeps its public API; existing run tables (`session_runs`, `freelance_scan_runs`, `api_company_sync_stats`) stay as the detail layer beneath `pipeline_runs`.
- **Browser-render + multi-method scraping is preserved** — the observability work moves raw scrape *storage* to R2 (PR5) but never removes a scrape *capture* method. See `docs/0014_pipeline/observability_and_r2_pipeline/implementation_plan_v2.md` §G1.
