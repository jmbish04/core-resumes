/**
 * @fileoverview Health diagnostic coordinator — orchestrates parallel execution
 * of all registered health checks and persists results to D1.
 *
 * Replaces the monolithic `runFullScreening` / `saveScreeningToD1` / `getLatestScreening`
 * from `services/health.ts`.
 */

import { desc, eq } from "drizzle-orm";

import type {
  HealthCheckDescriptor,
  HealthRun,
  HealthResult,
  HealthStatus,
  HealthStepResult,
  HealthTrigger,
  CheckStatus,
} from "@/backend/health/types";

export type {
  HealthCheckDescriptor,
  HealthRun,
  HealthResult,
  HealthStatus,
  HealthStepResult,
  HealthTrigger,
  CheckStatus,
  GreenhouseJob,
  AshbyJob,
  GemJob,
} from "@/backend/health/types";

import { checkNotebookLMMcpAgentRPC } from "@/backend/ai/agents/notebooklm-mcp/health";
import { checkNotebookLMAgentRPC } from "@/backend/ai/agents/notebooklm/health";
// Agent RPC callers
import { checkOrchestratorAgentRPC } from "@/backend/ai/agents/orchestrator/health";
import { checkTranscriptionAgentRPC } from "@/backend/ai/agents/transcription/health";
import { checkGoogleDrive } from "@/backend/ai/tools/google/health";
import { checkWorkersAI, checkAIGateway } from "@/backend/ai/workersai/health";
import { getDb } from "@/backend/db";
// ---------------------------------------------------------------------------
// Co-located check imports
// ---------------------------------------------------------------------------
import { checkD1, checkKV } from "@/backend/db/health";
import {
  healthRuns,
  healthResults,
  type NewHealthResultRow,
} from "@/backend/db/schema";
import { checkBindings } from "@/health/checks/infrastructure/bindings";
import { checkD1TableScan } from "@/health/checks/infrastructure/d1-table-scan";
import { checkExtractionFidelity } from "@/health/checks/job-board-apis/extraction-fidelity";
import { checkGeminiProvider } from "@/health/checks/ai/gemini-provider";
import { checkGreenhouseEnvVars } from "@/health/checks/job-board-apis/greenhouse-env-vars";
import { checkJobsDataQuality } from "@/health/checks/data-quality/jobs-data-quality";
import { checkJobsSchemaIntegrity } from "@/health/checks/data-quality/jobs-schema-integrity";
import { checkNotebookLMCredentials } from "@/health/checks/integrations/notebooklm-credentials";
import { checkNotebookLMQuery } from "@/health/checks/integrations/notebooklm-query";
import { checkOpenRoute } from "@/health/checks/integrations/openroute";
import { checkPipelineSessions } from "@/health/checks/data-quality/pipeline-sessions";
import { checkR2JobsBucket } from "@/health/checks/infrastructure/r2-jobs-bucket";
import { checkSTT } from "@/health/checks/ai/stt";
import { checkTTS } from "@/health/checks/ai/tts";
import { checkVectorizeJobs } from "@/health/checks/infrastructure/vectorize-jobs";
import { checkSecrets, checkEnvVars } from "@/backend/utils/health";
import { checkSalarySql } from "@/health/checks/data-quality/salary-sql";
import { checkJobBoardApiConnectivity } from "@/health/checks/job-board-apis";
import { checkFreelanceSchemaIntegrity } from "@/health/checks/freelance-apis/freelance-schema-integrity";
import { checkFreelanceDataQuality } from "@/health/checks/freelance-apis/freelance-data-quality";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PER_CHECK_TIMEOUT_MS = 30_000;

/**
 * Per-check timeout overrides for checks that are inherently slow.
 * `notebooklm_query` only needs extra time on manual/agent triggers (live query).
 */
function getTimeoutOverrides(trigger: HealthTrigger): Record<string, number> {
  const base: Record<string, number> = {
    agent_notebooklm: 45_000,
    salary_sql: 45_000,
    google_drive_lifecycle: 45_000,
    extraction_fidelity: 120_000,
    openroute_commute: 90_000,
    job_board_api_connectivity: 45_000,
    gemini_provider: 15_000,
  };
  // Live query mode needs more time for SDK connect + query
  if (trigger === "manual" || trigger === "agent") {
    base.notebooklm_query = 45_000;
  }
  return base;
}

/** Maximum number of parameters per D1 batch insert (D1 limit = 100). */
const MAX_BATCH_PARAMS = 100;

// ---------------------------------------------------------------------------
// Check registry
// ---------------------------------------------------------------------------

function buildCheckRegistry(
  env: Env,
  previousDocIds: string[],
  trigger: HealthTrigger,
): HealthCheckDescriptor[] {
  return [
    // Database
    { name: "d1_roundtrip", category: "database", fn: () => checkD1(env) },
    { name: "kv_read", category: "database", fn: () => checkKV(env) },
    {
      name: "d1_table_scan",
      category: "database",
      fn: () => checkD1TableScan(env),
    },

    // AI
    {
      name: "workers_ai_embedding",
      category: "ai",
      fn: () => checkWorkersAI(env),
    },
    { name: "ai_gateway", category: "ai", fn: () => checkAIGateway(env) },
    { name: "tts_deepgram", category: "ai", fn: () => checkTTS(env) },
    { name: "stt_whisper", category: "ai", fn: () => checkSTT(env) },

    // Google
    {
      name: "google_drive_lifecycle",
      category: "google",
      fn: () => checkGoogleDrive(env, previousDocIds),
    },

    // Bindings
    {
      name: "platform_bindings",
      category: "binding",
      fn: () => checkBindings(env),
    },

    // Providers / Credentials
    {
      name: "secrets_store",
      category: "providers",
      fn: () => checkSecrets(env),
    },
    { name: "env_vars", category: "providers", fn: () => checkEnvVars(env) },
    {
      name: "notebooklm_credentials",
      category: "providers",
      fn: () => checkNotebookLMCredentials(env),
    },

    // Agents
    {
      name: "agent_orchestrator",
      category: "agents",
      fn: () => checkOrchestratorAgentRPC(env) as Promise<HealthStepResult>,
    },
    {
      name: "agent_notebooklm",
      category: "agents",
      fn: () => checkNotebookLMAgentRPC(env) as Promise<HealthStepResult>,
    },
    {
      name: "agent_notebooklm_mcp",
      category: "agents",
      fn: () => checkNotebookLMMcpAgentRPC(env) as Promise<HealthStepResult>,
    },
    // {
    //   name: "agent_transcription",
    //   category: "agents",
    //   fn: () => checkTranscriptionAgentRPC(env) as Promise<HealthStepResult>,
    // },
    {
      name: "salary_sql",
      category: "agents",
      fn: () => checkSalarySql(env),
    },

    // API / Pipeline
    {
      name: "extraction_fidelity",
      category: "api",
      fn: () => checkExtractionFidelity(env),
    },
    {
      name: "notebooklm_query",
      category: "api",
      fn: () => checkNotebookLMQuery(env, trigger),
    },
    {
      name: "openroute_commute",
      category: "api",
      fn: () => checkOpenRoute(env),
    },

    // Job Board API Scanner Pipeline
    {
      name: "greenhouse_env_vars",
      category: "job_board_api",
      fn: () => checkGreenhouseEnvVars(env),
    },
    {
      name: "r2_jobs_bucket",
      category: "job_board_api",
      fn: () => checkR2JobsBucket(env),
    },
    {
      name: "vectorize_jobs",
      category: "job_board_api",
      fn: () => checkVectorizeJobs(env),
    },
    {
      name: "jobs_schema_integrity",
      category: "job_board_api",
      fn: () => checkJobsSchemaIntegrity(env),
    },
    {
      name: "jobs_data_quality",
      category: "job_board_api",
      fn: () => checkJobsDataQuality(env),
    },
    {
      name: "gemini_provider",
      category: "job_board_api",
      fn: () => checkGeminiProvider(env),
    },
    {
      name: "pipeline_sessions",
      category: "job_board_api",
      fn: () => checkPipelineSessions(env),
    },
    {
      name: "job_board_api_connectivity",
      category: "job_board_api",
      fn: () => checkJobBoardApiConnectivity(env),
    },

    // Freelance Scanner Pipeline
    {
      name: "freelance_schema_integrity",
      category: "freelance",
      fn: () => checkFreelanceSchemaIntegrity(env),
    },
    {
      name: "freelance_data_quality",
      category: "freelance",
      fn: () => checkFreelanceDataQuality(env),
    },
  ];
}

// ---------------------------------------------------------------------------
// Timeout wrapper
// ---------------------------------------------------------------------------

async function runWithTimeout(
  descriptor: HealthCheckDescriptor,
  timeoutMs: number,
): Promise<{ descriptor: HealthCheckDescriptor; result: HealthStepResult }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await Promise.race([
      descriptor.fn(),
      new Promise<HealthStepResult>((_, reject) => {
        controller.signal.addEventListener("abort", () =>
          reject(
            new Error(
              `Check "${descriptor.name}" timed out after ${timeoutMs}ms`,
            ),
          ),
        );
      }),
    ]);
    return { descriptor, result };
  } catch (e) {
    return {
      descriptor,
      result: {
        status: "timeout" as CheckStatus,
        latencyMs: timeoutMs,
        error: e instanceof Error ? e.message : String(e),
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Status aggregation
// ---------------------------------------------------------------------------

function computeOverallStatus(results: HealthStepResult[]): HealthStatus {
  const failCount = results.filter(
    (r) => r.status === "fail" || r.status === "timeout",
  ).length;
  const warnCount = results.filter((r) => r.status === "warn").length;

  if (failCount >= 4) return "unhealthy";
  if (failCount > 0) return "degraded";
  if (warnCount > 0) return "degraded";
  return "healthy";
}

// ---------------------------------------------------------------------------
// HealthCoordinator
// ---------------------------------------------------------------------------

export class HealthCoordinator {
  constructor(private env: Env) {}

  /**
   * Execute all health checks in parallel, persist to D1, and return results.
   */
  async runAllChecks(
    trigger: HealthTrigger,
  ): Promise<{ run: HealthRun; results: HealthResult[] }> {
    const runId = crypto.randomUUID();
    const overallStart = Date.now();
    const db = getDb(this.env);

    // Retrieve previous run's Drive doc IDs for cleanup
    let previousDocIds: string[] = [];
    try {
      const latestResults = await db
        .select({ details: healthResults.details })
        .from(healthResults)
        .innerJoin(healthRuns, eq(healthResults.runId, healthRuns.id))
        .where(eq(healthResults.name, "google_drive_lifecycle"))
        .orderBy(desc(healthRuns.createdAt))
        .limit(1);

      if (latestResults.length > 0 && latestResults[0].details) {
        const details = latestResults[0].details as Record<string, unknown>;
        const docIds = details.createdDocIds ?? details.createdDocUrls;
        if (Array.isArray(docIds)) {
          previousDocIds = docIds.filter(
            (id): id is string => typeof id === "string",
          );
        }
      }
    } catch {
      // No previous runs — that's fine
    }

    // Build check registry and run all in parallel with timeouts
    const checks = buildCheckRegistry(this.env, previousDocIds, trigger);
    const timeoutOverrides = getTimeoutOverrides(trigger);
    const settled = await Promise.all(
      checks.map((c) =>
        runWithTimeout(c, timeoutOverrides[c.name] ?? PER_CHECK_TIMEOUT_MS),
      ),
    );

    // Build result rows
    const resultRows: NewHealthResultRow[] = settled.map(
      ({ descriptor, result }) => ({
        id: crypto.randomUUID(),
        runId,
        category: descriptor.category,
        name: descriptor.name,
        status: result.status,
        message: result.error ?? null,
        details: result.details ?? null,
        durationMs: result.latencyMs ?? 0,
        aiSuggestion: result.aiSuggestion ?? null,
      }),
    );

    const overallStatus = computeOverallStatus(settled.map((s) => s.result));
    const durationMs = Date.now() - overallStart;

    // Persist run
    await db.insert(healthRuns).values({
      id: runId,
      status: overallStatus,
      trigger,
      durationMs,
      metadata: {
        checkCount: checks.length,
        skipCount: settled.filter((s) => s.result.status === "skipped").length,
        failCount: settled.filter(
          (s) => s.result.status === "fail" || s.result.status === "timeout",
        ).length,
      },
    });

    // Batch-insert results (respect D1's 100-param limit)
    // Each result row has 10 columns → max 10 rows per batch
    const BATCH_SIZE = Math.floor(MAX_BATCH_PARAMS / 10);
    for (let i = 0; i < resultRows.length; i += BATCH_SIZE) {
      const batch = resultRows.slice(i, i + BATCH_SIZE);
      await db.insert(healthResults).values(batch);
    }

    // Map to return types
    const run: HealthRun = {
      id: runId,
      status: overallStatus,
      trigger,
      durationMs,
      createdAt: new Date().toISOString(),
    };

    const results: HealthResult[] = resultRows.map((row) => ({
      id: row.id!,
      runId: row.runId,
      category: row.category as HealthResult["category"],
      name: row.name,
      status: row.status as HealthResult["status"],
      message: row.message ?? undefined,
      details: (row.details as Record<string, unknown>) ?? undefined,
      durationMs: row.durationMs ?? 0,
      aiSuggestion: row.aiSuggestion ?? undefined,
      timestamp: new Date().toISOString(),
    }));

    return { run, results };
  }

  /**
   * Retrieve the latest health run with its results.
   */
  async getLatestRun(): Promise<{
    run: HealthRun;
    results: HealthResult[];
  } | null> {
    const db = getDb(this.env);

    const runs = await db
      .select()
      .from(healthRuns)
      .orderBy(desc(healthRuns.createdAt))
      .limit(1);

    if (runs.length === 0) return null;

    const latestRun = runs[0];
    const rawResults = await db
      .select()
      .from(healthResults)
      .where(eq(healthResults.runId, latestRun.id));

    const run: HealthRun = {
      id: latestRun.id,
      status: latestRun.status as HealthStatus,
      trigger: latestRun.trigger as HealthTrigger,
      durationMs: latestRun.durationMs,
      createdAt:
        latestRun.createdAt instanceof Date
          ? latestRun.createdAt.toISOString()
          : String(latestRun.createdAt),
      metadata: (latestRun.metadata as Record<string, unknown>) ?? undefined,
    };

    const results: HealthResult[] = rawResults.map((row) => ({
      id: row.id,
      runId: row.runId,
      category: row.category as HealthResult["category"],
      name: row.name,
      status: row.status as HealthResult["status"],
      message: row.message ?? undefined,
      details: (row.details as Record<string, unknown>) ?? undefined,
      durationMs: row.durationMs,
      aiSuggestion: row.aiSuggestion ?? undefined,
      timestamp:
        row.timestamp instanceof Date
          ? row.timestamp.toISOString()
          : String(row.timestamp),
    }));

    return { run, results };
  }
}
