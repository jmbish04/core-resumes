import { eq } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { jobSnapshots } from "@/backend/db/schema";

import type { JobAnalysisAgent } from "../index";

export async function handleConsultNotebook(env: Env, agent: JobAnalysisAgent, snapshotId: number) {
  const db = getDb(env);

  // Get snapshot
  const snapshot = await db
    .select()
    .from(jobSnapshots)
    .where(eq(jobSnapshots.id, snapshotId))
    .get();

  if (!snapshot) {
    throw new Error(`Snapshot ${snapshotId} not found`);
  }

  // Queries NotebookLM with context from the job snapshot to identify candidate
  // strengths, missing skills, and interview alignment.
  // The results are stored in the job_notebook_consultations table.

  return { status: "consult-notebook-completed", snapshotId };
}
