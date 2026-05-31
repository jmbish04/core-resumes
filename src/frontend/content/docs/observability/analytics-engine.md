# Analytics Engine Sink

Last updated: May 29, 2026

`AnalyticsEngineSink` (`src/backend/lib/observability/logger.ts`) is the live-tailable [sink](/docs/observability/structured-logger#sinks) that writes every `LogEvent` to Cloudflare Analytics Engine via the `OBS` binding. It is the **fire-and-forget** half of the default sink chain — `console` captures logs for free, Analytics Engine makes them queryable and live-tailable without the D1 write pressure that caused the original incident.

## The `OBS` binding

Analytics Engine is bound in `wrangler.jsonc`:

```jsonc
"analytics_engine_datasets": [
  { "binding": "OBS", "dataset": "core_resumes_obs" },
],
```

After adding the binding, `pnpm run types` regenerates `worker-configuration.d.ts` so `env.OBS` is typed as `AnalyticsEngineDataset`. The sink reads the binding defensively — if `OBS` is absent (local dev, tests), it **no-ops gracefully** and logging continues on the console sink alone.

## The `writeDataPoint` field mapping

Analytics Engine stores each event as a row of `blobs` (strings), `doubles` (numbers), and a single `index` (the partition key). The sink maps `LogEvent` like this:

```ts
write(event: LogEvent): void {
  if (!this.dataset) return;
  try {
    this.dataset.writeDataPoint({
      blobs: [
        event.level,                                    // blob1
        event.service,                                  // blob2
        event.pipeline ?? "",                           // blob3
        event.run_id ?? "",                             // blob4
        event.error_type ?? "",                         // blob5
        truncate(event.message),                        // blob6
        event.metadata ? truncate(JSON.stringify(event.metadata)) : "", // blob7
      ],
      doubles: [typeof event.duration_ms === "number" ? event.duration_ms : 0], // double1
      indexes: [truncate(event.pipeline ?? event.service, 96)],                  // partition
    });
  } catch {
    // Never let telemetry break the business path.
  }
}
```

### Field map

| Slot | Field | Notes |
| --- | --- | --- |
| `blob1` | `level` | `info` / `warn` / `error` / `debug` |
| `blob2` | `service` | logical component name |
| `blob3` | `pipeline` | empty string when not in a tracked run |
| `blob4` | `run_id` | correlates with `pipeline_runs` |
| `blob5` | `error_type` | empty unless it's a classified error |
| `blob6` | `message` | truncated to the 5 KB blob budget |
| `blob7` | `metadata` | JSON-stringified + truncated |
| `double1` | `duration_ms` | `0` when not measured |
| `index` | `pipeline ?? service` | partition key, capped at 96 bytes |

## Constraints honored

Analytics Engine imposes hard limits the sink respects:

- **Blob budget: ≤ 20 blobs, 5 KB total per data point.** `truncate()` caps `message` and `metadata` at `MAX_BLOB_BYTES` (5000) each, appending `…` when clipped, so a large metadata blob can never blow the row budget or get the write rejected.
- **Single index, ≤ 96 bytes.** Only one `index` is allowed; the sink partitions by `pipeline` (falling back to `service`), truncated to 96 bytes. Partitioning by pipeline is what makes per-pipeline live tails and time-bounded queries cheap.
- **Numbers go in `doubles`.** `duration_ms` is the one numeric we currently track; it defaults to `0` so the column is always present for aggregation.

## Querying

Because each event is a structured row, you tail and aggregate it with the Analytics Engine SQL API — filter `blob3` (`pipeline`), `blob1` (`level`), or `blob5` (`error_type`); aggregate `double1` (`duration_ms`). This is the **live** path: low-latency, last-N-days retention. The **historical** path (R2 Data Catalog + R2 SQL) arrives in PR5 — see the [Roadmap](/docs/observability/roadmap). The PR3 `tail_recent` tool reads this AE/Observability path; range/historical tools point at R2 SQL once it lands.

## The fire-and-forget guarantee

The entire `writeDataPoint` call is wrapped in `try/catch` with an empty handler. This is deliberate and load-bearing: **telemetry can never break the business path.** If Analytics Engine is unavailable, rate-limited, or the binding is missing, the catch swallows it and the pipeline keeps running. Combined with `MultiSink`'s per-sink isolation, one failing sink never starves the others — and the `console` mirror is always there as the floor.

## File reference

- `src/backend/lib/observability/logger.ts` — `AnalyticsEngineSink`, `truncate()`, `MAX_BLOB_BYTES`, and the `fromEnv` chain that adds it when `OBS` is bound.
- `wrangler.jsonc` — the `analytics_engine_datasets` / `OBS` binding.
- `worker-configuration.d.ts` — the generated `AnalyticsEngineDataset` type for `env.OBS` (never hand-edited).
