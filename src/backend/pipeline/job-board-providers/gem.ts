/**
 * @fileoverview Gem provider implementation.
 *
 * Wraps the existing `src/backend/ai/tools/gem.ts` tool client
 * and conforms to the `JobBoardProvider` interface.
 */

import { scrapeGemBoard, scrapeGemJob } from "@/backend/ai/tools/gem";

import type { JobBoardProvider, NormalizedJobPost, TokenTestResult } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.gem.com/job_board/v0";
const PER_TOKEN_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const gemProvider: JobBoardProvider = {
  name: "gem",
  displayName: "Gem",
  healthConfigKey: "gem_tokens",
  isApi: true,
  isRss: false,

  async testToken(token: string): Promise<TokenTestResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${BASE_URL}/${token}/job_posts`, {
        headers: { Accept: "application/json" },
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

      const body = (await res.json()) as { job_posts?: Array<{ id: string; title: string; location?: { name: string } }> };

      if (!Array.isArray(body.job_posts)) {
        return {
          token,
          status: res.status,
          ok: false,
          jobCount: 0,
          error: "Response missing 'job_posts' array",
          latencyMs: Date.now() - start,
        };
      }

      const sample = body.job_posts[0];
      return {
        token,
        status: res.status,
        ok: true,
        jobCount: body.job_posts.length,
        sampleJob: sample
          ? { id: sample.id, title: sample.title, location: sample.location?.name ?? "unknown" }
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
    const jobs = await scrapeGemBoard(token);

    return jobs.map((job) => ({
      id: job.id,
      title: job.title,
      location: job.location?.name ?? (job.is_remote ? "Remote" : "Not specified"),
      department: job.department?.name,
      isRemote: job.is_remote,
      publishedAt: job.published_at,
      compensation: job.compensation_html ? "See description" : undefined,
      descriptionHtml: job.description_html,
    }));
  },

  async scrapeJob(token: string, jobId: string) {
    return scrapeGemJob(token, jobId);
  },
};
