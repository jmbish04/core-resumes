/**
 * @fileoverview Deep analysis of a single freelance opportunity.
 *
 * Produces a comprehensive evaluation including:
 *   - Client quality composite score (weighted from rating, spend, hires, tenure, verification)
 *   - Competition analysis relative to budget range
 *   - Budget alignment against profile rate expectations
 *   - Win probability heuristic combining all signals
 *   - Personalized negotiation strategy
 *   - Red flag detection (scope creep, payment risks, JD traps)
 *   - Final recommendation with detailed reasoning
 *
 * Uses the `analyze` model (kimi-k2.5) from the environment-based
 * registry for deeper reasoning via structured output.
 */

import { z } from "zod";

import type { FreelanceOpportunity } from "@/backend/db/schemas/pipeline/freelance/freelance-opportunities";

import { getModelRegistry } from "../../models";
import { AiProvider } from "../../providers";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface OpportunityAnalysis {
  clientQualityScore: number;
  clientQualityBreakdown: {
    ratingScore: number;
    spendScore: number;
    hiresScore: number;
    tenureScore: number;
    verificationScore: number;
  };
  competitionAnalysis: string;
  budgetAlignment: string;
  winProbability: number;
  negotiationStrategy: string;
  redFlags: string[];
  recommendation: "bid" | "skip" | "negotiate";
  recommendationRationale: string;
}

// ---------------------------------------------------------------------------
// Structured output schema
// ---------------------------------------------------------------------------

const OpportunityAnalysisSchema = z.object({
  client_quality_score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Composite client quality score (0–100), weighted from sub-scores"),
  client_quality_breakdown: z.object({
    rating_score: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("Score based on client feedback rating (0–100). 5.0 = 100, 4.0 = 70, <3.0 = 20, no rating = 40"),
    spend_score: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("Score based on total platform spend (0–100). >$100K = 100, >$10K = 70, >$1K = 40, <$1K = 20"),
    hires_score: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("Score based on total hires (0–100). >50 = 100, >10 = 70, >3 = 40, ≤3 = 20"),
    tenure_score: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("Score based on account age (0–100). >5yr = 100, >2yr = 70, >1yr = 40, <1yr = 20"),
    verification_score: z
      .number()
      .int()
      .min(0)
      .max(100)
      .describe("Score based on payment verification (0–100). Verified = 100, Unverified = 20"),
  }),
  competition_analysis: z
    .string()
    .describe("Detailed assessment of competitive landscape — proposal count vs typical for budget range, avg bid positioning"),
  budget_alignment: z
    .string()
    .describe("Analysis of budget fit against candidate rate expectations — effective hourly rate calculation for fixed-price"),
  win_probability: z
    .number()
    .min(0)
    .max(1)
    .describe("Estimated win probability (0.0–1.0) combining all signals"),
  negotiation_strategy: z
    .string()
    .describe("Personalized negotiation approach — leverage points, anchoring strategy, and value framing"),
  red_flags: z
    .array(z.string())
    .describe("Array of identified red flags — scope creep risks, payment risks, JD traps, unrealistic expectations"),
  recommendation: z
    .enum(["bid", "skip", "negotiate"])
    .describe("Final verdict — bid (proceed), skip (avoid), or negotiate (counter-offer)"),
  recommendation_rationale: z
    .string()
    .describe("Comprehensive reasoning for the recommendation, referencing specific evidence from the analysis"),
});

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Perform a deep analysis of a single freelance opportunity.
 *
 * @param env - Worker environment bindings
 * @param opportunity - The freelance opportunity to analyze
 * @param profile - User profile config (skills, rate expectations)
 * @returns Comprehensive opportunity analysis with scores and recommendation
 */
export async function analyzeFreelanceOpportunity(
  env: Env,
  opportunity: FreelanceOpportunity,
  profile: Record<string, unknown>,
): Promise<OpportunityAnalysis> {
  const provider = new AiProvider(env);
  const model = getModelRegistry(env).analyze;

  const skills = (profile.skills as string[]) ?? [];
  const hourlyRateMin = (profile.hourly_rate_min as number) ?? 0;
  const hourlyRateMax = (profile.hourly_rate_max as number) ?? 0;
  const yearsExperience = (profile.years_experience as number) ?? 0;

  const result = await provider.generateStructuredAnalysis({
    messages: [
      {
        role: "system",
        content: buildSystemPrompt(skills, hourlyRateMin, hourlyRateMax, yearsExperience),
      },
      {
        role: "user",
        content: buildUserPrompt(opportunity),
      },
    ],
    schema: OpportunityAnalysisSchema,
    schemaName: "OpportunityAnalysis",
    temperature: 0,
    max_tokens: 8096,
    model,
  });

  return {
    clientQualityScore: result.client_quality_score,
    clientQualityBreakdown: {
      ratingScore: result.client_quality_breakdown.rating_score,
      spendScore: result.client_quality_breakdown.spend_score,
      hiresScore: result.client_quality_breakdown.hires_score,
      tenureScore: result.client_quality_breakdown.tenure_score,
      verificationScore: result.client_quality_breakdown.verification_score,
    },
    competitionAnalysis: result.competition_analysis,
    budgetAlignment: result.budget_alignment,
    winProbability: result.win_probability,
    negotiationStrategy: result.negotiation_strategy,
    redFlags: result.red_flags,
    recommendation: result.recommendation,
    recommendationRationale: result.recommendation_rationale,
  };
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  skills: string[],
  hourlyRateMin: number,
  hourlyRateMax: number,
  yearsExperience: number,
): string {
  return `You are an expert freelance market analyst performing a deep evaluation of a freelance opportunity.

## Candidate Context
- **Skills:** ${skills.length > 0 ? skills.join(", ") : "(not specified)"}
- **Years of Experience:** ${yearsExperience || "(not specified)"}
- **Hourly Rate Range:** $${hourlyRateMin}–$${hourlyRateMax}/hr

## Evaluation Framework

### Client Quality Score (0–100)
Compute a weighted composite from 5 sub-scores:
- **Rating (25%):** Based on client_score (0.0–5.0). No rating = 40 (neutral).
- **Spend (25%):** Based on total platform spend. Parse "$10K+" strings to estimate.
- **Hires (20%):** Based on hire count. More hires = more experienced client.
- **Tenure (15%):** Based on member_since date. Longer tenure = more established.
- **Verification (15%):** Payment verification status. Verified = trustworthy.

Formula: (rating × 0.25) + (spend × 0.25) + (hires × 0.20) + (tenure × 0.15) + (verification × 0.15)

### Competition Analysis
- Compare proposal count against typical ranges for the budget level
- Low budget (<$500): 20-50 proposals is normal
- Mid budget ($500-$5K): 10-30 proposals is normal
- High budget (>$5K): 5-15 proposals is normal
- Analyze average bid relative to budget bounds
- More proposals + lower bids = fierce competition

### Budget Alignment
- For hourly: compare directly against the candidate's rate range
- For fixed-price: estimate effective hourly rate using scope/timeline cues
- Account for project length and expected hours
- Classify fit: below_range, low_end, in_range, above_range

### Win Probability (0.0–1.0)
Weighted heuristic:
- Skill match (40%): What % of required skills does the candidate have?
- Budget fit (25%): Is the budget compatible with rate expectations?
- Competition (20%): How crowded is the field?
- Client quality (15%): Better clients = more likely to hire quality freelancers

### Negotiation Strategy
Personalized leverage points:
- If overqualified: justify premium with specific capability differentiators
- If competitive field: identify unique angles to stand out
- If budget is low: propose phased approach or scope reduction
- If client is new: suggest milestone-based payments for mutual protection

### Red Flag Detection
Check for:
- **Scope Creep Risks:** Vague requirements, "and more...", open-ended deliverables
- **Payment Risks:** Unverified client, zero spend history, no prior hires
- **JD Traps:** Unrealistic skill combinations, below-market rates for expert work
- **Timeline Risks:** "ASAP" or impossible deadlines for the scope
- **NDA Concerns:** NDA required before seeing full scope
- **Rate Arbitrage:** Client location in high-cost area but budget at emerging-market rates

You must respond with a valid JSON object matching the requested schema exactly.
DO NOT wrap your response in markdown fences.`;
}

function buildUserPrompt(opportunity: FreelanceOpportunity): string {
  const skillsList = opportunity.skillsJson ?? [];
  const budgetStr =
    opportunity.budgetType === "hourly"
      ? `Hourly: ${opportunity.budgetCurrency ?? "USD"} ${opportunity.budgetMin ?? "?"}–${opportunity.budgetMax ?? "?"}/hr`
      : `Fixed: ${opportunity.budgetCurrency ?? "USD"} ${opportunity.budgetMin ?? "?"}–${opportunity.budgetMax ?? "?"}`;

  return `## Freelance Opportunity — Deep Analysis

### Listing Details
- **Title:** ${opportunity.title}
- **Platform:** ${opportunity.platform}
- **URL:** ${opportunity.url}
- **Category:** ${opportunity.categoryName ?? "Not specified"}
- **Experience Level:** ${opportunity.experienceLevel ?? "Not specified"}
- **Project Length:** ${opportunity.projectLength ?? "Not specified"}
- **Hours/Week:** ${opportunity.hoursPerWeek ?? "Not specified"}
- **Premium Listing:** ${opportunity.isPremium ? "Yes" : "No"}
- **Urgent:** ${opportunity.isUrgent ? "Yes" : "No"}
- **NDA Required:** ${opportunity.isNda ? "Yes" : "No"}

### Description
${opportunity.description}

### Required Skills
${skillsList.length > 0 ? (skillsList as string[]).map((s: string) => `- ${s}`).join("\n") : "(none listed)"}

### Budget
- **Type:** ${opportunity.budgetType ?? "Not specified"}
- **Range:** ${budgetStr}
- **Average Bid:** ${opportunity.bidAvg != null ? `${opportunity.budgetCurrency ?? "USD"} ${opportunity.bidAvg}` : "N/A"}

### Client Profile
- **Score:** ${opportunity.clientScore ?? "N/A"}/5.0
- **Total Spend:** ${opportunity.clientSpent ?? "N/A"}
- **Total Hires:** ${opportunity.clientHires ?? "N/A"}
- **Feedback Count:** ${opportunity.clientFeedbackCount ?? "N/A"}
- **Payment Verified:** ${opportunity.clientVerified ? "Yes" : "No"}
- **Member Since:** ${opportunity.clientMemberSince ?? "Unknown"}
- **Location:** ${opportunity.clientLocation ?? "Unknown"}
- **Country:** ${opportunity.clientCountryCode ?? "Unknown"}

### Competition
- **Proposals Submitted:** ${opportunity.proposalsCount ?? "N/A"}
- **Average Bid:** ${opportunity.bidAvg != null ? `${opportunity.budgetCurrency ?? "USD"} ${opportunity.bidAvg}` : "N/A"}
${opportunity.bidDeadline ? `- **Bid Deadline:** ${new Date(opportunity.bidDeadline).toISOString()}` : ""}

Analyze this opportunity now.`;
}
