/**
 * @fileoverview Job Board Provider Registry.
 *
 * Single source of truth for all ATS job board API providers.
 *
 * To onboard a new provider:
 * 1. Create a tool client in `src/backend/ai/tools/<provider>.ts`
 * 2. Create a provider wrapper in this directory implementing `JobBoardProvider`
 * 3. Import it here and add to the `JOB_BOARD_PROVIDERS` array
 * 4. Create a health check in `src/backend/health/checks/job-board-apis/`
 * 5. Add seed data to `JOB_BOARD_DEF_SEEDS` in config.ts
 */

import { ashbyProvider } from "./ashby";
import { gemProvider } from "./gem";
import { greenhouseProvider } from "./greenhouse";

import type { JobBoardProvider } from "./types";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** All registered job board API providers. Add new ones here. */
export const JOB_BOARD_PROVIDERS: JobBoardProvider[] = [
  greenhouseProvider,
  ashbyProvider,
  gemProvider,
];

/** Look up a provider by system name (e.g. "greenhouse", "ashby", "gem"). */
export function getProviderByName(name: string): JobBoardProvider | undefined {
  return JOB_BOARD_PROVIDERS.find((p) => p.name === name);
}

// ---------------------------------------------------------------------------
// Auto-detection helpers
// ---------------------------------------------------------------------------

/**
 * Attempt to detect the correct provider from the jobSiteId format.
 *
 * Heuristics:
 * - Numeric-only IDs (e.g. "4389271") → Greenhouse
 * - UUID / long hex-dash strings → Ashby
 * - Everything else → undefined (caller handles fallback)
 */
export function detectProviderByJobId(jobSiteId: string): JobBoardProvider | undefined {
  if (/^\d+$/.test(jobSiteId)) return getProviderByName("greenhouse");
  if (/^[a-f0-9-]{20,}$/i.test(jobSiteId)) return getProviderByName("ashby");
  return undefined;
}

/**
 * Unified entry point for scraping a single job from any registered board.
 *
 * Resolution order:
 * 1. Explicit `sourceSystem` (from api_companies.system) → direct registry lookup
 * 2. ID-format heuristic via `detectProviderByJobId`
 * 3. Returns `null` if no provider can be resolved (caller handles fallback)
 */
export async function scrapeJobFromBoard(opts: {
  boardToken: string;
  jobSiteId: string;
  sourceSystem?: string;
}): Promise<{ text: string; provider: string } | null> {
  const { boardToken, jobSiteId, sourceSystem } = opts;

  // 1. Explicit system match
  let provider = sourceSystem ? getProviderByName(sourceSystem) : undefined;

  // 2. ID-format heuristic
  if (!provider) {
    provider = detectProviderByJobId(jobSiteId);
  }

  if (!provider) return null;

  console.log(`[job-board-scraper] Scraping ${provider.name} job: ${boardToken}/${jobSiteId}`);
  const result = await provider.scrapeJob(boardToken, jobSiteId);

  return { text: result.text, provider: provider.name };
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type { JobBoardProvider, NormalizedJobPost, TokenTestResult } from "./types";
