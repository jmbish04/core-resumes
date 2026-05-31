/**
 * @file Structured, non-blocking observability logger.
 *
 * Replaces the old D1 log firehose (`src/backend/lib/logger.ts` used to
 * `await db.insert(logs)` + an RPC to a Durable Object on *every* log line —
 * two cross-network round-trips per call, which overloaded D1).
 *
 * Design rules (do not regress):
 * - The sink write is **fire-and-forget** — never awaited in the business path.
 * - Every log line is `console.*`-mirrored as a single JSON object; Workers
 *   Observability captures that for free (this is what made the incident
 *   diagnosable).
 * - The WebSocket progress RPC is **not** emitted per log line — only behind an
 *   explicit `logger.progress()` call.
 * - Logging never throws into business logic. All sink errors are swallowed.
 */

import type { PipelineErrorType } from "@/backend/db/schemas/pipeline/pipeline-runs";

export type LogLevel = "info" | "warn" | "error" | "debug";

/** The canonical structured log record emitted to every sink. */
export interface LogEvent {
  /** ISO-8601 timestamp. */
  ts: string;
  level: LogLevel;
  /** Logical service/component name (e.g. "freelance-scanner", "intake"). */
  service: string;
  /** Pipeline identifier when this log is part of a tracked run. */
  pipeline?: string;
  /** Correlates the log with a `pipeline_runs` row. */
  run_id?: string;
  message: string;
  /** Normalized error classification, set automatically for error logs. */
  error_type?: PipelineErrorType;
  /** Optional wall-clock measurement for this event. */
  duration_ms?: number;
  /** Free-form structured context (redacted of secrets by the caller). */
  metadata?: Record<string, unknown>;
}

const MAX_BLOB_BYTES = 5000;

function truncate(value: string, max = MAX_BLOB_BYTES): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * Map an unknown thrown value to a normalized `error_type` + message.
 * Heuristic, but stable enough to rank errors in `get_error_summary`.
 */
export function normalizeError(e: unknown): { error_type: PipelineErrorType; message: string } {
  const message = e instanceof Error ? e.message : String(e);
  const lower = message.toLowerCase();

  let error_type: PipelineErrorType = "UNKNOWN";
  if (/\bd1\b|sqlite|database is locked|too many|d1_error|overload/.test(lower)) {
    error_type = "D1_OVERLOAD";
  } else if (/timeout|timed out|deadline|aborted/.test(lower)) {
    error_type = "TIMEOUT";
  } else if (/unreachable|econnrefused|enotfound|dns|connection refused|fetch failed/.test(lower)) {
    error_type = "DEST_UNAVAILABLE";
  } else if (/json|parse|unexpected token|invalid|malformed/.test(lower)) {
    error_type = "PARSE_ERROR";
  } else if (/unauthorized|forbidden|401|403|api key|invalid key|auth/.test(lower)) {
    error_type = "AUTH";
  } else if (/\b4\d\d\b/.test(lower)) {
    error_type = "UPSTREAM_4XX";
  } else if (/\b5\d\d\b/.test(lower)) {
    error_type = "UPSTREAM_5XX";
  }

  return { error_type, message };
}

// ---------------------------------------------------------------------------
// Sinks
// ---------------------------------------------------------------------------

/** A destination for `LogEvent`s. Implementations MUST never throw. */
export interface LogSink {
  write(event: LogEvent): void;
}

/** Console sink — emits one JSON line per event (captured by Workers Observability). */
export class ConsoleSink implements LogSink {
  write(event: LogEvent): void {
    const line = JSON.stringify(event);
    switch (event.level) {
      case "error":
        console.error(line);
        break;
      case "warn":
        console.warn(line);
        break;
      case "debug":
        console.debug(line);
        break;
      default:
        console.log(line);
    }
  }
}

/** Analytics Engine sink — fire-and-forget `writeDataPoint`, live-tailable. */
export class AnalyticsEngineSink implements LogSink {
  constructor(private dataset: AnalyticsEngineDataset | undefined) {}

  write(event: LogEvent): void {
    if (!this.dataset) return;
    try {
      this.dataset.writeDataPoint({
        // AE: max 20 blobs, 5KB total; values must be strings.
        blobs: [
          event.level,
          event.service,
          event.pipeline ?? "",
          event.run_id ?? "",
          event.error_type ?? "",
          truncate(event.message),
          event.metadata ? truncate(JSON.stringify(event.metadata)) : "",
        ],
        doubles: [typeof event.duration_ms === "number" ? event.duration_ms : 0],
        // AE allows a single index (≤96 bytes) — partition by pipeline.
        indexes: [truncate(event.pipeline ?? event.service, 96)],
      });
    } catch {
      // Never let telemetry break the business path.
    }
  }
}

/** Fans an event out to multiple sinks, isolating failures. */
export class MultiSink implements LogSink {
  constructor(private sinks: LogSink[]) {}
  write(event: LogEvent): void {
    for (const sink of this.sinks) {
      try {
        sink.write(event);
      } catch {
        // isolate sink failures
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export interface LoggerContext {
  service?: string;
  pipeline?: string;
  run_id?: string;
}

/**
 * Structured logger. Methods are synchronous and fire-and-forget — they never
 * block or throw into business logic.
 */
export class ObsLogger {
  constructor(
    private sink: LogSink,
    private ctx: LoggerContext = {},
  ) {}

  /** Build the default sink chain (console + Analytics Engine) from env. */
  static fromEnv(env: Env, ctx: LoggerContext = {}): ObsLogger {
    const sinks: LogSink[] = [new ConsoleSink()];
    const dataset = (env as unknown as { OBS?: AnalyticsEngineDataset }).OBS;
    if (dataset) sinks.push(new AnalyticsEngineSink(dataset));
    return new ObsLogger(new MultiSink(sinks), { service: "core-resumes", ...ctx });
  }

  /** Derive a child logger that auto-stamps pipeline + run_id on every event. */
  forRun(pipeline: string, run_id: string): ObsLogger {
    return new ObsLogger(this.sink, { ...this.ctx, pipeline, run_id });
  }

  /** Derive a child logger scoped to a named service/component. */
  forService(service: string): ObsLogger {
    return new ObsLogger(this.sink, { ...this.ctx, service });
  }

  private emit(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    const event: LogEvent = {
      ts: new Date().toISOString(),
      level,
      service: this.ctx.service ?? "core-resumes",
      pipeline: this.ctx.pipeline,
      run_id: this.ctx.run_id,
      message,
      metadata,
    };
    if (typeof metadata?.duration_ms === "number") event.duration_ms = metadata.duration_ms;
    this.sink.write(event);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.emit("info", message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.emit("warn", message, metadata);
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.emit("debug", message, metadata);
  }

  /**
   * Log an error, auto-classifying `error_type`. Accepts a thrown value or a
   * plain message string.
   */
  error(message: string, errOrMeta?: unknown, metadata?: Record<string, unknown>): void {
    let meta = metadata;
    let error_type: PipelineErrorType | undefined;
    let finalMessage = message;

    if (errOrMeta instanceof Error || (errOrMeta && typeof errOrMeta !== "object")) {
      const norm = normalizeError(errOrMeta);
      error_type = norm.error_type;
      finalMessage = `${message}: ${norm.message}`;
    } else if (errOrMeta && typeof errOrMeta === "object") {
      meta = errOrMeta as Record<string, unknown>;
    }

    const event: LogEvent = {
      ts: new Date().toISOString(),
      level: "error",
      service: this.ctx.service ?? "core-resumes",
      pipeline: this.ctx.pipeline,
      run_id: this.ctx.run_id,
      message: finalMessage,
      error_type,
      metadata: meta,
    };
    this.sink.write(event);
  }
}
