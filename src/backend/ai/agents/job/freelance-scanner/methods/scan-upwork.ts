/**
 * @fileoverview Scan Upwork job listings via RapidAPI.
 */
import { FreelanceService } from "@/backend/services/jobs/freelance/freelance-service";
import { RapidApiClient, type UpworkSearchParams } from "@/backend/services/jobs/freelance/rapidapi-client";

import type { FreelanceScannerState, FreelanceScanRunState } from "../types";

import type { FreelanceScannerAgent } from "../index";

export async function handleScanUpwork(
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
    platform: "upwork",
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
    platform: "upwork",
    status: "running",
    found: 0,
    new: 0,
    updated: 0,
  });

  try {
    const client = new RapidApiClient(env);
    const service = new FreelanceService(env);

    const searchParams: UpworkSearchParams = {
      q: params.query,
      skills: params.skills,
      ...(params.filters as Partial<UpworkSearchParams>),
    };

    const response = await client.searchUpwork(searchParams);
    run.found = response.data.length;
    agent.setState({ ...state });

    // Normalize all results
    const normalized = response.data.map((job) => RapidApiClient.normalizeUpwork(job));

    // Upsert into DB
    const result = await service.upsertOpportunities(normalized);
    run.new = result.inserted;
    run.updated = result.updated;
    run.status = "completed";

    // Update last scan timestamp
    state.lastScanAt.upwork = new Date().toISOString();
    agent.setState({ ...state });

    // Record scan run
    await service.recordScanRun({
      platform: "upwork",
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
      platform: "upwork",
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
      platform: "upwork",
      status: "failed",
      found: run.found,
      new: run.new,
      updated: run.updated,
      failed: run.failed,
      error: run.error,
    });
  }
}
