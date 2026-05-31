/**
 * @fileoverview Orchestrate scanning across both Upwork and Freelancer.com.
 */
import type { FreelanceScannerState, SearchProfile } from "../types";

import type { FreelanceScannerAgent } from "../index";
import { handleScanFreelancer } from "./scan-freelancer";
import { handleScanUpwork } from "./scan-upwork";

export async function handleScanAll(
  env: Env,
  state: FreelanceScannerState,
  agent: FreelanceScannerAgent,
): Promise<string[]> {
  // Get active search profiles, or build a default from env vars
  let profiles: SearchProfile[] = state.searchProfiles.filter((p) => p.isActive);

  if (profiles.length === 0) {
    profiles = [
      {
        id: "default",
        name: "Default Profile",
        platform: "both",
        skills: env.FREELANCE_SCAN_SKILLS ?? "React,TypeScript,Node.js",
        filters: {
          hourly_min_usd: env.FREELANCE_DEFAULT_HOURLY_MIN
            ? parseInt(env.FREELANCE_DEFAULT_HOURLY_MIN, 10)
            : 50,
          experience_level: env.FREELANCE_DEFAULT_EXPERIENCE ?? "expert",
        },
        isActive: true,
      },
    ];
  }

  const sessionIds: string[] = [];

  for (const profile of profiles) {
    const params = {
      query: profile.query,
      skills: profile.skills,
      filters: profile.filters,
    };

    if (profile.platform === "upwork" || profile.platform === "both") {
      const sessionId = crypto.randomUUID();
      sessionIds.push(sessionId);
      (agent as any).ctx.waitUntil(
        handleScanUpwork(env, state, sessionId, params, agent),
      );
    }

    if (profile.platform === "freelancer" || profile.platform === "both") {
      const sessionId = crypto.randomUUID();
      sessionIds.push(sessionId);
      (agent as any).ctx.waitUntil(
        handleScanFreelancer(env, state, sessionId, params, agent),
      );
    }
  }

  return sessionIds;
}
