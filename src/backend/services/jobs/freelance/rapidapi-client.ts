/**
 * @fileoverview RapidAPI client for Upwork and Freelancer.com job search APIs.
 *
 * Provides a unified interface for searching both platforms with:
 * - Platform-specific parameter mapping
 * - Content-hash dedup (SHA-256 of title + description)
 * - Cursor-based pagination via x-cursor header
 * - Rate limit tracking via response headers
 * - Exponential backoff for 429 responses
 * - 5-second timeout per request
 * - Universal usage tracking via RapidApiUsageTracker
 */

import { getRapidApiKey } from "@/backend/utils/secrets";
import { RapidApiUsageTracker } from "@/backend/services/rapidapi-usage-tracker";

import type { NewFreelanceOpportunity } from "@/backend/db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Platform = "upwork" | "freelancer";

export interface UpworkSearchParams {
  q?: string;
  skills?: string;
  hourly_min_usd?: number;
  hourly_max_usd?: number;
  fixed_min_usd?: number;
  fixed_max_usd?: number;
  budget_type?: "fixed" | "hourly";
  experience_level?: "entry" | "intermediate" | "expert";
  location?: string;
  premium?: boolean;
  project_length?: string;
  hours_per_week?: number;
  limit?: number;
  sort_order?: "desc" | "asc";
}

export interface FreelancerSearchParams {
  q?: string;
  skills?: string;
  project_type?: "fixed" | "hourly";
  budget_min?: number;
  budget_max?: number;
  currency?: string;
  language?: string;
  is_urgent?: boolean;
  is_nda?: boolean;
  limit?: number;
  sort_order?: "desc" | "asc";
}

export interface UpworkJob {
  id: string;
  type: "fixed" | "hourly";
  title: string;
  created_at: string;
  time: string;
  info: string;
  description: string;
  skills: string; // Comma-separated list of skills
  url: string;
}

export interface FreelancerJob {
  project_id: number;
  url: string;
  title: string;
  description: string;
  skills: Array<{ id: number; name: string; category_id: number; category_name: string }>;
  project_type: string;
  budget_min: number;
  budget_max: number;
  budget_currency_code: string;
  budget_currency_name: string;
  bid_count: number;
  bid_avg: number;
  bid_deadline: string;
  time_free_bids_expire?: string;
  status: string;
  language: string;
  end_time: string;
  is_featured: boolean;
  is_urgent: boolean;
  is_nda: boolean;
  is_sealed: boolean;
  is_qualified?: boolean;
  is_enterprise?: boolean;
  is_fulltime?: boolean;
  hourly_commitment_hours?: number;
  hourly_commitment_interval?: string;
  client_country: string;
  client_city: string;
  client_country_code: string;
  client_member_since: string;
  client_rating_avg: number;
  client_review_count: number;
  client_payment_verified: boolean;
  client_email_verified?: boolean;
  client_phone_verified: boolean;
  client_deposit_made?: boolean;
  published_at: string;
}

export interface ApiResponse<T> {
  data: T[];
  next_cursor: string | null;
  meta: {
    total_rows_served: number;
    request_cost: number;
    job_cost: number;
  };
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const REQUEST_TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

export class RapidApiClient {
  private rateLimits: RateLimitInfo | null = null;
  private tracker: RapidApiUsageTracker;

  constructor(private env: Env) {
    this.tracker = new RapidApiUsageTracker(env);
  }

  /**
   * Search Upwork job listings.
   */
  async searchUpwork(
    params: UpworkSearchParams,
    cursor?: string,
  ): Promise<ApiResponse<UpworkJob>> {
    const host = this.env.RAPIDAPI_HOST_UPWORK;
    const url = `https://${host}/upwork/search-jobs`;

    const query = params.q || params.skills || this.env.FREELANCE_SCAN_SKILLS || "React, TypeScript, Node.js";

    let difficulty = "entry, intermediate, expert";
    if (params.experience_level) {
      difficulty = params.experience_level;
    } else if (this.env.FREELANCE_DEFAULT_EXPERIENCE) {
      difficulty = this.env.FREELANCE_DEFAULT_EXPERIENCE;
    }

    const minHourly = params.hourly_min_usd ?? (this.env.FREELANCE_DEFAULT_HOURLY_MIN ? parseInt(this.env.FREELANCE_DEFAULT_HOURLY_MIN, 10) : undefined);

    const body = {
      query: query,
      type: params.budget_type || "hourly, fixed",
      sort: params.sort_order === "asc" ? "relevance" : "recency",
      difficulty: difficulty,
      duration: "less_than_1_month, 1_to_3_months, 3_to_6_months, more_than_6_months",
      hours_per_week: "less_than_30, more_than_30",
      client_hires: "0, 1-9, 10+",
      client_location: params.location || "United States",
      min_hourly_rate: minHourly,
      max_hourly_rate: params.hourly_max_usd,
      min_fixed_budget: params.fixed_min_usd,
      max_fixed_budget: params.fixed_max_usd,
    };

    return this.fetchWithRetry<UpworkJob>(
      url,
      host,
      cursor,
      0,
      "POST",
      body,
    );
  }

  /**
   * Search Freelancer.com job listings.
   */
  async searchFreelancer(
    params: FreelancerSearchParams,
    cursor?: string,
  ): Promise<ApiResponse<FreelancerJob>> {
    const url = new URL(`https://${this.env.RAPIDAPI_HOST_FREELANCER}/freelancer`);
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null) url.searchParams.set(key, String(val));
    }
    return this.fetchWithRetry<FreelancerJob>(
      url.toString(),
      this.env.RAPIDAPI_HOST_FREELANCER,
      cursor,
    );
  }

  /** Current rate limit state (populated after first request). */
  getRateLimits(): RateLimitInfo | null {
    return this.rateLimits;
  }

  // ---------------------------------------------------------------------------
  // Normalizers
  // ---------------------------------------------------------------------------

  /**
   * Normalize an Upwork API job into the `freelance_opportunities` insert shape.
   */
  static normalizeUpwork(raw: UpworkJob): Omit<NewFreelanceOpportunity, "id"> {
    const now = new Date();
    
    let budgetMin: number | null = null;
    let budgetMax: number | null = null;

    if (raw.info) {
      const cleanInfo = raw.info.replace(/[$,]/g, "");
      if (raw.type === "fixed") {
        const match = cleanInfo.match(/(\d+(?:\.\d+)?)/);
        if (match) {
          budgetMax = parseFloat(match[1]);
          budgetMin = budgetMax;
        }
      } else if (raw.type === "hourly") {
        const matchRange = cleanInfo.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
        if (matchRange) {
          budgetMin = parseFloat(matchRange[1]);
          budgetMax = parseFloat(matchRange[2]);
        } else {
          const matchSingle = cleanInfo.match(/(\d+(?:\.\d+)?)/);
          if (matchSingle) {
            budgetMin = parseFloat(matchSingle[1]);
            budgetMax = budgetMin;
          }
        }
      }
    }

    const skillsJson = raw.skills
      ? raw.skills.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    return {
      platform: "upwork",
      platformJobId: raw.id,
      url: raw.url,
      title: raw.title,
      description: raw.description,
      skillsJson,
      budgetType: raw.type,
      budgetMin,
      budgetMax,
      budgetCurrency: "USD",
      experienceLevel: null,
      projectLength: null,
      hoursPerWeek: null,
      clientLocation: null,
      clientCountryCode: null,
      clientSpent: null,
      clientScore: null,
      clientHires: null,
      clientFeedbackCount: null,
      clientMemberSince: null,
      clientVerified: true, // Upwork doesn't expose this field directly
      proposalsCount: null,
      isPremium: false,
      isUrgent: false,
      isNda: false,
      categoryName: null,
      bidAvg: null,
      bidDeadline: null,
      publishedAt: raw.created_at ? new Date(raw.created_at) : now,
      firstSeenAt: now,
      lastSeenAt: now,
      isActive: true,
      contentHash: null, // Will be set by service layer
      rawApiResponse: raw as unknown as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Normalize a Freelancer.com API job into the `freelance_opportunities` insert shape.
   */
  static normalizeFreelancer(raw: FreelancerJob): Omit<NewFreelanceOpportunity, "id"> {
    const now = new Date();
    return {
      platform: "freelancer",
      platformJobId: String(raw.project_id),
      url: raw.url,
      title: raw.title,
      description: raw.description,
      skillsJson: raw.skills.map((s) => s.name),
      budgetType: raw.project_type as "fixed" | "hourly" | undefined,
      budgetMin: raw.budget_min,
      budgetMax: raw.budget_max,
      budgetCurrency: raw.budget_currency_code,
      experienceLevel: null,
      projectLength: null,
      hoursPerWeek: raw.hourly_commitment_hours
        ? `${raw.hourly_commitment_hours} hrs/${raw.hourly_commitment_interval ?? "week"}`
        : null,
      clientLocation: [raw.client_city, raw.client_country].filter(Boolean).join(", "),
      clientCountryCode: raw.client_country_code,
      clientSpent: null,
      clientScore: raw.client_rating_avg,
      clientHires: null,
      clientFeedbackCount: raw.client_review_count,
      clientMemberSince: raw.client_member_since,
      clientVerified: raw.client_payment_verified,
      proposalsCount: String(raw.bid_count),
      isPremium: raw.is_featured,
      isUrgent: raw.is_urgent,
      isNda: raw.is_nda,
      categoryName: raw.skills[0]?.category_name ?? null,
      bidAvg: raw.bid_avg,
      bidDeadline: raw.bid_deadline ? new Date(raw.bid_deadline) : null,
      publishedAt: new Date(raw.published_at),
      firstSeenAt: now,
      lastSeenAt: now,
      isActive: true,
      contentHash: null, // Will be set by service layer
      rawApiResponse: raw as unknown as Record<string, unknown>,
      createdAt: now,
      updatedAt: now,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private async fetchWithRetry<T>(
    url: string,
    host: string,
    cursor?: string,
    attempt = 0,
    method: "GET" | "POST" = "GET",
    body?: any,
  ): Promise<ApiResponse<T>> {
    // Pre-flight: check monthly budget before making the call
    if (attempt === 0) {
      const budget = await this.tracker.checkBudget();
      if (!budget.allowed) {
        throw new Error(
          `RapidAPI monthly budget exhausted: ${budget.used}/${budget.limit} calls used in ${budget.currentMonth}`,
        );
      }
    }

    const apiKey = await getRapidApiKey(this.env);
    const start = Date.now();
    let status = 0;
    let responseBytes = 0;
    let errorMsg: string | undefined;

    const headers: Record<string, string> = {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": host,
    };
    if (cursor) {
      headers["x-cursor"] = cursor;
    }
    if (method === "POST") {
      headers["Content-Type"] = "application/json";
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: method === "POST" && body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      status = response.status;

      // Track rate limits
      const limitHeader = response.headers.get("x-rate-limit-limit");
      const remainingHeader = response.headers.get("x-rate-limit-remaining");
      const resetHeader = response.headers.get("x-rate-limit-reset");
      if (limitHeader) {
        this.rateLimits = {
          limit: parseInt(limitHeader, 10),
          remaining: parseInt(remainingHeader ?? "0", 10),
          reset: parseInt(resetHeader ?? "0", 10),
        };
      }

      // Handle rate limiting with exponential backoff
      if (response.status === 429 && attempt < MAX_RETRIES) {
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, backoff));
        return this.fetchWithRetry<T>(url, host, cursor, attempt + 1, method, body);
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "Unknown error");
        responseBytes = new TextEncoder().encode(errorBody).byteLength;
        errorMsg = `RapidAPI ${host} returned ${response.status}: ${errorBody}`;
        throw new Error(errorMsg);
      }

      const responseText = await response.text();
      responseBytes = new TextEncoder().encode(responseText).byteLength;
      
      const parsed = JSON.parse(responseText);

      // Normalization of response envelope for the new Upwork API
      if (host === this.env.RAPIDAPI_HOST_UPWORK && parsed && "response" in parsed) {
        const jobs = parsed.response || [];
        return {
          data: jobs as unknown as T[],
          next_cursor: null,
          meta: {
            total_rows_served: jobs.length,
            request_cost: 1,
            job_cost: jobs.length,
          },
        };
      }

      return parsed as ApiResponse<T>;
    } catch (e) {
      errorMsg = errorMsg ?? (e instanceof Error ? e.message : String(e));
      throw e;
    } finally {
      // Post-flight: log usage (non-blocking)
      const durationMs = Date.now() - start;
      const parsedUrl = new URL(url);
      await this.tracker.logCall({
        apiHost: host,
        apiEndpoint: parsedUrl.pathname,
        requestParams: method === "POST" && body ? body : Object.fromEntries(parsedUrl.searchParams.entries()),
        responseStatus: status || 0,
        responseBytes,
        durationMs,
        error: errorMsg,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Content hash utility
// ---------------------------------------------------------------------------

/**
 * Generate a SHA-256 content hash of title + description for dedup.
 */
export async function generateContentHash(title: string, description: string): Promise<string> {
  const data = new TextEncoder().encode(`${title}\n${description}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
