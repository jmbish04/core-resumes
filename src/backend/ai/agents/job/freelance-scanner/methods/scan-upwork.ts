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

    // Ensure we have at least 'q' or 'skills' parameter to satisfy RapidAPI requirements.
    let searchSkills = params.skills;
    let searchQuery = params.query;
    if (!searchQuery && !searchSkills) {
      const profile = await service.getProfile();
      const dbSkills = typeof profile.skills === "string" ? profile.skills : (profile.skills as string[] | undefined)?.join(",");
      searchSkills = dbSkills || env.FREELANCE_SCAN_SKILLS || "React,TypeScript,Node.js";
    }

    const searchParams: UpworkSearchParams = {
      q: searchQuery,
      skills: searchSkills,
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
      searchQuery: searchQuery ?? null,
      searchFilters: params.filters ?? null,
      status: "completed",
      listingsFound: run.found,
      listingsNew: run.new,
      listingsUpdated: run.updated,
      errorMessage: null,
      triggeredBy: "manual",
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
