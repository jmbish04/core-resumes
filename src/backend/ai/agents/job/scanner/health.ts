/**
 * @fileoverview Health check for the JobScannerAgent.
 */
import { getDb } from "@/backend/db";
import { jobsPostings } from "@/backend/db/schema";
import { Logger } from "@/backend/lib/logger";

export async function checkScannerHealth(env: Env): Promise<{
  greenhouseApi: "ok" | "error";
  db: "ok" | "error";
  error?: string;
}> {
  const logger = new Logger(env);
  let greenhouseApi: "ok" | "error" = "ok";
  let dbStatus: "ok" | "error" = "ok";
  let errorMsg: string | undefined;

  try {
    // Check Greenhouse API
    const defaultBoard = env.DEFAULT_BOARD_TOKENS.split(",")[0] || "cloudflare";
    const res = await fetch(`${env.GREENHOUSE_API_BASE}/${defaultBoard}/jobs`, {
      method: "HEAD",
    });
    if (!res.ok) {
      greenhouseApi = "error";
      errorMsg = `Greenhouse API returned ${res.status}`;
    }
  } catch (err) {
    greenhouseApi = "error";
    errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("JobScannerAgent greenhouse health check failed", { error: errorMsg });
  }

  try {
    // Check DB (simple query to ensure connectivity)
    await getDb(env).select({ id: jobsPostings.id }).from(jobsPostings).limit(1);
  } catch (err) {
    dbStatus = "error";
    const dbErr = err instanceof Error ? err.message : String(err);
    errorMsg = errorMsg ? `${errorMsg} | DB: ${dbErr}` : dbErr;
    logger.error("JobScannerAgent db health check failed", { error: dbErr });
  }

  return { greenhouseApi, db: dbStatus, error: errorMsg };
}
