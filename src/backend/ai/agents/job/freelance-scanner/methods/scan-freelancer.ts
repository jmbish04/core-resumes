/**
 * @fileoverview Scan Freelancer.com job listings via RapidAPI.
 */
import { FreelanceService } from "@/backend/services/jobs/freelance/freelance-service";
import { RapidApiClient, type FreelancerSearchParams } from "@/backend/services/jobs/freelance/rapidapi-client";

import type { FreelanceScannerState, FreelanceScanRunState } from "../types";

import type { FreelanceScannerAgent } from "../index";

export async function handleScanFreelancer(
  env: Env,
  state: FreelanceScannerState,
  sessionId: string,
  params: {
    query?: string;
    skills?: string;
    filters?: Record<string, unknown>;
  },
  agent: FreelanceScannerAgent,
): Promise<void> {
  const run: FreelanceScanRunState = {
    sessionId,
    platform: "freelancer",
    status: "running",
    query: params.query,
    found: 0,
    new: 0,
    updated: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
  };
  state.runs[sessionId] = run;
  agent.setState({ ...state });

  agent.emitProgress({
    type: "freelance-scan-progress",
    sessionId,
    platform: "freelancer",
    status: "running",
    found: 0,
    new: 0,
    updated: 0,
  });

  try {
    const client = new RapidApiClient(env);
    const service = new FreelanceService(env);

    const searchParams: FreelancerSearchParams = {
      q: params.query,
      skills: params.skills,
      ...(params.filters as Partial<FreelancerSearchParams>),
    };

    const response = await client.searchFreelancer(searchParams);
    run.found = response.data.length;
    agent.setState({ ...state });

    // Normalize all results
    const normalized = response.data.map((job) => RapidApiClient.normalizeFreelancer(job));

    // Upsert into DB
    const result = await service.upsertOpportunities(normalized);
    run.new = result.inserted;
    run.updated = result.updated;
    run.status = "completed";

    // Update last scan timestamp
    state.lastScanAt.freelancer = new Date().toISOString();
    agent.setState({ ...state });

    // Record scan run
    await service.recordScanRun({
      platform: "freelancer",
      sessionId,
      query: params.query ?? null,
      skills: params.skills ?? null,
      found: run.found,
      inserted: run.new,
      updated: run.updated,
      failed: run.failed,
      status: "completed",
    });

    agent.emitProgress({
      type: "freelance-scan-progress",
      sessionId,
      platform: "freelancer",
      status: "completed",
      found: run.found,
      new: run.new,
      updated: run.updated,
    });
  } catch (err) {
    run.status = "failed";
    run.error = err instanceof Error ? err.message : String(err);
    agent.setState({ ...state });

    agent.emitProgress({
      type: "freelance-scan-progress",
      sessionId,
      platform: "freelancer",
      status: "failed",
      found: run.found,
      new: run.new,
      updated: run.updated,
      failed: run.failed,
      error: run.error,
    });
  }
}
