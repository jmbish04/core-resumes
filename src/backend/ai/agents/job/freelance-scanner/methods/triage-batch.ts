/**
 * @fileoverview Batch AI triage for untriaged freelance opportunities.
 *
 * Evaluates each opportunity against the user's freelance profile for:
 * skill match, budget alignment, client quality, competition level,
 * and estimated win probability.
 */
import { FreelanceService } from "@/backend/services/jobs/freelance/freelance-service";
import { Logger } from "@/backend/lib/logger";

import type { FreelanceScannerAgent } from "../index";

interface TriageDecision {
  opportunityId: number;
  decision: "bid" | "skip" | "manual_review";
  confidence: number;
  rationale: string;
  skillsMatched: string[];
  skillsMissing: string[];
  budgetMatch: string;
  competitionAssessment: string;
  winProbability: number;
  recommendedBid: number | null;
  recommendedBidCurrency: string;
  bidStrategy: string;
}

interface AiTriageResponse {
  decisions: TriageDecision[];
}

export async function handleTriageBatch(
  env: Env,
  agent: FreelanceScannerAgent,
): Promise<{ triaged: number; errors: number }> {
  const logger = new Logger(env);
  const service = new FreelanceService(env);

  // Get untriaged opportunities
  const untriaged = await service.getUntriagedOpportunities(25);
  if (untriaged.length === 0) {
    return { triaged: 0, errors: 0 };
  }

  // Get freelance profile for context
  const profile = await service.getProfile();

  // Build the prompt with opportunity details
  const opportunitySummaries = untriaged.map((opp) => ({
    id: opp.id,
    platform: opp.platform,
    title: opp.title,
    description: opp.description?.slice(0, 500),
    skills: opp.skillsJson,
    budgetType: opp.budgetType,
    budgetMin: opp.budgetMin,
    budgetMax: opp.budgetMax,
    budgetCurrency: opp.budgetCurrency,
    experienceLevel: opp.experienceLevel,
    clientScore: opp.clientScore,
    clientSpent: opp.clientSpent,
    clientHires: opp.clientHires,
    proposalsCount: opp.proposalsCount,
    isPremium: opp.isPremium,
    isUrgent: opp.isUrgent,
  }));

  const systemPrompt = `You are a freelance bid strategist. Evaluate each opportunity against the freelancer's profile and decide whether to BID, SKIP, or flag for MANUAL_REVIEW.

<FREELANCER_PROFILE>
${JSON.stringify(profile, null, 2)}
</FREELANCER_PROFILE>

<EVALUATION_CRITERIA>
1. SKILL MATCH: How well do the required skills align with the freelancer's expertise?
2. BUDGET ALIGNMENT: Does the budget match the freelancer's rate expectations?
3. CLIENT QUALITY: Evaluate client score, total spent, hiring history, and verification.
4. COMPETITION: Assess number of proposals/bids relative to the opportunity quality.
5. WIN PROBABILITY: Estimate 0.0–1.0 chance of winning based on all factors.
</EVALUATION_CRITERIA>

<DECISION_RULES>
- BID: Skill match ≥70%, budget aligned, client score ≥3.5, win probability ≥0.3
- SKIP: Skill match <40%, OR budget <50% of rate, OR client score <2.0
- MANUAL_REVIEW: Borderline cases, high-value but risky, or insufficient data
</DECISION_RULES>

Return a JSON object with a "decisions" array. Each element must have:
- opportunityId (number)
- decision ("bid" | "skip" | "manual_review")
- confidence (0.0–1.0)
- rationale (string, 1-2 sentences)
- skillsMatched (string[])
- skillsMissing (string[])
- budgetMatch (string: "above_rate" | "at_rate" | "below_rate" | "unknown")
- competitionAssessment (string: "low" | "moderate" | "high" | "very_high")
- winProbability (0.0–1.0)
- recommendedBid (number or null)
- recommendedBidCurrency (string, default "USD")
- bidStrategy (string: "undercut" | "premium" | "value" | "competitive")`;

  let triaged = 0;
  let errors = 0;

  try {
    const response = (await env.AI.run(
      env.MODEL_TRIAGE as any,
      {
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Evaluate these ${untriaged.length} opportunities:\n\n${JSON.stringify(opportunitySummaries, null, 2)}`,
          },
        ],
        max_tokens: 8096,
      },
      { gateway: { id: env.AI_GATEWAY_ID } },
    )) as { response?: string };

    // Parse the AI response
    let parsed: AiTriageResponse;
    try {
      const responseText = response.response ?? "";
      // Extract JSON from potential markdown code blocks
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
        responseText.match(/(\{[\s\S]*\})/);
      parsed = JSON.parse(jsonMatch?.[1] ?? responseText);
    } catch {
      logger.error("[FreelanceScannerAgent] Failed to parse triage AI response");
      return { triaged: 0, errors: untriaged.length };
    }

    // Save all decisions in a single batch!
    const triageValues = parsed.decisions.map((decision) => ({
      opportunityId: decision.opportunityId,
      decision: decision.decision,
      confidence: decision.confidence,
      rationale: decision.rationale,
      skillsMatched: decision.skillsMatched,
      skillsMissing: decision.skillsMissing,
      budgetMatch: decision.budgetMatch,
      competitionAssessment: decision.competitionAssessment,
      winProbability: decision.winProbability,
      recommendedBid: decision.recommendedBid,
      recommendedBidCurrency: decision.recommendedBidCurrency,
      bidStrategy: decision.bidStrategy,
      modelUsed: String(env.MODEL_TRIAGE),
      decidedAt: new Date(),
    }));

    try {
      if (triageValues.length > 0) {
        await service.saveTriageBatch(triageValues);
        triaged = triageValues.length;
      }
    } catch (err) {
      // Fallback: try inserting concurrently to identify specific errors without sequential round-trips
      logger.warn(`[FreelanceScannerAgent] Batch triage insert failed, falling back to concurrent single inserts: ${String(err)}`);
      const results = await Promise.allSettled(
        triageValues.map(async (val) => {
          await service.saveTriage(val);
          return val.opportunityId;
        })
      );

      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const val = triageValues[i];
        if (res.status === "fulfilled") {
          triaged++;
        } else {
          errors++;
          logger.error(`[FreelanceScannerAgent] Failed to save triage for opp ${val.opportunityId}`, {
            error: String(res.reason),
          });
        }
      }
    }

    agent.emitProgress({
      type: "freelance-scan-progress",
      sessionId: "triage",
      platform: "both",
      status: "completed",
      found: untriaged.length,
      new: triaged,
      updated: 0,
      failed: errors,
    });
  } catch (err) {
    logger.error("[FreelanceScannerAgent] Triage batch failed", { error: String(err) });
    errors = untriaged.length;
  }

  return { triaged, errors };
}
