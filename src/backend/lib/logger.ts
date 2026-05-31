/**
 * @file Backward-compatible `Logger` facade over the non-blocking structured
 * logger (`src/backend/lib/observability/logger.ts`).
 *
 * The public API (`new Logger(env)` + `await logger.info/warn/error/debug`) is
 * preserved so the ~40 existing call sites are untouched, but the internals no
 * longer write the D1 `logs` firehose or fan out a Durable Object RPC on every
 * line. Instead each call is mirrored to `console` (captured by Workers
 * Observability) and fire-and-forget to Analytics Engine.
 *
 * Live WebSocket progress is now **opt-in** via `logger.progress(...)` rather
 * than implicit on every log line — no existing caller relied on the implicit
 * per-line broadcast.
 */

import { getAgentByName } from "agents";

import { ObsLogger } from "./observability/logger";

export interface ProgressPayload {
  status?: string;
  current?: number;
  total?: number;
  message?: string;
}

export class Logger {
  private obs: ObsLogger;

  constructor(private env: Env) {
    this.obs = ObsLogger.fromEnv(env);
  }

  public async info(message: string, metadata?: Record<string, unknown>): Promise<void> {
    this.obs.info(message, metadata);
  }

  public async warn(message: string, metadata?: Record<string, unknown>): Promise<void> {
    this.obs.warn(message, metadata);
  }

  public async error(message: string, metadata?: Record<string, unknown>): Promise<void> {
    this.obs.error(message, metadata);
  }

  public async debug(message: string, metadata?: Record<string, unknown>): Promise<void> {
    this.obs.debug(message, metadata);
  }

  /**
   * Explicitly broadcast a live progress event to the sync-broadcast Durable
   * Object. Use this for UI progress bars — it is NOT emitted on every log
   * line (that was the per-line DO RPC firehose this refactor removed).
   */
  public async progress(payload: ProgressPayload): Promise<void> {
    if (!this.env.SYNC_BROADCAST_AGENT) return;
    try {
      const agent = (await getAgentByName(this.env.SYNC_BROADCAST_AGENT as any, "global")) as any;
      await agent.reportProgress({
        status: payload.status ?? "processing",
        current: payload.current,
        total: payload.total,
        message: payload.message,
      });
    } catch (wsError) {
      console.error(
        `[LOGGER_WS_ERROR] Failed to broadcast progress over WebSocket: ${
          wsError instanceof Error ? wsError.message : String(wsError)
        }`,
      );
    }
  }
}
