import { eq } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { jobSnapshots } from "@/backend/db/schema";

import type { JobAnalysisAgent } from "../index";

export async function handlePersist(
  env: Env,
  agent: JobAnalysisAgent,
  snapshotId: number,
  analysisResult: any,
) {
  const db = getDb(env);

  const snapshot = await db
    .select()
    .from(jobSnapshots)
    .where(eq(jobSnapshots.id, snapshotId))
    .get();

  if (!snapshot) {
    throw new Error(`Snapshot ${snapshotId} not found`);
  }

  if (analysisResult) {
    await db
      .update(jobSnapshots)
      .set({
        rawAssessmentJson: analysisResult,
        matchScore: analysisResult.matchScore,
        matchRationale: analysisResult.matchRationale,
        verdict: analysisResult.verdict,
        verdictRationale: analysisResult.verdictRationale,
        builderAlignment: analysisResult.builderAlignment,
        jdTrapDetected: analysisResult.jdTrapDetected,
        jobSummary: analysisResult.jobSummary,
        extractedSalaryRaw: analysisResult.extractedSalaryRaw,
        salaryMin: analysisResult.salaryMin,
        salaryMax: analysisResult.salaryMax,
        salaryCurrency: analysisResult.salaryCurrency,
        extractedBenefitsRaw: analysisResult.extractedBenefitsRaw,
        benefitsMedical: analysisResult.benefitsMedical,
        benefitsEquity: analysisResult.benefitsEquity,
        benefitsRetirement: analysisResult.benefitsRetirement,
        benefitsPto: analysisResult.benefitsPto,
        benefitsBonus: analysisResult.benefitsBonus,
        benefitsOtherJson: analysisResult.benefitsOtherJson,
        historicComparison: analysisResult.historicComparison,
        historicSalaryAnalysis: analysisResult.historicSalaryAnalysis,
        historicBenefitsAnalysis: analysisResult.historicBenefitsAnalysis,
        negotiationStrategy: analysisResult.negotiationStrategy,
        extractedLocation: analysisResult.extractedLocation,
        experienceLevel: analysisResult.experienceLevel,
      })
      .where(eq(jobSnapshots.id, snapshotId));
  }

  return { status: "persist-completed", snapshotId };
}
