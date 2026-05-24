/**
 * @fileoverview Tiered freelance proposal generation pipeline.
 *
 * Two generation tiers:
 *   - **Lightweight:** Single Workers AI call for smaller opportunities
 *     (fixed < $500 or hourly < $40/hr).
 *   - **Full:** NotebookLM evidence consultation via VPC tunnel → Workers AI
 *     synthesis for larger opportunities. Falls back to lightweight on
 *     VPC/NotebookLM failure.
 *
 * Uses the `draft` model from the environment-based registry and template
 * literals for all prompts (never `.join("\\n")`).
 */

import type { FreelanceOpportunity } from "@/backend/db/schemas/jobs/freelance-opportunities";
import type { FreelanceTriage } from "@/backend/db/schemas/jobs/freelance-triage";

import { getModelRegistry } from "../../models";
import { AiProvider } from "../../providers";
import { extractText } from "../../utils/extract-text";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface ProposalDraftResult {
  coverLetter: string;
  bidAmount: number;
  bidCurrency: string;
  keySellingPoints: string[];
  estimatedTimeline: string | null;
  generationTier: "lightweight" | "full";
  generationContext: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Generate a proposal draft for a freelance opportunity.
 *
 * Tier determination:
 * - `lightweight` if: fixed budget < $500 OR hourly rate < $40
 * - `full` otherwise (includes NotebookLM consultation via VPC tunnel)
 *
 * @param env - Worker environment bindings
 * @param opportunity - The freelance opportunity to draft a proposal for
 * @param triage - Optional triage result for additional context
 * @param profile - User profile config (skills, bio, rate expectations)
 * @returns Proposal draft result with cover letter, bid, and selling points
 */
export async function draftFreelanceProposal(
  env: Env,
  opportunity: FreelanceOpportunity,
  triage: FreelanceTriage | null,
  profile: Record<string, unknown>,
): Promise<ProposalDraftResult> {
  const tier = determineTier(opportunity);

  if (tier === "lightweight") {
    return generateLightweightProposal(env, opportunity, triage, profile);
  }

  // Full tier — attempt NotebookLM consultation, fall back to lightweight
  try {
    return await generateFullProposal(env, opportunity, triage, profile);
  } catch (error) {
    console.error("Full proposal generation failed, falling back to lightweight:", error);
    return generateLightweightProposal(env, opportunity, triage, profile);
  }
}

// ---------------------------------------------------------------------------
// Tier determination
// ---------------------------------------------------------------------------

function determineTier(opportunity: FreelanceOpportunity): "lightweight" | "full" {
  if (opportunity.budgetType === "fixed") {
    const maxBudget = opportunity.budgetMax ?? opportunity.budgetMin ?? 0;
    if (maxBudget < 500) return "lightweight";
  }

  if (opportunity.budgetType === "hourly") {
    const maxRate = opportunity.budgetMax ?? opportunity.budgetMin ?? 0;
    if (maxRate < 40) return "lightweight";
  }

  return "full";
}

// ---------------------------------------------------------------------------
// Lightweight tier — single Workers AI call
// ---------------------------------------------------------------------------

async function generateLightweightProposal(
  env: Env,
  opportunity: FreelanceOpportunity,
  triage: FreelanceTriage | null,
  profile: Record<string, unknown>,
): Promise<ProposalDraftResult> {
  const provider = new AiProvider(env);
  const model = getModelRegistry(env).draft;

  const skills = (profile.skills as string[]) ?? [];
  const bio = (profile.bio as string) ?? "";
  const hourlyRateMin = (profile.hourly_rate_min as number) ?? 0;
  const hourlyRateMax = (profile.hourly_rate_max as number) ?? 0;

  const triageContext = triage
    ? `
## Triage Analysis
- **Decision:** ${triage.decision}
- **Confidence:** ${triage.confidence}
- **Skills Matched:** ${(triage.skillsMatched ?? []).join(", ") || "None"}
- **Skills Missing:** ${(triage.skillsMissing ?? []).join(", ") || "None"}
- **Budget Match:** ${triage.budgetMatch ?? "Unknown"}
- **Competition:** ${triage.competitionAssessment ?? "Unknown"}
- **Win Probability:** ${triage.winProbability ?? "Unknown"}
- **Recommended Bid:** ${triage.recommendedBid != null ? `${triage.recommendedBidCurrency ?? "USD"} ${triage.recommendedBid}` : "Not specified"}`
    : "";

  const result = await provider.invokeModel(model, {
    messages: [
      {
        role: "system",
        content: `You are an expert freelance proposal writer. Craft compelling, personalized proposals that win bids.

## Candidate Profile
- **Skills:** ${skills.length > 0 ? skills.join(", ") : "(not specified)"}
- **Hourly Rate Range:** $${hourlyRateMin}–$${hourlyRateMax}/hr
${bio ? `- **Bio:** ${bio}` : ""}
${triageContext}

## Proposal Guidelines
1. **Opening Hook:** Reference a specific detail from the job posting to show you've read it carefully
2. **Relevant Experience:** Highlight 2-3 most relevant skills/experiences that directly address the client's needs
3. **Approach:** Briefly describe how you'd tackle the project (show methodology, not just capability)
4. **Timeline:** Provide a realistic timeline estimate if project scope allows
5. **Closing:** End with a confident call to action

<STRICT_OUTPUT_RULES>
Format your response EXACTLY as follows (use these exact headers):

## COVER_LETTER
[Your complete cover letter text here]

## BID_AMOUNT
[Single number — your recommended bid amount]

## BID_CURRENCY
[ISO 4217 currency code, e.g., USD]

## KEY_SELLING_POINTS
- [Point 1]
- [Point 2]
- [Point 3]

## ESTIMATED_TIMELINE
[Timeline estimate or "N/A" if not determinable]
</STRICT_OUTPUT_RULES>`,
      },
      {
        role: "user",
        content: buildOpportunityPrompt(opportunity),
      },
    ],
    temperature: 0.4,
    max_tokens: 8096,
  });

  const text = extractText(result);
  return parseProposalOutput(text, "lightweight", { model: model.id });
}

// ---------------------------------------------------------------------------
// Full tier — NotebookLM consultation + Workers AI synthesis
// ---------------------------------------------------------------------------

async function generateFullProposal(
  env: Env,
  opportunity: FreelanceOpportunity,
  triage: FreelanceTriage | null,
  profile: Record<string, unknown>,
): Promise<ProposalDraftResult> {
  const provider = new AiProvider(env);
  const model = getModelRegistry(env).draft;

  // Phase 1: Consult NotebookLM for career evidence via VPC tunnel
  const evidenceQuery = buildEvidenceQuery(opportunity);

  let notebookEvidence = "";
  try {
    const isLocal = typeof process !== "undefined" && process.env && 
      (process.env.NODE_ENV === "development" || !process.env.NODE_ENV);
    const fetchFn = isLocal
      ? fetch
      : (env as any).VPC_SERVICE
        ? (env as any).VPC_SERVICE.fetch.bind((env as any).VPC_SERVICE)
        : fetch;

    const vpcResponse = await fetchFn(
      `${env.NOTEBOOKLM_FASTAPI_URL}/notebooks/${env.CAREER_NOTEBOOKLM_ID}/chat/ask`,
      {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...(env.NOTEBOOKLM_FASTAPI_KEY ? { "x-api-key": env.NOTEBOOKLM_FASTAPI_KEY } : {}),
        },
        body: JSON.stringify({
          question: evidenceQuery,
        }),
      },
    );

    if (!vpcResponse.ok) {
      throw new Error(`VPC NotebookLM returned ${vpcResponse.status}`);
    }

    const vpcData = (await vpcResponse.json()) as { answer?: string };
    notebookEvidence = vpcData.answer ?? "";
  } catch (error) {
    console.error("NotebookLM VPC consultation failed:", error);
    throw error; // Let the caller fall back to lightweight
  }

  // Phase 2: Workers AI synthesizes evidence + requirements into proposal
  const skills = (profile.skills as string[]) ?? [];
  const bio = (profile.bio as string) ?? "";
  const hourlyRateMin = (profile.hourly_rate_min as number) ?? 0;
  const hourlyRateMax = (profile.hourly_rate_max as number) ?? 0;

  const triageContext = triage
    ? `
## Triage Analysis
- **Decision:** ${triage.decision}
- **Confidence:** ${triage.confidence}
- **Skills Matched:** ${(triage.skillsMatched ?? []).join(", ") || "None"}
- **Skills Missing:** ${(triage.skillsMissing ?? []).join(", ") || "None"}
- **Win Probability:** ${triage.winProbability ?? "Unknown"}
- **Recommended Bid:** ${triage.recommendedBid != null ? `${triage.recommendedBidCurrency ?? "USD"} ${triage.recommendedBid}` : "Not specified"}`
    : "";

  const result = await provider.invokeModel(model, {
    messages: [
      {
        role: "system",
        content: `You are an expert freelance proposal writer with deep knowledge of the candidate's career history. Craft a compelling, evidence-backed proposal that leverages specific career achievements.

## Candidate Profile
- **Skills:** ${skills.length > 0 ? skills.join(", ") : "(not specified)"}
- **Hourly Rate Range:** $${hourlyRateMin}–$${hourlyRateMax}/hr
${bio ? `- **Bio:** ${bio}` : ""}

## Career Evidence (from Knowledge Base)
${notebookEvidence || "(No evidence available — focus on listed skills)"}
${triageContext}

## Full Proposal Guidelines
1. **Opening Hook:** Reference a specific project detail AND relate it to a specific career achievement
2. **Quantified Claims:** Use specific metrics from career evidence (e.g., "$16M saved", "300% adoption", "70% time reduction")
3. **Technical Approach:** Describe architecture or methodology with enough detail to demonstrate expertise
4. **Relevant Case Study:** Reference the most relevant past project with concrete outcomes
5. **Timeline & Milestones:** Break the project into phases with estimates
6. **Risk Mitigation:** Address potential concerns proactively
7. **Closing:** Confident call to action referencing a unique value proposition

<STRICT_OUTPUT_RULES>
Format your response EXACTLY as follows (use these exact headers):

## COVER_LETTER
[Your complete cover letter text here — include quantified claims from career evidence]

## BID_AMOUNT
[Single number — your recommended bid amount]

## BID_CURRENCY
[ISO 4217 currency code, e.g., USD]

## KEY_SELLING_POINTS
- [Point 1 with metric]
- [Point 2 with metric]
- [Point 3 with metric]
- [Point 4 with metric]

## ESTIMATED_TIMELINE
[Detailed timeline with milestones, or "N/A" if not determinable]
</STRICT_OUTPUT_RULES>`,
      },
      {
        role: "user",
        content: buildOpportunityPrompt(opportunity),
      },
    ],
    temperature: 0.4,
    max_tokens: 8096,
  });

  const text = extractText(result);
  return parseProposalOutput(text, "full", {
    model: model.id,
    notebookEvidenceLength: notebookEvidence.length,
  });
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildOpportunityPrompt(opportunity: FreelanceOpportunity): string {
  const skillsList = opportunity.skillsJson ?? [];
  const budgetStr =
    opportunity.budgetType === "hourly"
      ? `Hourly: ${opportunity.budgetCurrency ?? "USD"} ${opportunity.budgetMin ?? "?"}–${opportunity.budgetMax ?? "?"}/hr`
      : `Fixed: ${opportunity.budgetCurrency ?? "USD"} ${opportunity.budgetMin ?? "?"}–${opportunity.budgetMax ?? "?"}`;

  return `## Freelance Opportunity

- **Title:** ${opportunity.title}
- **Platform:** ${opportunity.platform}
- **Description:**
${opportunity.description}

- **Required Skills:** ${skillsList.length > 0 ? skillsList.join(", ") : "(none listed)"}
- **Budget:** ${budgetStr}
- **Experience Level:** ${opportunity.experienceLevel ?? "Not specified"}
- **Project Length:** ${opportunity.projectLength ?? "Not specified"}
- **Hours/Week:** ${opportunity.hoursPerWeek ?? "Not specified"}
- **Client Score:** ${opportunity.clientScore ?? "N/A"}/5.0
- **Client Spend:** ${opportunity.clientSpent ?? "N/A"}
- **Client Hires:** ${opportunity.clientHires ?? "N/A"}
- **Client Verified:** ${opportunity.clientVerified ? "Yes" : "No"}
- **Category:** ${opportunity.categoryName ?? "Not specified"}

Write the proposal now.`;
}

function buildEvidenceQuery(opportunity: FreelanceOpportunity): string {
  const skillsList = opportunity.skillsJson ?? [];

  return `I need to write a compelling freelance proposal for this opportunity. What specific career evidence, projects, and achievements are most relevant?

Title: ${opportunity.title}
Required Skills: ${skillsList.length > 0 ? skillsList.join(", ") : "Not specified"}
Description: ${opportunity.description.slice(0, 2000)}

<STRICT_VERBATIM_EXTRACTION>
Please cite specific examples with dates, metrics, and outcomes. Focus on achievements that demonstrate expertise in: ${skillsList.join(", ")}.
Do NOT summarize or shorten the facts.
</STRICT_VERBATIM_EXTRACTION>`;
}

// ---------------------------------------------------------------------------
// Output parser
// ---------------------------------------------------------------------------

function parseProposalOutput(
  text: string,
  tier: "lightweight" | "full",
  generationContext: Record<string, unknown>,
): ProposalDraftResult {
  const coverLetter = extractSection(text, "COVER_LETTER") || text;
  const bidAmountStr = extractSection(text, "BID_AMOUNT") || "0";
  const bidCurrency = extractSection(text, "BID_CURRENCY") || "USD";
  const sellingPointsRaw = extractSection(text, "KEY_SELLING_POINTS") || "";
  const timeline = extractSection(text, "ESTIMATED_TIMELINE") || null;

  const bidAmount = parseFloat(bidAmountStr.replace(/[^0-9.]/g, "")) || 0;

  const keySellingPoints = sellingPointsRaw
    .split("\n")
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter((line) => line.length > 0);

  return {
    coverLetter,
    bidAmount,
    bidCurrency: bidCurrency.trim().toUpperCase(),
    keySellingPoints,
    estimatedTimeline: timeline === "N/A" ? null : timeline,
    generationTier: tier,
    generationContext,
  };
}

function extractSection(text: string, sectionName: string): string | null {
  const pattern = new RegExp(`## ${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, "i");
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? null;
}
