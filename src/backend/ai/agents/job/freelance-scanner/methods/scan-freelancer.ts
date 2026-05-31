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

    // Ensure we have at least 'q' or 'skills' parameter to satisfy RapidAPI requirements.
    let searchSkills = params.skills;
    let searchQuery = params.query;
    if (!searchQuery && !searchSkills) {
      const profile = await service.getProfile();
      const dbSkills = typeof profile.skills === "string" ? profile.skills : (profile.skills as string[] | undefined)?.join(",");
      searchSkills = dbSkills || env.FREELANCE_SCAN_SKILLS || "React,TypeScript,Node.js";
    }

    const searchParams: FreelancerSearchParams = {
      q: searchQuery,
      skills: searchSkills,
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
