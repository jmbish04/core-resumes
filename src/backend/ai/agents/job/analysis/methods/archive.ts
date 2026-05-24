import { eq } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { jobSnapshots, jobsPostings } from "@/backend/db/schema";

import type { JobAnalysisAgent } from "../index";

export async function handleArchive(env: Env, agent: JobAnalysisAgent, snapshotId: number) {
  const db = getDb(env);
  const { captureJobMarkdown, captureJobPdf } = await import("@/backend/services/jobs/archive");

  const snapshot = await db
    .select()
    .from(jobSnapshots)
    .where(eq(jobSnapshots.id, snapshotId))
    .get();
  if (!snapshot) {
    throw new Error(`Snapshot ${snapshotId} not found`);
  }
  const job = await db.select().from(jobsPostings).where(eq(jobsPostings.id, snapshot.jobId)).get();
  if (!job) {
    throw new Error(`Job for snapshot ${snapshotId} not found`);
  }

  const url = `https://boards.greenhouse.io/${job.company}/jobs/${job.jobSiteId}`;

  // Uses Cloudflare Browser Rendering to save PDF and Markdown archives to R2
  const mdKey = await captureJobMarkdown(env, url);
  const pdfKey = await captureJobPdf(env, url);

  // Update DB with archive locations
  await db
    .update(jobSnapshots)
    .set({ archiveMdKey: mdKey, archivePdfKey: pdfKey })
    .where(eq(jobSnapshots.id, snapshotId));

  return { status: "archive-completed", snapshotId, mdKey, pdfKey };
}
