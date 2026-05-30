/**
 * @fileoverview Health check for the FreelanceScannerAgent.
 */
import { getDb } from "@/backend/db";
import { freelanceOpportunities } from "@/backend/db/schema";
import { Logger } from "@/backend/lib/logger";
import { getRapidApiKey } from "@/backend/utils/secrets";

export async function checkFreelanceScannerHealth(env: Env): Promise<{
  rapidApi: "ok" | "error";
  db: "ok" | "error";
  error?: string;
}> {
  const logger = new Logger(env);
  let rapidApiStatus: "ok" | "error" = "ok";
  let dbStatus: "ok" | "error" = "ok";
  let errorMsg: string | undefined;

  try {
    // Check RapidAPI key is present and test connectivity
    const apiKey = await getRapidApiKey(env);
    if (!apiKey) {
      rapidApiStatus = "error";
      errorMsg = "RAPIDAPI_KEY is not configured";
    } else {
      // Lightweight test — POST request to the Upwork search endpoint
      const testUrl = `https://${env.RAPIDAPI_HOST_UPWORK}/upwork/search-jobs`;
      const res = await fetch(testUrl, {
        method: "POST",
        headers: {
          "X-RapidAPI-Key": apiKey,
          "X-RapidAPI-Host": env.RAPIDAPI_HOST_UPWORK,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "test", limit: 1 }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok && res.status !== 429) {
        rapidApiStatus = "error";
        errorMsg = `RapidAPI returned ${res.status}`;
      }
    }
  } catch (err) {
    rapidApiStatus = "error";
    errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("FreelanceScannerAgent RapidAPI health check failed", { error: errorMsg });
  }

  try {
    // Check DB connectivity
    await getDb(env).select({ id: freelanceOpportunities.id }).from(freelanceOpportunities).limit(1);
  } catch (err) {
    dbStatus = "error";
    const dbErr = err instanceof Error ? err.message : String(err);
    errorMsg = errorMsg ? `${errorMsg} | DB: ${dbErr}` : dbErr;
    logger.error("FreelanceScannerAgent db health check failed", { error: dbErr });
  }

  return { rapidApi: rapidApiStatus, db: dbStatus, error: errorMsg };
}
