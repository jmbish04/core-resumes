import { getDb } from "@/backend/db";
import { jobsPostings, jobSnapshots } from "@/backend/db/schema";
import { fetchBoard } from "@/backend/services/jobs/scraper";
import { triageBatch } from "@/backend/services/jobs/triage";

import type { JobScannerState, RunState } from "../types";

import { JobScannerAgent } from "../index";

export async function handleScanBoard(
  env: Env,
  state: JobScannerState,
  sessionId: string,
  token: string,
  agent: JobScannerAgent,
): Promise<void> {
  const run: RunState = {
    sessionId,
    token,
    status: "running",
    scraped: 0,
    triaged: 0,
    analyzed: 0,
    failed: 0,
  };
  state.runs[sessionId] = run;

  agent.emitProgress({
    type: "scan-progress",
    token,
    scraped: 0,
    triaged: 0,
  });

  try {
    const jobs = await fetchBoard(env, token);
    run.scraped = jobs.length;

    agent.emitProgress({
      type: "scan-progress",
      token,
      scraped: run.scraped,
      triaged: run.triaged,
    });

    const decisions = await triageBatch(env, jobs);

    const db = getDb(env);

    // Process decisions and insert into DB
    for (const job of jobs) {
      const decisionObj = decisions.find(
        (d: any) => d.job_site_id.toString() === job.id.toString(),
      );
      const passed = decisionObj?.decision === "Include";

      // Upsert into jobsPostings
      const [upserted] = await db
        .insert(jobsPostings)
        .values({
          jobSiteId: job.id.toString(),
          jobTitle: job.title,
          company: token,
          triagePassed: passed,
          triageReason: decisionObj?.reasoning,
        })
        .onConflictDoUpdate({
          target: jobsPostings.jobSiteId,
          set: {
            jobTitle: job.title,
            triagePassed: passed,
            triageReason: decisionObj?.reasoning,
          },
        })
        .returning();

      if (passed && upserted) {
        run.triaged++;
        // Create an initial snapshot placeholder so we can enqueue it for deep analysis
        const [snapshot] = await db
          .insert(jobSnapshots)
          .values({
            jobId: upserted.id,
            sessionUuid: sessionId,
          })
          .returning();

        if (snapshot) {
          state.queue.push({
            jobSiteId: job.id.toString(),
            snapshotId: snapshot.id,
            token,
          });
        }
      }
    }

    run.status = "completed";

    agent.emitProgress({
      type: "scan-progress",
      token,
      scraped: run.scraped,
      triaged: run.triaged,
    });
  } catch (err) {
    run.status = "failed";
    run.error = String(err);
  }
}
