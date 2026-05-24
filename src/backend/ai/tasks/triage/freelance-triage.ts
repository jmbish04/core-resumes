/**
 * @fileoverview Batch AI triage for freelance opportunities.
 *
 * Evaluates up to 10 opportunities against a user profile to produce
 * bid/skip decisions with confidence scores, skill gap analysis,
 * win probability estimates, and recommended bid strategies.
 *
 * Uses structured output via the AiProvider facade and the `analyze`
 * model from the environment-based registry.
 */

import { z } from "zod";

import type { FreelanceOpportunity } from "@/backend/db/schemas/jobs/freelance-opportunities";

import { getModelRegistry } from "../../models";
import { AiProvider } from "../../providers";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface FreelanceTriageResult {
  opportunityId: number;
  decision: "bid" | "skip" | "pending" | "manual_review";
  confidence: number;
  rationale: string;
  skillsMatched: string[];
  skillsMissing: string[];
  budgetMatch: string;
  competitionAssessment: string;
  winProbability: number;
  recommendedBid: number | null;
  recommendedBidCurrency: string;
  bidStrategy: string | null;
}

// ---------------------------------------------------------------------------
// Structured output schema
// ---------------------------------------------------------------------------

const FreelanceTriageSchema = z.object({
  decisions: z.array(
    z.object({
      opportunity_id: z.number().describe("The database ID of the freelance opportunity"),
      decision: z
        .enum(["bid", "skip", "pending", "manual_review"])
        .describe("Triage verdict — bid if strong match, skip if poor fit, manual_review if ambiguous"),
      confidence: z.number().min(0).max(1).describe("Confidence in this decision, 0.0–1.0"),
      rationale: z.string().describe("Evidence-based explanation of the triage decision"),
      skills_matched: z.array(z.string()).describe("Skills the candidate has that match the listing"),
      skills_missing: z.array(z.string()).describe("Required skills the candidate lacks"),
      budget_match: z
        .string()
        .describe("Assessment of budget alignment with rate expectations (e.g. 'below_range', 'in_range', 'above_range')"),
      competition_assessment: z
        .string()
        .describe("Assessment of competitive landscape based on proposal count and average bid"),
      win_probability: z
        .number()
        .min(0)
        .max(1)
        .describe("Estimated probability of winning this bid, 0.0–1.0"),
      recommended_bid: z
        .number()
        .nullable()
        .describe("Suggested bid amount, or null if decision is skip"),
      recommended_bid_currency: z
        .string()
        .describe("ISO 4217 currency code for the recommended bid"),
      bid_strategy: z
        .string()
        .nullable()
        .describe("Approach for the proposal (e.g. 'undercut', 'premium_value', 'competitive_match')"),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Batch-triage up to 10 freelance opportunities against a user profile.
 *
 * @param env - Worker environment bindings
 * @param opportunities - Array of freelance opportunities (max 10)
 * @param profile - User profile config (skills, rate expectations, exclusions)
 * @returns Array of triage results, one per opportunity
 */
export async function triageFreelanceOpportunities(
  env: Env,
  opportunities: FreelanceOpportunity[],
  profile: Record<string, unknown>,
): Promise<FreelanceTriageResult[]> {
  if (opportunities.length === 0) return [];
  if (opportunities.length > 10) {
    throw new Error("Batch triage supports a maximum of 10 opportunities per call");
  }

  const provider = new AiProvider(env);
  const model = getModelRegistry(env).analyze;

  // Extract profile fields with sensible defaults
  const skills = (profile.skills as string[]) ?? [];
  const hourlyRateMin = (profile.hourly_rate_min as number) ?? 0;
  const hourlyRateMax = (profile.hourly_rate_max as number) ?? 0;
  const excludedSkills = (profile.excluded_skills as string[]) ?? [];
  const excludedProjectTypes = (profile.excluded_project_types as string[]) ?? [];
  const bio = (profile.bio as string) ?? "";
  const yearsExperience = (profile.years_experience as number) ?? 0;

  const result = await provider.generateStructuredAnalysis({
    messages: [
      {
        role: "system",
        content: buildSystemPrompt(
          skills,
          hourlyRateMin,
          hourlyRateMax,
          excludedSkills,
          excludedProjectTypes,
          bio,
          yearsExperience,
        ),
      },
      {
        role: "user",
        content: buildUserPrompt(opportunities),
      },
    ],
    schema: FreelanceTriageSchema,
    schemaName: "FreelanceTriage",
    temperature: 0,
    max_tokens: 8096,
    model,
  });

  return result.decisions.map((d) => ({
    opportunityId: d.opportunity_id,
    decision: d.decision,
    confidence: d.confidence,
    rationale: d.rationale,
    skillsMatched: d.skills_matched,
    skillsMissing: d.skills_missing,
    budgetMatch: d.budget_match,
    competitionAssessment: d.competition_assessment,
    winProbability: d.win_probability,
    recommendedBid: d.recommended_bid,
    recommendedBidCurrency: d.recommended_bid_currency,
    bidStrategy: d.bid_strategy,
  }));
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildSystemPrompt(
  skills: string[],
  hourlyRateMin: number,
  hourlyRateMax: number,
  excludedSkills: string[],
  excludedProjectTypes: string[],
  bio: string,
  yearsExperience: number,
): string {
  return `You are an expert freelance career strategist evaluating batch freelance opportunities for a candidate.

## Candidate Profile
- **Skills:** ${skills.length > 0 ? skills.join(", ") : "(not specified)"}
- **Years of Experience:** ${yearsExperience || "(not specified)"}
- **Hourly Rate Range:** $${hourlyRateMin}–$${hourlyRateMax}/hr
${bio ? `- **Bio:** ${bio}` : ""}

## Exclusions
${excludedSkills.length > 0 ? `- **Excluded Skills:** ${excludedSkills.join(", ")}` : "- No excluded skills"}
${excludedProjectTypes.length > 0 ? `- **Excluded Project Types:** ${excludedProjectTypes.join(", ")}` : "- No excluded project types"}

## Evaluation Criteria

For each opportunity, evaluate:

### 1. Skill Match
- Compare required skills against the candidate's skill set
- List matched and missing skills separately
- Consider transferable skills and synonyms (e.g., "React.js" = "React")

### 2. Budget Alignment
- Compare the opportunity's budget against the candidate's rate range
- For fixed-price: estimate effective hourly rate based on project scope
- For hourly: compare directly against rate range
- Classify as: "below_range", "in_range", "above_range", or "unclear"

### 3. Client Quality Assessment
- Factor in: rating (client_score), total spend (client_spent), hire count, verified status, member tenure
- Higher spend + more hires + verified = more trustworthy client
- New accounts with no history = higher risk

### 4. Competition Analysis
- Assess proposal count relative to budget range
- Compare average bid (bid_avg) against budget bounds
- More proposals + lower avg bid = higher competition

### 5. Win Probability (0.0–1.0)
- Composite score factoring: skill match %, budget fit, competition level, client quality
- Weight skill match most heavily (40%), then budget (25%), competition (20%), client quality (15%)

### 6. Bid Recommendation
- Only recommend a bid if decision is "bid" or "pending"
- Set recommended_bid to null for "skip" decisions
- For hourly: recommend within the rate range adjusted for competition
- For fixed: estimate based on scope and rate range

## Decision Framework
- **bid**: Strong skill match (≥70%), budget in range, acceptable competition
- **skip**: Excluded skills/project types, budget far below range, poor client quality, or <40% skill match
- **pending**: Moderate match but missing key info, or borderline budget
- **manual_review**: Unusual signals (very high budget, conflicting requirements, NDA required)

<STRICT_OUTPUT_RULES>
You must evaluate EVERY opportunity provided. Do not skip any.
Return the opportunity_id exactly as given — do not invent IDs.
You must respond with a valid JSON object matching the requested schema exactly.
DO NOT wrap your response in markdown fences.
</STRICT_OUTPUT_RULES>`;
}

function buildUserPrompt(opportunities: FreelanceOpportunity[]): string {
  const sections = ["## Freelance Opportunities to Evaluate\n"];

  for (const opp of opportunities) {
    const skillsList = opp.skillsJson ?? [];
    const budgetStr =
      opp.budgetType === "hourly"
        ? `Hourly: ${opp.budgetCurrency ?? "USD"} ${opp.budgetMin ?? "?"}–${opp.budgetMax ?? "?"}/hr`
        : `Fixed: ${opp.budgetCurrency ?? "USD"} ${opp.budgetMin ?? "?"}–${opp.budgetMax ?? "?"}`;

    sections.push(`### Opportunity ID: ${opp.id}
- **Title:** ${opp.title}
- **Platform:** ${opp.platform}
- **Description:** ${opp.description.slice(0, 1500)}${opp.description.length > 1500 ? "…" : ""}
- **Required Skills:** ${skillsList.length > 0 ? skillsList.join(", ") : "(none listed)"}
- **Budget:** ${budgetStr}
- **Experience Level:** ${opp.experienceLevel ?? "Not specified"}
- **Project Length:** ${opp.projectLength ?? "Not specified"}
- **Hours/Week:** ${opp.hoursPerWeek ?? "Not specified"}
- **Client Score:** ${opp.clientScore ?? "N/A"}/5.0
- **Client Spend:** ${opp.clientSpent ?? "N/A"}
- **Client Hires:** ${opp.clientHires ?? "N/A"}
- **Client Verified:** ${opp.clientVerified ? "Yes" : "No"}
- **Client Member Since:** ${opp.clientMemberSince ?? "Unknown"}
- **Proposals Count:** ${opp.proposalsCount ?? "N/A"}
- **Average Bid:** ${opp.bidAvg != null ? `${opp.budgetCurrency ?? "USD"} ${opp.bidAvg}` : "N/A"}
- **Category:** ${opp.categoryName ?? "Not specified"}
- **Premium:** ${opp.isPremium ? "Yes" : "No"}
- **Urgent:** ${opp.isUrgent ? "Yes" : "No"}
- **NDA Required:** ${opp.isNda ? "Yes" : "No"}
`);
  }

  return sections.join("\n");
}
