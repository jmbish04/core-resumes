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
  // Persist the initial run so progress survives DO hibernation/eviction.
  agent.setState({ ...state });

  agent.emitProgress({
    type: "scan-progress",
    token,
    scraped: 0,
    triaged: 0,
  });

  try {
    const jobs = await fetchBoard(env, token);
    run.scraped = jobs.length;
    agent.setState({ ...state });

    agent.emitProgress({
      type: "scan-progress",
      token,
      scraped: run.scraped,
      triaged: run.triaged,
    });

    const decisions = await triageBatch(env, jobs);

    const db = getDb(env);

    // ---- Phase 1: batch-upsert all jobsPostings in a single D1 round-trip ----
    // fetchBoard returns Greenhouse JSON typed as any[]; pin the shape we use.
    type GreenhouseJob = { id: string | number; title: string };
    type DecisionForJob = {
      job: GreenhouseJob;
      passed: boolean;
      reasoning: string | undefined;
    };
    const decisionsForJobs: DecisionForJob[] = (jobs as GreenhouseJob[]).map((job) => {
      const decisionObj = decisions.find(
        (d: { job_site_id: string | number }) =>
          d.job_site_id.toString() === job.id.toString(),
      );
      return {
        job,
        passed: decisionObj?.decision === "Include",
        reasoning: decisionObj?.reasoning,
      };
    });

    const upsertStmts = decisionsForJobs.map(({ job, passed, reasoning }) =>
      db
        .insert(jobsPostings)
        .values({
          jobSiteId: job.id.toString(),
          jobTitle: job.title,
          company: token,
          triagePassed: passed,
          triageReason: reasoning,
        })
        .onConflictDoUpdate({
          target: jobsPostings.jobSiteId,
          set: {
            jobTitle: job.title,
            triagePassed: passed,
            triageReason: reasoning,
          },
        })
        .returning(),
    );

    type UpsertStmt = (typeof upsertStmts)[number];
    const upsertResults = upsertStmts.length
      ? await db.batch(upsertStmts as unknown as [UpsertStmt, ...UpsertStmt[]])
      : [];

    // ---- Phase 2: batch-insert snapshot placeholders for passed rows ----
    type PassedPair = {
      jobSiteId: string;
      jobRowId: number;
    };
    const passedPairs: PassedPair[] = [];
    upsertResults.forEach((result, idx) => {
      const upserted = Array.isArray(result) ? result[0] : undefined;
      const decisionForJob = decisionsForJobs[idx];
      if (decisionForJob?.passed && upserted) {
        passedPairs.push({
          jobSiteId: decisionForJob.job.id.toString(),
          jobRowId: upserted.id,
        });
        run.triaged++;
      }
    });

    const snapshotStmts = passedPairs.map(({ jobRowId }) =>
      db
        .insert(jobSnapshots)
        .values({ jobId: jobRowId, sessionUuid: sessionId })
        .returning(),
    );

    type SnapshotStmt = (typeof snapshotStmts)[number];
    const snapshotResults = snapshotStmts.length
      ? await db.batch(snapshotStmts as unknown as [SnapshotStmt, ...SnapshotStmt[]])
      : [];

    snapshotResults.forEach((result, idx) => {
      const snapshot = Array.isArray(result) ? result[0] : undefined;
      const pair = passedPairs[idx];
      if (snapshot && pair) {
        state.queue.push({
          jobSiteId: pair.jobSiteId,
          snapshotId: snapshot.id,
          token,
        });
      }
    });

    run.status = "completed";
    // Persist final run state + accumulated queue before returning so a
    // post-run DO hibernation does not lose the triage results.
    agent.setState({ ...state });

    agent.emitProgress({
      type: "scan-progress",
      token,
      scraped: run.scraped,
      triaged: run.triaged,
    });
  } catch (err) {
    run.status = "failed";
    run.error = String(err);
    // Persist the failure so the dashboard reflects it after eviction.
    agent.setState({ ...state });
  }
}
