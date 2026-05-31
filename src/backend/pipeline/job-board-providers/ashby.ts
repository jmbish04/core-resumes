/**
 * @fileoverview AshbyHQ provider implementation.
 *
 * Wraps the new `src/backend/ai/tools/ashby.ts` tool client
 * and conforms to the `JobBoardProvider` interface.
 */

import { scrapeAshbyBoard, scrapeAshbyJob } from "@/backend/ai/tools/ashby";

import type { JobBoardProvider, NormalizedJobPost, TokenTestResult } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.ashbyhq.com/posting-api/job-board";
const PER_TOKEN_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const ashbyProvider: JobBoardProvider = {
  name: "ashby",
  displayName: "AshbyHQ",
  healthConfigKey: "ashby_tokens",
  isApi: true,
  isRss: false,

  async testToken(token: string): Promise<TokenTestResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${BASE_URL}/${token}`, {
        signal: AbortSignal.timeout(PER_TOKEN_TIMEOUT_MS),
      });

      if (!res.ok) {
        return {
          token,
          status: res.status,
          ok: false,
          jobCount: 0,
          error: `HTTP ${res.status}`,
          latencyMs: Date.now() - start,
        };
      }

      const body = (await res.json()) as { jobs?: Array<{ id: string; title: string; location: string }> };

      if (!Array.isArray(body.jobs)) {
        return {
          token,
          status: res.status,
          ok: false,
          jobCount: 0,
          error: "Response missing 'jobs' array",
          latencyMs: Date.now() - start,
        };
      }

      const sample = body.jobs[0];
      return {
        token,
        status: res.status,
        ok: true,
        jobCount: body.jobs.length,
        sampleJob: sample
          ? { id: sample.id, title: sample.title, location: sample.location }
          : undefined,
        latencyMs: Date.now() - start,
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
    const jobs = await scrapeAshbyBoard(token);

    return jobs.map((job) => ({
      id: job.id,
      title: job.title,
      location: job.location || "Not specified",
      department: job.department,
      isRemote: job.isRemote,
      publishedAt: job.publishedAt,
      compensation: job.compensationTierSummary,
      descriptionHtml: job.descriptionHtml,
      descriptionText: job.descriptionPlain,
    }));
  },

  async scrapeJob(token: string, jobId: string) {
    return scrapeAshbyJob(token, jobId);
  },
};
