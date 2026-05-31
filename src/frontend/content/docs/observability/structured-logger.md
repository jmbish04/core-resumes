# Structured Logger

Last updated: May 29, 2026

`ObsLogger` (`src/backend/lib/observability/logger.ts`) is the non-blocking, sink-pluggable logger that replaces the old D1 log firehose. Every log call produces a typed `LogEvent`, mirrors it to `console` as a single JSON line, and fires it to Analytics Engine — all **synchronously and fire-and-forget**, so the business path is never blocked on a network write.

## Why the old logger overloaded D1

The legacy `Logger.log()` did three things on **every** call, two of which crossed the network:

1. A `console.*` mirror (free — captured by Workers Observability).
2. `await db.insert(logs)` into the D1 `logs` table.
3. `await getAgentByName(SYNC_BROADCAST_AGENT).reportProgress(...)` — a Durable Object RPC.

Under any high-volume pipeline that meant **two cross-network round-trips per log line**. The D1 write pressure — not crashes — is what overloaded the database. `ObsLogger` keeps the free console mirror, drops the D1 write entirely, and makes the Analytics Engine write fire-and-forget.

## The `LogEvent` shape

`LogEvent` is the canonical structured record emitted to every sink:

```ts
export interface LogEvent {
  ts: string;            // ISO-8601 timestamp
  level: LogLevel;       // "info" | "warn" | "error" | "debug"
  service: string;       // component name, e.g. "freelance-scanner", "intake"
  pipeline?: string;     // set when part of a tracked run
  run_id?: string;       // correlates with a pipeline_runs row
  message: string;
  error_type?: PipelineErrorType;  // auto-set for error logs
  duration_ms?: number;  // optional wall-clock measurement
  metadata?: Record<string, unknown>;  // free-form, caller-redacted
}
```

`pipeline` and `run_id` are what make a scattered set of log lines reassemble into a **single run timeline** — the observability service (PR3) correlates them by `run_id`.

## Methods

`ObsLogger` methods are **synchronous** — they return `void`, not a `Promise`. They never block and never throw into business logic.

```ts
logger.info(message, metadata?);
logger.warn(message, metadata?);
logger.debug(message, metadata?);
logger.error(message, errOrMeta?, metadata?);
```

`error()` is overloaded: pass a thrown value as the second argument and it is auto-classified via [`normalizeError()`](/docs/observability/error-classification), folding the normalized message into the log line and stamping `error_type`:

```ts
try {
  await fetchUpwork();
} catch (e) {
  // error_type is inferred (e.g. "TIMEOUT") and attached to the LogEvent
  logger.error("upwork fetch failed", e, { platform: "upwork" });
}
```

If the second argument is a plain object instead of an error, it is treated as `metadata`.

## Context: `forRun` and `forService`

A bare `ObsLogger` stamps `service: "core-resumes"`. Derive child loggers that auto-stamp context on every event:

```ts
const base = ObsLogger.fromEnv(env);
const scoped = base.forService("freelance-scanner");
const runLogger = base.forRun("freelance-scan", runId); // stamps pipeline + run_id
```

`forRun()` is what [`runPipeline()`](/docs/observability/run-pipeline) hands to the pipeline body, so every line inside a run is automatically correlated.

## Sinks

A **sink** is a destination for `LogEvent`s. The contract is one method that **must never throw**:

```ts
export interface LogSink {
  write(event: LogEvent): void;
}
```

| Sink | Purpose |
| --- | --- |
| `ConsoleSink` | Emits one JSON line per event via `console.log/warn/error/debug`. Captured for free by Workers Observability — this is what made the incident diagnosable. |
| `AnalyticsEngineSink` | Fire-and-forget `env.OBS.writeDataPoint(...)`. Live-tailable. No-ops gracefully when the `OBS` binding is absent. See [Analytics Engine Sink](/docs/observability/analytics-engine). |
| `MultiSink` | Fans an event out to multiple sinks, isolating per-sink failures inside `try/catch`. |
| _`PipelineSink` (PR5)_ | _Writes to R2 Data Catalog for historical R2 SQL queries — not yet implemented._ |

### Building the default chain

`ObsLogger.fromEnv(env)` assembles the production sink chain — `console` always, plus Analytics Engine when `env.OBS` is bound:

```ts
static fromEnv(env: Env, ctx: LoggerContext = {}): ObsLogger {
  const sinks: LogSink[] = [new ConsoleSink()];
  const dataset = (env as unknown as { OBS?: AnalyticsEngineDataset }).OBS;
  if (dataset) sinks.push(new AnalyticsEngineSink(dataset));
  return new ObsLogger(new MultiSink(sinks), { service: "core-resumes", ...ctx });
}
```

The graceful `OBS`-absent fallback means local development and tests work with no Analytics Engine binding — they simply log to console.

## The fire-and-forget contract

This is the rule the whole subsystem depends on:

- Sink writes are **never awaited** in the business path.
- `AnalyticsEngineSink.write()` wraps `writeDataPoint` in `try/catch` and swallows errors — telemetry can never break the work.
- `MultiSink` isolates each sink so one failing sink cannot starve the others.

The result: logging cost is now a synchronous, in-process operation plus a fire-and-forget metric write, instead of two awaited network round-trips.

## The `Logger` facade

The legacy `Logger` class (`src/backend/lib/logger.ts`) was **rewritten to delegate** to `ObsLogger`, preserving its public `async info/warn/error/debug` signatures so the ~40 existing call sites compile unchanged. It also exposes an explicit `progress()` method for the live WebSocket broadcast, which is now **opt-in** rather than emitted on every log line. See [Rollout & Verification](/docs/observability/rollout).

## File reference

- `src/backend/lib/observability/logger.ts` — `ObsLogger`, `LogEvent`, `LogLevel`, `LogSink`, `ConsoleSink`, `AnalyticsEngineSink`, `MultiSink`, `normalizeError`, `LoggerContext`.
- `src/backend/lib/logger.ts` — the backward-compatible `Logger` facade + `progress()`.
- `src/backend/db/schemas/pipeline/pipeline-runs.ts` — `PipelineErrorType` (referenced by `LogEvent.error_type`).
