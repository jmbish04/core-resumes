/**
 * @fileoverview Cron handler for RapidAPI-backed salary data refresh.
 *
 * Runs on each cron tick and uses `shouldRunOnCron()` to evenly space
 * RapidAPI calls across the month within the configured budget.
 *
 * On each eligible tick, it pulls active roles from D1 and refreshes
 * salary data for ONE role at a time (round-robin via KV cursor),
 * calling both `/job-salary` and `/company-job-salary` endpoints.
 *
 * Results are persisted to the existing `market_salary_stats` and
 * `market_company_salaries` tables for the Salary Intelligence dashboard.
 */

import { eq, sql, desc } from "drizzle-orm";

import { getDb } from "@/backend/db";
import {
  roles,
  marketSalarySnapshots,
  marketSalaryStats,
  marketCompanySalaries,
  globalConfig,
} from "@/backend/db/schema";
import { RapidApiUsageTracker } from "@/backend/services/rapidapi-usage-tracker";
import type { CronScheduleResult } from "@/backend/services/rapidapi-usage-tracker";
import {
  JobSalaryDataService,
  RapidApiBudgetError,
} from "@/backend/services/job-salary-data";
import type {
  JobSalaryResponse,
  CompanyJobSalaryResponse,
} from "@/backend/services/job-salary-data";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KV_CURSOR_KEY = "rapidapi_salary_cron_cursor";

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export interface SalaryCronResult {
  skipped: boolean;
  schedule: CronScheduleResult;
  refreshed?: {
    roleId: string;
    jobTitle: string;
    companyName: string;
    location: string;
    jobSalaryCount: number;
    companySalaryCount: number;
  };
  error?: string;
}

/**
 * Called from the worker `scheduled()` handler on each cron tick.
 *
 * 1. Asks the tracker if we should run on this tick (`shouldRunOnCron`).
 * 2. If yes, picks the next active role (round-robin via KV cursor).
 * 3. Calls both salary endpoints for that role.
 * 4. Persists results to D1.
 */
export async function runSalaryCron(
  env: Env,
  cronExpression: string,
): Promise<SalaryCronResult> {
  const tracker = new RapidApiUsageTracker(env);
  const schedule = await tracker.shouldRunOnCron(cronExpression);

  if (!schedule.shouldRun) {
    console.log(
      `[cron:salary] Skipping tick -- ${schedule.reason}`,
    );
    return { skipped: true, schedule };
  }

  console.log(`[cron:salary] Running -- ${schedule.reason}`);

  try {
    const role = await pickNextRole(env);
    if (!role) {
      console.log("[cron:salary] No active roles to refresh");
      return { skipped: true, schedule };
    }

    const service = new JobSalaryDataService(env);
    const location = await getApplicantLocation(env);

    // Fetch job-level salary
    let jobSalaryResult: JobSalaryResponse | null = null;
    try {
      jobSalaryResult = await service.getJobSalary({
        job_title: role.jobTitle,
        location,
      });
    } catch (e) {
      if (e instanceof RapidApiBudgetError) throw e;
      console.error(`[cron:salary] job-salary failed for "${role.jobTitle}":`, e);
    }

    // Fetch company-specific salary (only if we have a company name)
    let companySalaryResult: CompanyJobSalaryResponse | null = null;
    if (role.companyName) {
      try {
        companySalaryResult = await service.getCompanyJobSalary({
          company_name: role.companyName,
          job_title: role.jobTitle,
          location,
        });
      } catch (e) {
        if (e instanceof RapidApiBudgetError) throw e;
        console.error(
          `[cron:salary] company-job-salary failed for "${role.companyName} / ${role.jobTitle}":`,
          e,
        );
      }
    }

    // Persist to D1
    const counts = await persistSalaryData(
      env,
      role,
      jobSalaryResult,
      companySalaryResult,
    );

    const result: SalaryCronResult = {
      skipped: false,
      schedule,
      refreshed: {
        roleId: role.id,
        jobTitle: role.jobTitle,
        companyName: role.companyName ?? "",
        location,
        jobSalaryCount: counts.jobSalaryCount,
        companySalaryCount: counts.companySalaryCount,
      },
    };

    console.log(
      `[cron:salary] Refreshed role #${role.id} "${role.jobTitle}" @ ${role.companyName} -- ` +
        `${counts.jobSalaryCount} job estimates, ${counts.companySalaryCount} company estimates`,
    );

    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cron:salary] Cron failed:", msg);
    return { skipped: false, schedule, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Role selection (round-robin via KV cursor)
// ---------------------------------------------------------------------------

interface RoleForRefresh {
  id: string;
  jobTitle: string;
  companyName: string | null;
}

async function pickNextRole(env: Env): Promise<RoleForRefresh | null> {
  const db = getDb(env);

  // Get active roles ordered by ID
  const activeRoles = await db
    .select({
      id: roles.id,
      jobTitle: roles.jobTitle,
      companyName: roles.companyName,
    })
    .from(roles)
    .where(
      sql`${roles.status} IN ('applied', 'interviewing', 'offered', 'saved', 'interested')`,
    )
    .orderBy(roles.id)
    .limit(100);

  if (activeRoles.length === 0) return null;

  // Read the cursor from KV (last role ID we refreshed)
  const lastRefreshedId = await env.KV.get(KV_CURSOR_KEY);

  // Pick the next role after the cursor, or wrap around to the first
  const nextRole = lastRefreshedId
    ? activeRoles.find((r) => r.id > lastRefreshedId) ?? activeRoles[0]
    : activeRoles[0];

  // Update cursor
  await env.KV.put(KV_CURSOR_KEY, nextRole.id);

  return nextRole;
}

// ---------------------------------------------------------------------------
// Applicant location from config
// ---------------------------------------------------------------------------

async function getApplicantLocation(env: Env): Promise<string> {
  try {
    const db = getDb(env);
    const [row] = await db
      .select({ value: globalConfig.value })
      .from(globalConfig)
      .where(eq(globalConfig.key, "applicant_profile"))
      .limit(1);

    const profile = row?.value as Record<string, unknown> | null;
    const loc = profile?.location as string | undefined;
    if (loc && loc.trim().length > 0) return loc.trim();
  } catch {
    // Fall through to default
  }
  return "San Francisco, CA";
}

// ---------------------------------------------------------------------------
// D1 persistence
// ---------------------------------------------------------------------------

async function persistSalaryData(
  env: Env,
  role: RoleForRefresh,
  jobSalary: JobSalaryResponse | null,
  companySalary: CompanyJobSalaryResponse | null,
): Promise<{ jobSalaryCount: number; companySalaryCount: number }> {
  const db = getDb(env);
  let jobSalaryCount = 0;
  let companySalaryCount = 0;

  // Create a snapshot for this refresh batch
  const [snapshot] = await db
    .insert(marketSalarySnapshots)
    .values({
      status: "success",
      metadata: {
        source: "rapidapi_cron",
        roleId: role.id,
        jobTitle: role.jobTitle,
        companyName: role.companyName,
      },
    })
    .returning({ id: marketSalarySnapshots.id });

  if (!snapshot) return { jobSalaryCount, companySalaryCount };

  // Persist job-level salary estimates
  if (jobSalary?.data?.length) {
    const rows = jobSalary.data.map((est) => ({
      snapshotId: snapshot.id,
      roleType: role.jobTitle.toLowerCase(),
      metricKey: "rapidapi_job_salary" as const,
      metricLabel: `${est.publisher_name} (${est.salary_period})`,
      p25: Math.round(est.min_salary),
      median: Math.round(est.median_salary),
      p75: Math.round(est.max_salary),
      sampleSize: 1,
    }));

    await db.insert(marketSalaryStats).values(rows);
    jobSalaryCount = rows.length;
  }

  // Persist company-specific salary estimates
  if (companySalary?.data?.length) {
    const rows = companySalary.data.map((est) => ({
      snapshotId: snapshot.id,
      companyName: (est.company_name || role.companyName || "").toLowerCase(),
      jobTitle: role.jobTitle.toLowerCase(),
      seniority: "mid" as const,
      p25: Math.round(est.min_salary),
      median: Math.round(est.median_salary),
      p75: Math.round(est.max_salary),
      sampleSize: 1,
    }));

    await db.insert(marketCompanySalaries).values(rows);
    companySalaryCount = rows.length;
  }

  return { jobSalaryCount, companySalaryCount };
}
