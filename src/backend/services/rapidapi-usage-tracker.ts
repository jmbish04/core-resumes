/**
 * @fileoverview Universal RapidAPI usage tracker.
 *
 * Provides pre-flight budget checking and post-call logging for ALL RapidAPI
 * calls across the ecosystem. Configuration is stored in D1 `global_config`
 * under the key "rapidapi_limits".
 *
 * Default config (BASIC plan):
 *   { monthly_request_limit: 50, monthly_bytes_limit: null, warn_threshold_pct: 80 }
 */

import { eq, sql, and, gte } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { rapidapiUsageLog, globalConfig } from "@/backend/db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RapidApiLimitsConfig {
  monthly_request_limit: number;
  monthly_bytes_limit: number | null;
  warn_threshold_pct: number;
}

export interface BudgetCheckResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
  warnThresholdReached: boolean;
  currentMonth: string;
}

export interface UsageLogEntry {
  apiHost: string;
  apiEndpoint: string;
  requestParams?: Record<string, unknown>;
  responseStatus: number;
  responseBytes?: number;
  durationMs?: number;
  error?: string;
}

export interface UsageSummaryRow {
  apiHost: string;
  apiEndpoint: string;
  totalCalls: number;
  totalBytes: number;
  avgDurationMs: number;
  errorCount: number;
}

export interface MonthlyUsageSummary {
  year: number;
  month: number;
  totalCalls: number;
  totalBytes: number;
  limit: number;
  remaining: number;
  byEndpoint: UsageSummaryRow[];
}

export interface CronScheduleResult {
  shouldRun: boolean;
  remaining: number;
  used: number;
  limit: number;
  remainingCronTicks: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIG_KEY = "rapidapi_limits";

const DEFAULT_LIMITS: RapidApiLimitsConfig = {
  monthly_request_limit: 50,
  monthly_bytes_limit: 10240 * 1024 * 1024, // 10240 MB in bytes
  warn_threshold_pct: 80,
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class RapidApiUsageTracker {
  constructor(private env: Env) {}

  /**
   * Read the configured limits from D1 global_config, falling back to defaults.
   */
  async getLimits(): Promise<RapidApiLimitsConfig> {
    try {
      const db = getDb(this.env);
      const [row] = await db
        .select({ value: globalConfig.value })
        .from(globalConfig)
        .where(eq(globalConfig.key, CONFIG_KEY))
        .limit(1);

      if (row?.value && typeof row.value === "object") {
        const cfg = row.value as Partial<RapidApiLimitsConfig>;
        return {
          monthly_request_limit:
            cfg.monthly_request_limit ?? DEFAULT_LIMITS.monthly_request_limit,
          monthly_bytes_limit:
            cfg.monthly_bytes_limit !== undefined
              ? cfg.monthly_bytes_limit
              : DEFAULT_LIMITS.monthly_bytes_limit,
          warn_threshold_pct:
            cfg.warn_threshold_pct ?? DEFAULT_LIMITS.warn_threshold_pct,
        };
      }
    } catch (e) {
      console.warn("[RapidApiUsageTracker] Failed to read limits config:", e);
    }
    return DEFAULT_LIMITS;
  }

  /**
   * Check if the current month's budget allows another RapidAPI call.
   *
   * Counts rows in `rapidapi_usage_log` where timestamp is within the current
   * calendar month and response_status < 500 (server-side failures on our end
   * don't count against the external API budget).
   * Also verifies that the hourly limit (1000 requests/hour) and monthly bandwidth
   * limits are respected.
   */
  async checkBudget(): Promise<BudgetCheckResult> {
    const db = getDb(this.env);
    const limits = await this.getLimits();
    const { start, label } = getCurrentMonthRange();

    // 1. Check monthly request count and bytes bandwidth
    const [result] = await db
      .select({
        count: sql<number>`count(*)`.as("count"),
        totalBytes: sql<number>`coalesce(sum(${rapidapiUsageLog.responseBytes}), 0)`.as("total_bytes"),
      })
      .from(rapidapiUsageLog)
      .where(
        and(
          gte(rapidapiUsageLog.timestamp, start),
          sql`${rapidapiUsageLog.responseStatus} < 500`,
        ),
      );

    const used = result?.count ?? 0;
    const limit = limits.monthly_request_limit;
    const remaining = Math.max(0, limit - used);

    const usedBytes = result?.totalBytes ?? 0;
    const bytesLimit = limits.monthly_bytes_limit;
    const bytesRemaining = bytesLimit ? Math.max(0, bytesLimit - usedBytes) : null;

    // 2. Check hourly limit (1000 requests/hour hard limit)
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    const [hourlyResult] = await db
      .select({
        count: sql<number>`count(*)`.as("count"),
      })
      .from(rapidapiUsageLog)
      .where(
        and(
          gte(rapidapiUsageLog.timestamp, oneHourAgo),
          sql`${rapidapiUsageLog.responseStatus} < 500`,
        ),
      );
    const hourlyUsed = hourlyResult?.count ?? 0;
    const hourlyAllowed = hourlyUsed < 1000;

    const warnThresholdReached =
      used >= Math.floor(limit * (limits.warn_threshold_pct / 100)) ||
      (bytesLimit ? usedBytes >= Math.floor(bytesLimit * (limits.warn_threshold_pct / 100)) : false);

    const allowed = remaining > 0 && 
                    (bytesRemaining === null || bytesRemaining > 0) && 
                    hourlyAllowed;

    return {
      allowed,
      used,
      limit,
      remaining,
      warnThresholdReached,
      currentMonth: label,
    };
  }

  /**
   * Log a completed RapidAPI call to D1.
   */
  async logCall(entry: UsageLogEntry): Promise<void> {
    try {
      const db = getDb(this.env);
      await db.insert(rapidapiUsageLog).values({
        apiHost: entry.apiHost,
        apiEndpoint: entry.apiEndpoint,
        requestParams: entry.requestParams ?? null,
        responseStatus: entry.responseStatus,
        responseBytes: entry.responseBytes ?? null,
        durationMs: entry.durationMs ?? null,
        error: entry.error ?? null,
      });
    } catch (e) {
      // Usage logging should never block the main call path
      console.error("[RapidApiUsageTracker] Failed to log call:", e);
    }
  }

  /**
   * Get a per-endpoint usage summary for a given month.
   */
  async getUsageSummary(year: number, month: number): Promise<MonthlyUsageSummary> {
    const db = getDb(this.env);
    const limits = await this.getLimits();
    const { start, end } = getMonthRange(year, month);

    // Per-endpoint breakdown
    const rows = await db
      .select({
        apiHost: rapidapiUsageLog.apiHost,
        apiEndpoint: rapidapiUsageLog.apiEndpoint,
        totalCalls: sql<number>`count(*)`.as("total_calls"),
        totalBytes: sql<number>`coalesce(sum(${rapidapiUsageLog.responseBytes}), 0)`.as(
          "total_bytes",
        ),
        avgDurationMs: sql<number>`coalesce(avg(${rapidapiUsageLog.durationMs}), 0)`.as(
          "avg_duration_ms",
        ),
        errorCount: sql<number>`sum(case when ${rapidapiUsageLog.error} is not null then 1 else 0 end)`.as(
          "error_count",
        ),
      })
      .from(rapidapiUsageLog)
      .where(
        and(
          gte(rapidapiUsageLog.timestamp, start),
          sql`${rapidapiUsageLog.timestamp} < ${end}`,
        ),
      )
      .groupBy(rapidapiUsageLog.apiHost, rapidapiUsageLog.apiEndpoint)
      .orderBy(sql`total_calls DESC`);

    const totalCalls = rows.reduce((sum, r) => sum + r.totalCalls, 0);
    const totalBytes = rows.reduce((sum, r) => sum + r.totalBytes, 0);
    const budgetableCalls = rows.reduce((sum, r) => sum + r.totalCalls - r.errorCount, 0);
    const remaining = Math.max(0, limits.monthly_request_limit - budgetableCalls);

    return {
      year,
      month,
      totalCalls,
      totalBytes,
      limit: limits.monthly_request_limit,
      remaining,
      byEndpoint: rows,
    };
  }

  /**
   * Get detailed usage log rows for a given month, optionally filtered by API host.
   */
  async getUsageLog(
    year: number,
    month: number,
    apiHost?: string,
  ): Promise<(typeof rapidapiUsageLog.$inferSelect)[]> {
    const db = getDb(this.env);
    const { start, end } = getMonthRange(year, month);

    const conditions = [
      gte(rapidapiUsageLog.timestamp, start),
      sql`${rapidapiUsageLog.timestamp} < ${end}`,
    ];

    if (apiHost) {
      conditions.push(eq(rapidapiUsageLog.apiHost, apiHost));
    }

    return db
      .select()
      .from(rapidapiUsageLog)
      .where(and(...conditions))
      .orderBy(sql`${rapidapiUsageLog.timestamp} DESC`)
      .limit(200);
  }

  /**
   * Determine whether a RapidAPI method should execute on the current cron tick.
   *
   * Evenly spaces remaining calls across remaining cron invocations for the
   * rest of the month. Pass the cron expression so we know how many ticks
   * remain (e.g. `"0 *\/4 * * *"` = every 4 hours = 6/day).
   *
   * Example: 38 remaining calls, 120 remaining cron ticks -> run every ~3.16
   * ticks. On tick index 0, 3, 6, 9... -> shouldRun = true.
   *
   * @param cronExpression - the wrangler cron string driving this job
   */
  async shouldRunOnCron(cronExpression: string): Promise<CronScheduleResult> {
    const budget = await this.checkBudget();

    // No budget left -- never run
    if (!budget.allowed) {
      return {
        shouldRun: false,
        remaining: 0,
        used: budget.used,
        limit: budget.limit,
        remainingCronTicks: 0,
        reason: `Budget exhausted: ${budget.used}/${budget.limit} calls used in ${budget.currentMonth}`,
      };
    }

    const remaining = budget.remaining;
    const remainingTicks = getRemainingCronTicks(cronExpression);

    // More remaining calls than ticks -> always run (we're behind schedule)
    if (remaining >= remainingTicks) {
      return {
        shouldRun: true,
        remaining,
        used: budget.used,
        limit: budget.limit,
        remainingCronTicks: remainingTicks,
        reason: `Behind schedule: ${remaining} calls left but only ${remainingTicks} ticks -- running every tick`,
      };
    }

    // No ticks left in month but we have budget -- run now (last chance)
    if (remainingTicks <= 0) {
      return {
        shouldRun: true,
        remaining,
        used: budget.used,
        limit: budget.limit,
        remainingCronTicks: 0,
        reason: "No more cron ticks this month -- running now as last opportunity",
      };
    }

    // Calculate even spacing: run every N-th tick
    // interval = remainingTicks / remaining (e.g. 120 ticks / 38 calls = 3.16)
    const interval = remainingTicks / remaining;

    // Which tick index are we on within this month?
    const tickIndex = getCurrentTickIndex(cronExpression);

    // Use modular arithmetic: run when tickIndex aligns with the interval
    // floor(tickIndex / interval) changes -> that's a "run" boundary
    const currentSlot = Math.floor(tickIndex / interval);
    const previousSlot = Math.floor((tickIndex - 1) / interval);
    const shouldRun = tickIndex === 0 || currentSlot !== previousSlot;

    return {
      shouldRun,
      remaining,
      used: budget.used,
      limit: budget.limit,
      remainingCronTicks: remainingTicks,
      reason: shouldRun
        ? `Tick ${tickIndex}: slot boundary crossed (interval=${interval.toFixed(1)}) -- running`
        : `Tick ${tickIndex}: waiting (next run at interval boundary, spacing=${interval.toFixed(1)})`,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCurrentMonthRange(): { start: Date; label: string } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const label = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, label };
}

function getMonthRange(
  year: number,
  month: number,
): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

/**
 * Parse a simple hourly cron expression (`0 *\/N * * *`) into the number of
 * invocations per day. Supports the three patterns used in wrangler.jsonc:
 *   - `0 *\/4 * * *`  -> every 4h -> 6/day
 *   - `0 *\/6 * * *`  -> every 6h -> 4/day
 *   - `0 *\/12 * * *` -> every 12h -> 2/day
 */
function getCronTicksPerDay(cronExpression: string): number {
  const match = cronExpression.match(/^\d+\s+\*\/(\d+)\s+/);
  if (match) {
    const everyNHours = parseInt(match[1], 10);
    return Math.floor(24 / everyNHours);
  }
  // Fallback: assume hourly
  return 24;
}

/**
 * Calculate how many cron ticks remain in the current month for a given
 * cron expression, starting from right now.
 */
function getRemainingCronTicks(cronExpression: string): number {
  const now = new Date();
  const ticksPerDay = getCronTicksPerDay(cronExpression);
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const currentDay = now.getUTCDate(); // 1-indexed
  const currentHour = now.getUTCHours();

  // How many ticks remain TODAY (including the current one if it hasn't fired)
  const hoursPerTick = 24 / ticksPerDay;
  const ticksFiredToday = Math.floor(currentHour / hoursPerTick) + 1;
  const ticksRemainingToday = Math.max(0, ticksPerDay - ticksFiredToday);

  // Full days remaining after today
  const fullDaysRemaining = daysInMonth - currentDay;
  const ticksFromFullDays = fullDaysRemaining * ticksPerDay;

  return ticksRemainingToday + ticksFromFullDays;
}

/**
 * Calculate the 0-based tick index within the current month for a given cron.
 * Tick 0 = first invocation of the month (day 1, hour 0).
 */
function getCurrentTickIndex(cronExpression: string): number {
  const now = new Date();
  const ticksPerDay = getCronTicksPerDay(cronExpression);
  const currentDay = now.getUTCDate(); // 1-indexed
  const currentHour = now.getUTCHours();
  const hoursPerTick = 24 / ticksPerDay;

  const ticksFromPreviousDays = (currentDay - 1) * ticksPerDay;
  const ticksToday = Math.floor(currentHour / hoursPerTick);

  return ticksFromPreviousDays + ticksToday;
}
