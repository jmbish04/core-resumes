/**
 * @fileoverview Pass B — fact-field extractor for the hybrid role-intake
 * pipeline.
 *
 * Pass B extracts the 12 scalar fact fields (companyName, jobTitle, salary*,
 * location, workplaceType, yearsExperience*, department, reportingTo) from the
 * markdown form of the posting. Bullet arrays and narrative text are handled
 * separately by Pass H (bullets) and Pass A (narrative), so this schema is
 * intentionally tiny — that's what makes Pass B reliable on smaller models
 * and cheap on large ones.
 */

import { z } from "zod";

import { AiProvider } from "../../providers";
import { enforceTokenLimit } from "../../utils/token-estimator";

// ---------------------------------------------------------------------------
// Schema — mirrors PASS_B_SCHEMA in scripts/test-extraction-fidelity.py
// ---------------------------------------------------------------------------

export const RoleFactFields = z.object({
  companyName: z.string().nullable(),
  jobTitle: z.string().nullable(),
  jobUrl: z.string().nullable(),
  salaryMin: z.number().nullable(),
  salaryMax: z.number().nullable(),
  salaryCurrency: z.string().nullable(),
  location: z.string().nullable(),
  workplaceType: z.string().nullable(),
  yearsExperienceMin: z.number().nullable(),
  yearsExperienceMax: z.number().nullable(),
  department: z.string().nullable(),
  reportingTo: z.string().nullable(),
});

export type RoleFactFieldsT = z.infer<typeof RoleFactFields>;

// ---------------------------------------------------------------------------
// System prompt — ported verbatim from scripts/test-extraction-fidelity.py
// ---------------------------------------------------------------------------

export const PASS_B_FACTS_SYSTEM_PROMPT = `Extract these 12 fact fields from the supplied job posting markdown. Use null for any field that is genuinely absent. Return JSON only — no commentary, no markdown fences.

- companyName: the hiring company name (e.g. "Anthropic")
- jobTitle: the role title (verbatim, e.g. "Legal Operations Specialist, Tooling & Enablement")
- jobUrl: the canonical job URL if present in the page, else null
- salaryMin / salaryMax: numeric only, no currency symbols. From phrases like "$170,000 - $220,000" → 170000, 220000
- salaryCurrency: ISO 4217 code (USD, EUR, GBP, CAD, etc.)
- location: a single string, e.g. "San Francisco, CA"
- workplaceType: exactly one of: remote | hybrid | onsite (lowercase, no other values)
- yearsExperienceMin / yearsExperienceMax: numeric, derived from phrases like "5+ years" → min=5; "3-5 years" → min=3, max=5; "4-7 years" → min=4, max=7
- department: the team/department if stated, else null
- reportingTo: who the role reports to if stated, else null`;

// ---------------------------------------------------------------------------
// Public task
// ---------------------------------------------------------------------------

/**
 * Pass B — extract the 12 scalar fact fields from the posting markdown.
 *
 * The schema is intentionally small (12 string/number/null fields) so even
 * smaller models can handle it. Bullets and narrative are NOT requested here —
 * they're DOM-sourced via Pass H + Pass A.
 */
export async function extractRoleFactFields(env: Env, markdown: string): Promise<RoleFactFieldsT> {
  // gpt-oss-120b context is 128k; 100k leaves room for system prompt + reasoning.
  enforceTokenLimit(markdown, 100_000, "Pass B Fact Extraction");

  return new AiProvider(env).generateStructuredAnalysis({
    messages: [
      { role: "system", content: PASS_B_FACTS_SYSTEM_PROMPT },
      { role: "user", content: markdown },
    ],
    schema: RoleFactFields,
    schemaName: "PassBFactFields",
    temperature: 0,
    max_tokens: 1024,
  });
}
