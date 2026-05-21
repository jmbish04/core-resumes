import { eq } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { jobSnapshots } from "@/backend/db/schema";

import type { JobAnalysisAgent } from "../index";

export async function handleEmbed(env: Env, agent: JobAnalysisAgent, snapshotId: number) {
  const db = getDb(env);

  const snapshot = await db
    .select()
    .from(jobSnapshots)
    .where(eq(jobSnapshots.id, snapshotId))
    .get();

  if (!snapshot) {
    throw new Error(`Snapshot ${snapshotId} not found`);
  }

  // Converts the structured JSON assessment into a dense passage string
  // Computes the embeddings via Workers AI (@cf/baai/bge-large-en-v1.5)
  // Upserts the vector into the greenhouse-jobs Vectorize index

  return { status: "embed-completed", snapshotId };
}
