/**
 * @fileoverview Vectorization service for Greenhouse jobs.
 */
import { AiProvider } from "../../../ai/providers";
import { Logger } from "../../../lib/logger";

export async function embedSnapshot(env: Env, snapshot: any) {
  const logger = new Logger(env);
  try {
    const textBlock = `[TITLE] ${snapshot.jobTitle} at [COMPANY] ${snapshot.company}\nRequirements: ${snapshot.requirements || ""}`;
    const [embedding] = await new AiProvider(env).embedJobsBatch([textBlock]);

    await env.VECTORIZE_JOBS.upsert([
      {
        id: snapshot.id.toString(),
        values: embedding,
        metadata: {
          job_site_id: snapshot.jobSiteId,
          company: snapshot.company,
          // add other metadata as needed
        },
      },
    ]);

    await logger.info("[Vectorize] Successfully embedded snapshot", { snapshotId: snapshot.id });
  } catch (err) {
    await logger.error("[Vectorize] Failed to embed snapshot", {
      snapshotId: snapshot.id,
      error: String(err),
    });
    throw err;
  }
}

export async function queryJobs(env: Env, queryText: string, topK: number = 5) {
  const logger = new Logger(env);
  try {
    const queryVector = await new AiProvider(env).embedJobsQuery(queryText);
    const results = await env.VECTORIZE_JOBS.query(queryVector, { topK, returnMetadata: true });
    return results.matches;
  } catch (err) {
    await logger.error("[Vectorize] Failed to query jobs", {
      error: String(err),
    });
    throw err;
  }
}
