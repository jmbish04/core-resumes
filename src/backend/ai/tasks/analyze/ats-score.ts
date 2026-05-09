/**
 * @fileoverview Standalone ATS keyword extraction & scoring task.
 *
 * This task is intentionally lightweight and fast — it extracts 30-50+
 * atomic keywords from a job description and compares them against a
 * candidate's resume text to produce a real-time match score.
 *
 * Architecture decision: Separated from the heavy Phase 2 `analyzeRole`
 * pipeline so the frontend can trigger on-demand "Refresh Score" without
 * executing the full holistic hireability analysis.
 */

import { z } from "zod";

import { generateStructuredOutput } from "../../providers";

// ---------------------------------------------------------------------------
// Schema — ATS extraction output
// ---------------------------------------------------------------------------

export const ATSExtractionSchema = z.object({
  programmingLanguagesAndFrameworks: z
    .array(z.string())
    .describe(
      "Extract BOTH languages AND frameworks as separate atomic entries.",
    ),
  testingAndQuality: z
    .array(z.string())
    .describe(
      "Testing frameworks, methodologies, and quality practices.",
    ),
  engineeringPractices: z
    .array(z.string())
    .describe(
      "Software engineering principles and architectural patterns.",
    ),
  businessDomain: z
    .array(z.string())
    .describe(
      "Industry verticals and business model tags.",
    ),
  infrastructureAndDevOps: z
    .array(z.string())
    .describe(
      "Cloud, infrastructure, and DevOps tooling.",
    ),
  impliedSkills: z
    .array(z.string())
    .describe(
      "Skills inferred from contextual phrasing. E.g., 'high traffic' → 'scalability'.",
    ),
});

export type ATSExtraction = z.infer<typeof ATSExtractionSchema>;

// ---------------------------------------------------------------------------
// Schema — ATS comparison result (extraction + match scoring)
// ---------------------------------------------------------------------------

export const ATSScoreResultSchema = z.object({
  extraction: ATSExtractionSchema,
  matchedKeywords: z
    .array(z.string())
    .describe("Keywords from the job posting that ARE present in the resume text."),
  missingKeywords: z
    .array(z.string())
    .describe("Keywords from the job posting that are NOT present in the resume text."),
  synonymSuggestions: z
    .array(
      z.object({
        missing: z.string().describe("The missing keyword from the job posting."),
        suggestion: z
          .string()
          .describe(
            "A synonym or alternative phrasing the candidate could add to their resume.",
          ),
      }),
    )
    .describe("Actionable synonym suggestions for missing keywords."),
  overallMatchPercent: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Percentage of total extracted keywords matched in the resume."),
  categoryScores: z.object({
    programmingLanguagesAndFrameworks: z.number().int().min(0).max(100),
    testingAndQuality: z.number().int().min(0).max(100),
    engineeringPractices: z.number().int().min(0).max(100),
    businessDomain: z.number().int().min(0).max(100),
    infrastructureAndDevOps: z.number().int().min(0).max(100),
  }),
});

export type ATSScoreResult = z.infer<typeof ATSScoreResultSchema>;

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const ATS_EXTRACTION_SYSTEM_PROMPT = `You are an ATS (Applicant Tracking System) keyword extraction expert.

Your task: Given a job description AND a resume/document text, extract ALL atomic keywords from the job description, then compare them against the resume text.

<EXTRACTION_RULES>
1. Extract 30-50+ ATOMIC keywords from the job description.
2. Each keyword must be a single, specific term — NOT compound phrases.
   ✅ "Python", "Django", "REST API", "microservices"
   ❌ "Python/Django experience", "building REST APIs"
3. Separate languages from frameworks: "PHP" and "Symfony" are TWO entries.
4. Include implicit skills inferred from context:
   - "high traffic" → "scalability", "high availability"
   - "multiple services" → "distributed systems", "microservices"
   - "complex codebase" → "refactoring", "code archaeology"
   - "cross-functional" → "stakeholder management"
   - "regulated environment" → "compliance", "audit trails"
5. Categorize every keyword into exactly ONE of the 5 taxonomy categories.
</EXTRACTION_RULES>

<MATCHING_RULES>
1. A keyword is "matched" if the resume contains the EXACT term OR a closely
   recognized synonym (e.g., "k8s" matches "Kubernetes").
2. For missing keywords, suggest ONE actionable synonym the candidate could
   add to their resume.
3. Calculate overallMatchPercent as: (matched / total_extracted) × 100.
4. Calculate per-category scores the same way within each category.
</MATCHING_RULES>

Return a valid JSON object matching the ATSScoreResult schema. Do NOT wrap in markdown fences.`;

// ---------------------------------------------------------------------------
// Public task — extract + score
// ---------------------------------------------------------------------------

/**
 * Extract ATS keywords from a job description and score them against
 * resume/document text.
 *
 * This task is designed to be fast (single LLM call, small output schema)
 * and is used by the real-time frontend "Refresh Score" button.
 */
export async function scoreATSAlignment(
  env: Env,
  jobDescription: string,
  resumeText: string,
): Promise<ATSScoreResult> {
  return generateStructuredOutput(env, {
    messages: [
      {
        role: "system",
        content: ATS_EXTRACTION_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: `## Job Description
${jobDescription}

## Resume / Document Text
${resumeText}`,
      },
    ],
    schema: ATSScoreResultSchema,
    schemaName: "ATSScoreResult",
    temperature: 0,
    max_tokens: 4096,
  });
}

// ---------------------------------------------------------------------------
// Lightweight extraction-only variant (no resume comparison)
// ---------------------------------------------------------------------------

/**
 * Extract ATS keywords from a job description only — no resume comparison.
 *
 * Used during job intake to pre-populate the taxonomy tags before the
 * candidate has linked a resume document.
 */
export async function extractATSKeywords(
  env: Env,
  jobDescription: string,
): Promise<ATSExtraction> {
  return generateStructuredOutput(env, {
    messages: [
      {
        role: "system",
        content: `You are an ATS keyword extraction expert. Extract 30-50+ atomic keywords from the job description and categorize them into the 5 taxonomy categories. Include implied skills from contextual phrasing. Return a valid JSON object matching the ATSExtraction schema. Do NOT wrap in markdown fences.`,
      },
      {
        role: "user",
        content: jobDescription,
      },
    ],
    schema: ATSExtractionSchema,
    schemaName: "ATSExtraction",
    temperature: 0,
    max_tokens: 2048,
  });
}
