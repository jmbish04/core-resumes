/**
 * @fileoverview Resume bullet ideation task — generates tailored resume bullets
 * based on scored role requirements and the candidate's bullet inventory.
 *
 * Prompt Engineering Rules (from `.agent/rules/ai-prompts.md` §5):
 *   - Every bullet follows "What you did + How + Result/Impact".
 *   - Fluff words are explicitly banned.
 *   - Dates, companies, and credentials are sacrosanct.
 */

import { z } from "zod";

import { AiProvider } from "../../providers";

// ---------------------------------------------------------------------------
// Writing rules constant — shared with respond-to-comments.ts
// ---------------------------------------------------------------------------

export const WRITING_RULES = `
<STRICT_WRITING_RULES>
BULLET FORMAT — every single resume bullet MUST follow this exact structure:
  "[What you did] + [How you did it] + [Result/Impact with a metric]"

Examples of GOOD bullets:
  • "Reduced time-to-matter creation by 70% by building an automated ETL pipeline that replaced a 12-step manual workflow, saving $2.4M in legal review costs annually."
  • "Led the migration of 3 legacy legal tools to a unified web platform using React and Python, increasing adoption from 40 to 300+ users across 5 offices."

FORBIDDEN WORDS — do NOT use ANY of these words under any circumstances:
  spearheaded, synergized, passionate, guru, rockstar, ninja, leveraged,
  utilized, orchestrated, revolutionized, transformative, cutting-edge,
  visionary, dynamic, proactive, innovative (without specific evidence)

HALLUCINATION PREVENTION — these rules are NON-NEGOTIABLE:
  1. NEVER invent new jobs, companies, degrees, certifications, or projects.
  2. NEVER change dates, company names, or titles from the source material.
  3. If the source material lacks specific metrics, write the bullet without
     inventing numbers. Use qualitative impact instead (e.g., "significantly
     reduced processing time" rather than fabricating "reduced by 40%").
  4. If you cannot find evidence for a skill, say so explicitly in the
     ai_rationale field — do NOT generate a bullet that implies the candidate
     has experience they do not.

CATEGORY ALIGNMENT:
  - Map each bullet to the exact category from the source resume inventory
    (e.g., "Technical Leadership", "System Architecture", "Process Automation").
  - If generating a new bullet, assign the most fitting category.
</STRICT_WRITING_RULES>
`.trim();

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

export const ResumeIdeationSchema = z.object({
  ideations: z.array(
    z.object({
      potential_resume_bullet: z
        .string()
        .describe(
          "The resume bullet text following the strict 'What + How + Result/Impact' format.",
        ),
      source: z.enum(["resume_bullets", "role_resume_bullets", "agent_generated"]),
      ai_rationale: z
        .string()
        .describe(
          "Evidence-based explanation of why this bullet was chosen or generated. Must cite specific career facts.",
        ),
      interview_tip: z
        .string()
        .nullable()
        .describe("Optional coaching tip for discussing this bullet in an interview context."),
      category: z
        .string()
        .describe(
          "The resume category this bullet belongs to (e.g., 'Technical Leadership', 'System Architecture').",
        ),
      impact: z
        .string()
        .nullable()
        .describe(
          "Quantified impact if available (e.g., '$16M savings', '300% adoption'). Null if no metric exists in source material.",
        ),
      mapped_role_bullet_ids: z
        .array(z.number())
        .describe("Database IDs of the role_bullets this resume bullet addresses."),
    }),
  ),
});

export type ResumeIdeation = z.infer<typeof ResumeIdeationSchema>;

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an elite Resume Architect with 15+ years of experience placing candidates in top-tier technology companies.

Your task: Match existing resume bullets or generate new ones tailored to scored job requirements.

${WRITING_RULES}

PRIORITIZATION:
1. First, try to match EXISTING resume bullets from the candidate's inventory.
   Set source = "resume_bullets" and cite the exact bullet.
2. If an existing bullet is close but needs refinement, rewrite it following
   the strict format rules. Set source = "role_resume_bullets".
3. Only generate entirely new bullets when no existing material covers the
   requirement. Set source = "agent_generated" and explain your evidence
   chain in ai_rationale.

COVERAGE:
- Generate ideations for EVERY scored role requirement, especially those
  with scores below 75 (moderate/gap alignment).
- For high-scoring requirements (75+), still provide the best matching
  bullet to ensure it's framed optimally for THIS specific role.

OUTPUT: Return a JSON object matching the ResumeIdeation schema exactly.
Do NOT wrap your response in markdown fences.`;

// ---------------------------------------------------------------------------
// Task entry point
// ---------------------------------------------------------------------------

/**
 * Generate resume bullet ideations tailored to scored role requirements.
 *
 * Uses the project's standard structured output pipeline via AI Gateway.
 */
export async function generateResumeBulletsTask(
  env: Env,
  context: string,
): Promise<ResumeIdeation> {
  return new AiProvider(env).generateStructuredOutput({
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: `Process the following role requirements and candidate inventory to generate resume ideations:\n${context}`,
      },
    ],
    schema: ResumeIdeationSchema,
    schemaName: "ResumeIdeation",
    temperature: 0,
    max_tokens: 8096,
  });
}
