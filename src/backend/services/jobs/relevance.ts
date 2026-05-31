/**
 * @fileoverview Shared job relevance utility — keyword + location matching.
 *
 * A pure, deterministic function used by ALL pipelines to decide `isRecommended`.
 * No AI involved. Loads keywords and locations from the `applicant_profile`
 * global config at call time.
 *
 * Rules:
 * - Title and/or description contains config keywords → title/description match
 * - Location is SF Bay Area, California, or fully remote → location match
 * - Both title AND location must match for isRelevant = true
 */

import { eq } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { globalConfig } from "@/backend/db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RelevanceInput {
  jobTitle: string;
  location?: string | null;
  description?: string | null;
  // salary?: number | null;  — reserved for future
}

export interface RelevanceResult {
  isRelevant: boolean;
  score: number; // 0–100
  reason: string; // human-readable explanation
  signals: {
    titleMatch: boolean;
    locationMatch: boolean;
    descriptionMatch: boolean;
  };
}

interface ApplicantProfile {
  location?: string;
  locations?: string[];
  hubs?: string[];
  target_roles?: string[];
}

// ---------------------------------------------------------------------------
// Defaults (mirrors config.ts defaultConfig.applicant_profile)
// ---------------------------------------------------------------------------

const FALLBACK_PROFILE: ApplicantProfile = {
  location: "San Francisco Bay Area",
  locations: ["san francisco", "bay area", "sf", "oakland", "san jose", "california", "ca"],
  hubs: ["San Francisco", "New York", "Seattle", "Austin"],
  target_roles: ["software engineer", "frontend", "backend", "fullstack", "devops"],
};

const REMOTE_KEYWORDS = ["remote", "anywhere", "distributed", "work from home", "wfh"];

// ---------------------------------------------------------------------------
// Profile loader
// ---------------------------------------------------------------------------

async function loadApplicantProfile(env: Env): Promise<ApplicantProfile> {
  const db = getDb(env);

  try {
    const [row] = await db
      .select({ value: globalConfig.value })
      .from(globalConfig)
      .where(eq(globalConfig.key, "applicant_profile"))
      .limit(1);

    if (row?.value) {
      const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      return { ...FALLBACK_PROFILE, ...parsed };
    }
  } catch {
    // Fallback on parse error
  }

  return FALLBACK_PROFILE;
}

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

function locationMatches(location: string | null | undefined, profile: ApplicantProfile): boolean {
  if (!location) return false;
  const loc = location.toLowerCase().trim();

  // Remote is always a match
  if (REMOTE_KEYWORDS.some((kw) => loc.includes(kw))) return true;

  // Check against profile locations
  const profileLocations = profile.locations ?? FALLBACK_PROFILE.locations ?? [];
  return profileLocations.some((pl) => loc.includes(pl));
}

function titleMatches(text: string | null | undefined, profile: ApplicantProfile): boolean {
  if (!text) return false;
  const t = text.toLowerCase().trim();

  const targetRoles = profile.target_roles ?? FALLBACK_PROFILE.target_roles ?? [];
  return targetRoles.some((role) => t.includes(role));
}

function calculateScore(signals: { titleMatch: boolean; locationMatch: boolean; descriptionMatch: boolean }): number {
  let score = 0;

  if (signals.titleMatch) score += 50;
  if (signals.locationMatch) score += 40;
  if (signals.descriptionMatch && !signals.titleMatch) score += 30;

  return Math.min(score, 100);
}

function buildReason(signals: { titleMatch: boolean; locationMatch: boolean; descriptionMatch: boolean; title: string; location: string }): string {
  const parts: string[] = [];

  if (signals.titleMatch) {
    parts.push(`Title match: "${signals.title}"`);
  }
  if (signals.descriptionMatch && !signals.titleMatch) {
    parts.push(`Description keyword match`);
  }
  if (signals.locationMatch) {
    parts.push(`Location match: "${signals.location}"`);
  }

  return parts.length > 0 ? parts.join(" | ") : "No match signals";
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Evaluate a job for relevance against the applicant profile.
 *
 * Used by all pipelines at insertion time and by the discovery scorer cron.
 * Deterministic — given the same config, always returns the same result.
 */
export async function isRelevantJob(env: Env, input: RelevanceInput): Promise<RelevanceResult> {
  const profile = await loadApplicantProfile(env);

  const titleMatchResult = titleMatches(input.jobTitle, profile);
  const locationMatchResult = locationMatches(input.location, profile);
  const descriptionMatchResult = titleMatches(input.description, profile);

  const signals = {
    titleMatch: titleMatchResult,
    locationMatch: locationMatchResult,
    descriptionMatch: descriptionMatchResult,
  };

  // Both title/description AND location must match for relevance
  const hasContentMatch = titleMatchResult || descriptionMatchResult;
  const isRelevant = hasContentMatch && locationMatchResult;

  const score = calculateScore(signals);
  const reason = buildReason({
    ...signals,
    title: input.jobTitle,
    location: input.location ?? "Unknown",
  });

  return { isRelevant, score, reason, signals };
}
