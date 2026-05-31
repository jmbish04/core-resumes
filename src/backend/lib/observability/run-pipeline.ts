/**
 * @file `runPipeline()` — the single wrapper every pipeline runs inside.
 *
 * It guarantees a terminal `pipeline_runs` row (even when the work throws),
 * hands the body a child logger stamped with `pipeline`/`run_id`, and provides
 * lightweight counters that roll up into `attempted/succeeded/failed`,
 * `error_summary` (ranked error_types) and `source_breakdown`.
 *
 * Cost: exactly **two** D1 writes per run (insert `running`, update terminal) —
 * not per-log. This is the abstraction that turns "N failed / no trace" into an
 * inspectable timeline.
 */

import { eq } from "drizzle-orm";

import { getDb } from "@/backend/db";
import {
  pipelineRuns,
  type PipelineErrorSummary,
  type PipelineErrorType,
  type PipelineRunTrigger,
  type PipelineSourceBreakdown,
} from "@/backend/db/schemas/pipeline/pipeline-runs";

import { normalizeError, ObsLogger } from "./logger";

/** Counter + logging surface handed to the pipeline body. */
export interface RunHandle {
  readonly runId: string;
  /** Child logger auto-stamped with this run's pipeline + run_id. */
  readonly logger: ObsLogger;
  /** Declare how many units this run intends to process (boards, listings, …). */
  setAttempted(n: number): void;
  /** Record one successful unit, optionally attributed to a source. */
  recordSuccess(source?: string): void;
  /** Record one failed unit; auto-classifies and ranks the error. */
  recordFailure(error: unknown, source?: string): void;
  /** Merge free-form metadata onto the terminal run row. */
  setMetadata(meta: Record<string, unknown>): void;
}

class RunTracker implements RunHandle {
  attempted = 0;
  succeeded = 0;
  failed = 0;
  readonly errorSummary: PipelineErrorSummary = {};
  readonly sourceBreakdown: PipelineSourceBreakdown = {};
  metadata: Record<string, unknown> = {};

  constructor(
    readonly runId: string,
    readonly logger: ObsLogger,
  ) {}

  private bumpSource(source: string, key: "attempted" | "succeeded" | "failed"): void {
    const row = (this.sourceBreakdown[source] ??= { attempted: 0, succeeded: 0, failed: 0 });
    row[key] += 1;
  }

  setAttempted(n: number): void {
    this.attempted = n;
  }

  recordSuccess(source?: string): void {
    this.succeeded += 1;
    if (source) {
      this.bumpSource(source, "attempted");
      this.bumpSource(source, "succeeded");
    }
  }

  recordFailure(error: unknown, source?: string): void {
    this.failed += 1;
    const { error_type, message } = normalizeError(error);
    this.tallyError(error_type, message);
    if (source) {
      this.bumpSource(source, "attempted");
      this.bumpSource(source, "failed");
    }
    this.logger.error("unit failed", error, source ? { source } : undefined);
  }

  private tallyError(error_type: PipelineErrorType, sample: string): void {
    const bucket = (this.errorSummary[error_type] ??= { count: 0, sample });
    bucket.count += 1;
  }

  setMetadata(meta: Record<string, unknown>): void {
    this.metadata = { ...this.metadata, ...meta };
  }
}

export interface RunPipelineOptions {
  trigger?: PipelineRunTrigger;
  metadata?: Record<string, unknown>;
}

/**
 * Run `fn` as a tracked pipeline execution.
 *
 * @returns whatever `fn` returns. Re-throws on failure **after** persisting a
 *   terminal `failed` row, so callers (and cron handlers) still see the error.
 */
export async function runPipeline<T>(
  env: Env,
  pipeline: string,
  fn: (run: RunHandle) => Promise<T>,
  options: RunPipelineOptions = {},
): Promise<T> {
  const db = getDb(env);
  const runId = crypto.randomUUID();
  const trigger = options.trigger ?? "manual";
  const startedAt = new Date();

  const logger = ObsLogger.fromEnv(env).forRun(pipeline, runId);
  const tracker = new RunTracker(runId, logger);
  if (options.metadata) tracker.setMetadata(options.metadata);

  // Write 1: claim the run as "running".
  try {
    await db.insert(pipelineRuns).values({
      runId,
      pipeline,
      trigger,
      status: "running",
      startedAt,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      metadata: tracker.metadata,
    });
  } catch (e) {
    // If we can't even claim the run, log and continue — never block the work.
    logger.error("failed to insert running pipeline_runs row", e);
  }

  logger.info("pipeline started", { trigger });

  let threw: unknown;
  let result: T | undefined;
  try {
    result = await fn(tracker);
  } catch (e) {
    threw = e;
    tracker.recordFailure(e);
  } finally {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const status: "completed" | "failed" = threw || tracker.failed > 0 ? "failed" : "completed";
    const errorSummary = Object.keys(tracker.errorSummary).length ? tracker.errorSummary : null;
    const sourceBreakdown = Object.keys(tracker.sourceBreakdown).length
      ? tracker.sourceBreakdown
      : null;

    // Write 2: persist the terminal status. Guaranteed to run via finally{}.
    try {
      await db
        .update(pipelineRuns)
        .set({
          status,
          finishedAt,
          durationMs,
          attempted: Math.max(tracker.attempted, tracker.succeeded + tracker.failed),
          succeeded: tracker.succeeded,
          failed: tracker.failed,
          errorSummary,
          sourceBreakdown,
          metadata: tracker.metadata,
        })
        .where(eq(pipelineRuns.runId, runId));
    } catch (e) {
      logger.error("failed to persist terminal pipeline_runs row", e);
    }

    // Single summary LogEvent so the firehose has the run rollup.
    logger.info("pipeline finished", {
      status,
      duration_ms: durationMs,
      attempted: Math.max(tracker.attempted, tracker.succeeded + tracker.failed),
      succeeded: tracker.succeeded,
      failed: tracker.failed,
      error_types: errorSummary ? Object.keys(errorSummary) : [],
    });
  }

  if (threw) throw threw;
  return result as T;
}
