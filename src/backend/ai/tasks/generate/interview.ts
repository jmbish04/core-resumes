/**
 * @fileoverview Mock interview generation task — creates a role-specific
 * interview transcript with tough questions mapped to the candidate's
 * quantifiable career metrics.
 *
 * Pipeline:
 *  1. Load role + latest analysis (the_hook, strategic_recommendation, counter_positioning)
 *  2. Load role_bullets for JD context
 *  3. Optionally consult NotebookLM for additional evidence
 *  4. Generate structured Q&A via gpt-oss-120b
 *  5. Persist to mock_interviews table
 */

import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../../../db";
import {
  mockInterviews,
  roleAnalyses,
  roleBullets,
  roles,
} from "../../../db/schema";
import { generateStructuredOutput } from "../../providers";
import { consultNotebook } from "../../tools/notebooklm/notebooklm";
import { getActiveBullets } from "../draft";

// ---------------------------------------------------------------------------
// Schema for structured interview output
// ---------------------------------------------------------------------------

const MockInterviewSchema = z.object({
  qa_pairs: z
    .array(
      z.object({
        interviewer: z
          .string()
          .describe("A tough, specific interview question tailored to this role's JD requirements"),
        candidate: z
          .string()
          .describe(
            "The candidate's answer using the '0-to-1 Builder' narrative, weaving in specific Google metrics ($16M saved, 300% adoption, 70% reduction)",
          ),
        insight: z
          .string()
          .describe(
            "Coaching note explaining why this response works strategically — what hiring signal it sends and which JD requirement it directly addresses",
          ),
      }),
    ),
});

export type MockInterviewResult = z.infer<typeof MockInterviewSchema>;

// ---------------------------------------------------------------------------
// Type labels (duplicated from analyze-role for prompt context)
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  REQUIRED_QUALIFICATION: "Required Qualifications",
  PREFERRED_QUALIFICATION: "Preferred Qualifications",
  KEY_RESPONSIBILITY: "Key Responsibilities",
  EDUCATION_REQUIREMENT: "Education Requirements",
  REQUIRED_SKILL: "Required Skills",
  PREFERRED_SKILL: "Preferred Skills",
  BENEFIT: "Benefits",
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Generate a mock interview transcript for a role.
 *
 * Uses the latest analysis results (hook, positioning, strategic recommendations)
 * to inform the interview strategy.
 *
 * @param env - Worker environment bindings
 * @param roleId - The role to generate an interview for
 * @returns The persisted mock interview ID
 */
export async function generateInterview(env: Env, roleId: string): Promise<string> {
  const db = getDb(env);

  // Load role context
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) {
    throw new Error(`Role not found: ${roleId}`);
  }

  // Load latest analysis (if available)
  const [analysis] = await db
    .select()
    .from(roleAnalyses)
    .where(eq(roleAnalyses.roleId, roleId))
    .orderBy(desc(roleAnalyses.analyzedAt))
    .limit(1);

  // Load role_bullets for JD context
  const bulletRows = await db
    .select()
    .from(roleBullets)
    .where(eq(roleBullets.roleId, roleId))
    .orderBy(roleBullets.type, roleBullets.sortOrder);

  // Load resume bullets for candidate context
  const resumeBulletRows = await getActiveBullets(env);
  const resumeBulletsContext =
    resumeBulletRows.length > 0
      ? resumeBulletRows.map((b) => `[${b.category}] ${b.content}`).join("\n")
      : "(No resume bullets available)";

  // Optionally consult NotebookLM for additional interview-specific evidence
  let notebookEvidence = "";
  try {
    const consultation = await consultNotebook(
      env,
      `Based on my career history and performance reviews, what are the strongest stories, metrics, and achievements I should use in a job interview for a ${role.jobTitle} role at ${role.companyName}? Focus on quantifiable outcomes, leadership examples, and technical impact stories.`,
    );
    notebookEvidence = consultation.answer;
  } catch {
    notebookEvidence = "(NotebookLM unavailable — generating based on resume bullets only)";
  }

  // Build prompt
  const systemPrompt = buildInterviewSystemPrompt(analysis);
  const userPrompt = buildInterviewUserPrompt(
    role,
    bulletRows,
    resumeBulletsContext,
    notebookEvidence,
    analysis,
  );

  // Attempt structured output. If the LLM wraps the response or returns
  // qa_pairs as undefined, the .default([]) on the schema handles it.
  // We retry once with an explicit instruction if the first attempt yields
  // an empty array.
  let result: MockInterviewResult;
  try {
    result = await generateStructuredOutput(env, {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      schema: MockInterviewSchema,
      schemaName: "MockInterview",
      temperature: 0.3,
      max_tokens: 8096,
    });
  } catch (firstErr) {
    // If the first attempt fails with a Zod error, retry with a simpler prompt
    console.error("[mock_interview] First attempt failed, retrying:", firstErr);
    result = await generateStructuredOutput(env, {
      messages: [
        {
          role: "system",
          content:
            'You are an interview coach. Generate a JSON object with a single key "qa_pairs" containing an array of objects. Each object has three string keys: "interviewer", "candidate", "insight". Generate 8-10 questions.',
        },
        { role: "user", content: userPrompt },
      ],
      schema: MockInterviewSchema,
      schemaName: "MockInterview",
      temperature: 0.4,
      max_tokens: 8096,
    });
  }

  if (!result.qa_pairs || result.qa_pairs.length === 0) {
    throw new Error(
      "Mock interview generation returned zero Q&A pairs. The AI model may be unable to generate interview content for this role.",
    );
  }

  // Determine version number
  const existingInterviews = await db
    .select({ id: mockInterviews.id })
    .from(mockInterviews)
    .where(eq(mockInterviews.roleId, roleId));
  const nextVersion = existingInterviews.length + 1;

  // Persist
  const interviewId = crypto.randomUUID();
  await db.insert(mockInterviews).values({
    id: interviewId,
    roleId,
    analysisId: analysis?.id ?? null,
    version: nextVersion,
    qaPairs: result.qa_pairs,
  });

  return interviewId;
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildInterviewSystemPrompt(
  analysis: typeof roleAnalyses.$inferSelect | undefined,
): string {
  const strategySection = analysis
    ? `
Strategic Context from Analysis:
- Opening Pitch: ${analysis.theHook ?? "Not available"}
- Counter-Positioning: ${analysis.counterPositioning ?? "Not available"}
- Strategic Recommendations: ${analysis.strategicRecommendation ?? "Not available"}
- Hire Likelihood Score: ${analysis.hireScore}/100
`
    : "";

  return `You are a senior hiring manager conducting a rigorous job interview. You will generate a realistic mock interview transcript.

${strategySection}

Candidate Profile:
- 12+ years at Google as a "0-to-1" intrapreneur
- Ships platform-critical tools (saving $16M annually, boosting adoption 300%)
- Bridges Legal, Engineering, and Business domains — the "Translator"
- No formal Law Degree (JD), which keeps the candidate ROI-focused and pragmatic
- Built a "Shadow Ecosystem" of custom apps that users voluntarily adopted over official tools
- Reduced time-to-matter creation by 70%
- Validated the need for a 55+ person engineering team through solo prototype work

Interview Generation Rules:
1. Generate 8-12 questions covering ALL major JD requirement categories
2. Ask TOUGH questions — include behavioral, situational, and "gotcha" questions about gaps
3. The candidate's answers must ALWAYS weave in specific metrics ($16M, 300%, 70%)
4. For credential-gap questions (e.g., "Why don't you have a law degree?"), use the counter-positioning strategy
5. Include at least 2 "curveball" questions that test thinking on the spot
6. Each answer should use the STAR method (Situation, Task, Action, Result) implicitly
7. The insight coaching note should explain what hiring signal the answer sends

You must respond with a valid JSON object matching the requested schema exactly. Use the exact key names: "qa_pairs", "interviewer", "candidate", "insight".
DO NOT wrap your response in markdown fences.
EXAMPLE FORMAT:
{
  "qa_pairs": [
    {
      "interviewer": "...",
      "candidate": "...",
      "insight": "..."
    }
  ]
}`;
}

function buildInterviewUserPrompt(
  role: typeof roles.$inferSelect,
  bullets: Array<{ id: number; type: string; content: string }>,
  resumeBulletsContext: string,
  notebookEvidence: string,
  analysis: typeof roleAnalyses.$inferSelect | undefined,
): string {
  const sections = [`## Job: ${role.jobTitle} at ${role.companyName}`];

  // Group bullets by type
  if (bullets.length > 0) {
    const grouped = groupBy(bullets, (b) => b.type);
    sections.push("", "## Job Requirements from JD");
    for (const [type, items] of Object.entries(grouped)) {
      sections.push(
        "",
        `### ${TYPE_LABELS[type] ?? type}`,
        ...items.map((b) => `- ${b.content}`),
      );
    }
  }

  if (role.roleInstructions && role.roleInstructions.length > 100) {
    sections.push("", "## Additional Role Context", role.roleInstructions);
  }

  // Include analysis strategic fields if available
  if (analysis) {
    sections.push("", "## Analysis Insights for Interview Strategy");
    if (analysis.theHook) {
      sections.push(`### The Hook\n${analysis.theHook}`);
    }
    if (analysis.counterPositioning) {
      sections.push(`### Counter-Positioning (JD Trap)\n${analysis.counterPositioning}`);
    }
    if (analysis.strategicRecommendation) {
      sections.push(`### Strategic Recommendations\n${analysis.strategicRecommendation}`);
    }
  }

  sections.push(
    "",
    "## Career Evidence (NotebookLM)",
    notebookEvidence,
    "",
    "## Verified Resume Accomplishments",
    resumeBulletsContext,
  );

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of arr) {
    const key = keyFn(item);
    (groups[key] ??= []).push(item);
  }
  return groups;
}
