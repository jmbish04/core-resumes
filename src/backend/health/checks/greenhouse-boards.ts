/**
 * @fileoverview Shared helper for health checks that need to dynamically
 * select Greenhouse board tokens from D1 and find jobs in the SF Bay Area.
 */

import { isNotNull } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { companies } from "@/backend/db/schema";

import type { GreenhouseJob } from "@/backend/health";

// Fallback board if no D1 boards have SF-area jobs
const FALLBACK_BOARD_TOKEN = "anthropic";

// SF Bay Area location matchers (case-insensitive)
export const SF_PATTERNS = [
  "san francisco",
  "sf,",
  "sf ",
  "bay area",
  "palo alto",
  "mountain view",
  "sunnyvale",
  "san jose",
  "san mateo",
  "redwood city",
  "menlo park",
  "oakland",
  "berkeley",
  "cupertino",
  "santa clara",
  "south san francisco",
  "emeryville",
  "foster city",
];

export function isSFBayArea(locationName: string): boolean {
  const lower = locationName.toLowerCase();
  return SF_PATTERNS.some((p) => lower.includes(p));
}

export interface GreenhouseBoardResult {
  boardToken: string;
  companyName: string;
  job: GreenhouseJob;
  source: "d1" | "fallback";
  boardsChecked: string[];
}

/**
 * Queries D1 for companies with greenhouse_token set, then iterates each
 * board looking for a job in the SF Bay Area. Returns the first match.
 *
 * Falls back to a hardcoded board token if no D1 boards yield SF-area results.
 */
export async function findSFAreaJob(env: Env): Promise<GreenhouseBoardResult> {
  const db = getDb(env);
  const boardsChecked: string[] = [];

  // 1. Query D1 for unique greenhouse boards
  const companiesWithBoards = await db
    .select({ id: companies.id, name: companies.name, token: companies.greenhouseToken })
    .from(companies)
    .where(isNotNull(companies.greenhouseToken));

  // Deduplicate tokens
  const uniqueBoards = new Map<string, string>();
  for (const c of companiesWithBoards) {
    if (c.token && !uniqueBoards.has(c.token)) {
      uniqueBoards.set(c.token, c.name);
    }
  }

  // 2. Iterate each board token, looking for SF-area jobs
  for (const [token, companyName] of uniqueBoards) {
    boardsChecked.push(token);
    try {
      const res = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`,
      );
      if (!res.ok) continue;

      const data = (await res.json()) as { jobs: GreenhouseJob[] };
      if (!data.jobs?.length) continue;

      // Filter for non-remote SF Bay Area jobs
      const sfJobs = data.jobs.filter(
        (j) => isSFBayArea(j.location.name) && !j.location.name.toLowerCase().includes("remote"),
      );

      if (sfJobs.length > 0) {
        const randomJob = sfJobs[Math.floor(Math.random() * sfJobs.length)];
        return {
          boardToken: token,
          companyName,
          job: randomJob,
          source: "d1",
          boardsChecked,
        };
      }
    } catch {
      // Non-fatal — move to next board
      continue;
    }
  }

  // 3. Fallback to hardcoded board
  boardsChecked.push(`${FALLBACK_BOARD_TOKEN} (fallback)`);
  const fallbackRes = await fetch(
    `https://boards-api.greenhouse.io/v1/boards/${FALLBACK_BOARD_TOKEN}/jobs`,
  );
  if (!fallbackRes.ok) {
    throw new Error(
      `Fallback Greenhouse API returned ${fallbackRes.status}. Boards checked: ${boardsChecked.join(", ")}`,
    );
  }

  const fallbackData = (await fallbackRes.json()) as { jobs: GreenhouseJob[] };
  if (!fallbackData.jobs?.length) {
    throw new Error(
      `Fallback board '${FALLBACK_BOARD_TOKEN}' returned 0 jobs. Boards checked: ${boardsChecked.join(", ")}`,
    );
  }

  // Try SF-area first, then fall back to any non-remote job
  const sfJobs = fallbackData.jobs.filter((j) => isSFBayArea(j.location.name));
  const nonRemoteJobs = fallbackData.jobs.filter(
    (j) => !j.location.name.toLowerCase().includes("remote"),
  );
  const jobList = sfJobs.length > 0 ? sfJobs : nonRemoteJobs.length > 0 ? nonRemoteJobs : fallbackData.jobs;
  const randomJob = jobList[Math.floor(Math.random() * jobList.length)];

  return {
    boardToken: FALLBACK_BOARD_TOKEN,
    companyName: "Anthropic (fallback)",
    job: randomJob,
    source: "fallback",
    boardsChecked,
  };
}
