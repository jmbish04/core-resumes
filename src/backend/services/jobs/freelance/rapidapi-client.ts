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
 */

import { getRapidApiKey } from "@/backend/utils/secrets";

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
  job_id: string;
  url: string;
  title: string;
  description: string;
  skills: string[];
  budget_type: string;
  budget_total_usd: string | null;
  experience_level: string;
  location: string;
  project_length: string;
  hours_per_week: string;
  proposals: string;
  client_total_hires: number;
  client_active_hires: number;
  client_spent: string;
  client_company_size: string;
  client_member_since: string;
  client_score: number;
  client_feedback_count: number;
  total_jobs_with_hires: number;
  is_enterprise: boolean;
  open_count: number;
  premium: boolean;
  category_name: string;
  category_group_name: string;
  is_contract_to_hire: boolean;
  published_at: string;
  renewed_on: string | null;
  interviewing: string;
  invites_sent: string;
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

  constructor(private env: Env) {}

  /**
   * Search Upwork job listings.
   */
  async searchUpwork(
    params: UpworkSearchParams,
    cursor?: string,
  ): Promise<ApiResponse<UpworkJob>> {
    const url = new URL(`https://${this.env.RAPIDAPI_HOST_UPWORK}/upwork`);
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined && val !== null) url.searchParams.set(key, String(val));
    }
    return this.fetchWithRetry<UpworkJob>(url.toString(), this.env.RAPIDAPI_HOST_UPWORK, cursor);
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
    return {
      platform: "upwork",
      platformJobId: raw.job_id,
      url: raw.url,
      title: raw.title,
      description: raw.description,
      skillsJson: raw.skills,
      budgetType: raw.budget_type as "fixed" | "hourly" | undefined,
      budgetMin: null,
      budgetMax: raw.budget_total_usd ? parseFloat(raw.budget_total_usd) : null,
      budgetCurrency: "USD",
      experienceLevel: raw.experience_level,
      projectLength: raw.project_length,
      hoursPerWeek: raw.hours_per_week,
      clientLocation: raw.location,
      clientCountryCode: null,
      clientSpent: raw.client_spent,
      clientScore: raw.client_score,
      clientHires: raw.client_total_hires,
      clientFeedbackCount: raw.client_feedback_count,
      clientMemberSince: raw.client_member_since,
      clientVerified: true, // Upwork doesn't expose this field directly
      proposalsCount: raw.proposals,
      isPremium: raw.premium,
      isUrgent: false,
      isNda: false,
      categoryName: raw.category_name,
      bidAvg: null,
      bidDeadline: null,
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
  ): Promise<ApiResponse<T>> {
    const apiKey = await getRapidApiKey(this.env);

    const headers: Record<string, string> = {
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": host,
    };
    if (cursor) {
      headers["x-cursor"] = cursor;
    }

    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

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
      return this.fetchWithRetry<T>(url, host, cursor, attempt + 1);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(`RapidAPI ${host} returned ${response.status}: ${errorBody}`);
    }

    return (await response.json()) as ApiResponse<T>;
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
