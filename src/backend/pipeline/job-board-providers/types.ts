/**
 * @fileoverview Job Board Provider interface and shared types.
 *
 * Defines the contract every ATS provider must implement to be registered
 * in the job board provider registry. This enables uniform health checking,
 * board scraping, and single-job extraction across Greenhouse, AshbyHQ, Gem,
 * and any future providers.
 */

import type { ScrapedPage } from "@/backend/ai/tools/browser-rendering";

// ---------------------------------------------------------------------------
// Normalized job post — common shape regardless of ATS source
// ---------------------------------------------------------------------------

export interface NormalizedJobPost {
  id: string;
  title: string;
  location: string;
  department?: string;
  isRemote: boolean;
  publishedAt?: string;
  compensation?: string;
  descriptionHtml?: string;
  descriptionText?: string;
}

// ---------------------------------------------------------------------------
// Token test result — standard output from probing one board token
// ---------------------------------------------------------------------------

export interface TokenTestResult {
  token: string;
  status: number;
  ok: boolean;
  jobCount: number;
  sampleJob?: { id: string; title: string; location: string };
  error?: string;
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * Capabilities every job board provider must expose.
 *
 * To add a new provider:
 * 1. Create a tool client in `src/backend/ai/tools/<provider>.ts`
 * 2. Create a provider wrapper implementing this interface
 * 3. Register it in `JOB_BOARD_PROVIDERS` in `index.ts`
 */
export interface JobBoardProvider {
  /** Machine key: "greenhouse" | "ashby" | "gem" */
  name: string;
  /** Display label for board def: "Greenhouse" | "AshbyHQ" | "Gem" */
  displayName: string;
  /** Config key in health_check_config (e.g. "greenhouse_tokens") */
  healthConfigKey: string;
  /** True if this provider has a structured API (maps to company_job_board_defs.is_api). */
  isApi: boolean;
  /** True if this provider supports RSS feeds (maps to company_job_board_defs.is_rss). */
  isRss: boolean;

  // --- Health ---
  /** Probe a single board token — return ok + job count. */
  testToken(token: string): Promise<TokenTestResult>;

  // --- Scraping ---
  /** Fetch all active jobs for a company board token. */
  scrapeBoard(token: string): Promise<NormalizedJobPost[]>;
  /** Fetch a single job by ID from a board. */
  scrapeJob(token: string, jobId: string): Promise<ScrapedPage>;
}
