/**
 * @fileoverview Greenhouse provider implementation.
 *
 * Wraps the existing `src/backend/ai/tools/greenhouse.ts` tool client
 * and conforms to the `JobBoardProvider` interface.
 */

import { scrapeGreenhouseJob } from "@/backend/ai/tools/greenhouse";

import type { JobBoardProvider, NormalizedJobPost, TokenTestResult } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = "https://boards-api.greenhouse.io/v1/boards";
const PER_TOKEN_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Greenhouse API board response shape
// ---------------------------------------------------------------------------

interface GreenhouseBoardJob {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string };
  departments?: Array<{ id: number; name: string }>;
  updated_at?: string;
}

interface GreenhouseBoardResponse {
  jobs: GreenhouseBoardJob[];
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const greenhouseProvider: JobBoardProvider = {
  name: "greenhouse",
  displayName: "Greenhouse",
  healthConfigKey: "greenhouse_tokens",
  isApi: true,
  isRss: false,

  async testToken(token: string): Promise<TokenTestResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${BASE_URL}/${token}/jobs`, {
        method: "HEAD",
        signal: AbortSignal.timeout(PER_TOKEN_TIMEOUT_MS),
      });

      return {
        token,
        status: res.status,
        ok: res.ok,
        jobCount: 0, // HEAD doesn't return body
        latencyMs: Date.now() - start,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      };
    } catch (e) {
      return {
        token,
        status: 0,
        ok: false,
        jobCount: 0,
        error: e instanceof Error ? e.message : String(e),
        latencyMs: Date.now() - start,
      };
    }
  },

  async scrapeBoard(token: string): Promise<NormalizedJobPost[]> {
    const res = await fetch(`${BASE_URL}/${token}/jobs`, {
      signal: AbortSignal.timeout(PER_TOKEN_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`Greenhouse API returned ${res.status} for board '${token}'`);
    }

    const body = (await res.json()) as GreenhouseBoardResponse;

    if (!body || !Array.isArray(body.jobs)) {
      return [];
    }

    return body.jobs.map((job) => ({
      id: String(job.id),
      title: job.title,
      location: job.location?.name ?? "Not specified",
      department: job.departments?.[0]?.name,
      isRemote: job.location?.name?.toLowerCase().includes("remote") ?? false,
      publishedAt: job.updated_at,
    }));
  },

  async scrapeJob(token: string, jobId: string) {
    return scrapeGreenhouseJob(token, jobId);
  },
};
