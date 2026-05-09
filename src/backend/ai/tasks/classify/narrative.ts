/**
 * @fileoverview Pass A — narrative paragraph classifier for the hybrid
 * role-intake pipeline.
 *
 * Pass A labels each pre-scraped DOM `<p>` paragraph by INDEX into one of six
 * narrative buckets (or `skip`). The model never reproduces or rewrites the
 * paragraph text — code-side concatenation handles the join, so Pass A's
 * output is provably verbatim from the DOM.
 *
 * Default behavior is "capture everything": when in doubt between
 * `otherContent` and `skip`, the prompt tells the model to pick `otherContent`.
 * This eliminates the "model accidentally dropped the visa paragraph" failure
 * mode of the legacy single-blob extractor.
 */

import { z } from "zod";

import type { FilteredParagraph } from "../../tools/role/html-bullet-parser";

import { generateStructuredAnalysis } from "../../providers";

// ---------------------------------------------------------------------------
// Field enum + Zod schema
// ---------------------------------------------------------------------------

export const NARRATIVE_FIELDS = [
  "aboutCompany",
  "aboutRoleNarrative",
  "rtoPolicy",
  "visaSponsorship",
  "otherContent",
  "skip",
] as const;

export type NarrativeField = (typeof NARRATIVE_FIELDS)[number];

export const PassAAssignment = z.object({
  idx: z.number().int(),
  field: z.enum(NARRATIVE_FIELDS),
});

export const PassAResult = z.object({
  assignments: z.array(PassAAssignment),
});

export type PassAAssignmentT = z.infer<typeof PassAAssignment>;

// ---------------------------------------------------------------------------
// System prompt — ported verbatim from scripts/test-extraction-fidelity.py
// ---------------------------------------------------------------------------

export const PASS_A_NARRATIVE_SYSTEM_PROMPT = `You are a precision document classifier. Below are NUMBERED paragraph texts from a job posting. Assign each paragraph to exactly one schema field. DO NOT generate, summarize, or rewrite any paragraph text — your only job is to label them by index.

Schema fields:
- aboutCompany: company mission / "About Us" / what the company does. Usually appears at the very top of the posting.
- aboutRoleNarrative: prose describing the role, the team, what's non-negotiable, what success looks like — anything narrative about the role itself or the team it sits on.
- rtoPolicy: return-to-office, in-office days, location/schedule policy, hybrid work expectations.
- visaSponsorship: visa, immigration, sponsorship language.
- otherContent: legal/EEO statements, diversity statements, "How we're different", "Come work with us", "Your safety matters" notices, application logistics, hiring process, compensation philosophy prose, and ANYTHING ELSE that doesn't fit a more specific bucket.
- skip: ONLY pure page chrome — nav labels, button text ("Apply Now"), footer copyright lines, fragments under 30 chars of meaningful prose. When in doubt between \`otherContent\` and \`skip\`, pick \`otherContent\` — we never want to leave real body content on the floor.

CAPTURE EVERYTHING. Default behavior: if the paragraph contains real prose, it gets a bucket. Only use \`skip\` for genuine non-content fragments. Five buckets cover the entire space — pick the best fit.

Return JSON only: { "assignments": [{ "idx": 0, "field": "aboutCompany" }, ...] }.
Every input paragraph must appear exactly once in \`assignments\`.`;

// ---------------------------------------------------------------------------
// Format helper — mirrors _format_paragraphs_for_pass_a in the Python harness
// ---------------------------------------------------------------------------

const PARAGRAPH_TRUNCATE = 4000;

export function formatParagraphsForPassA(paragraphs: FilteredParagraph[]): string {
  const parts: string[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const text = paragraphs[i].text;
    const bounded = text.length > PARAGRAPH_TRUNCATE ? `${text.slice(0, PARAGRAPH_TRUNCATE)}…` : text;
    parts.push(`[${i}]\n${bounded}`);
  }
  return parts.join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// Public task
// ---------------------------------------------------------------------------

/**
 * Pass A — classify each filtered paragraph by index into a narrative bucket.
 *
 * Pinned to gpt-oss-120b (same as Pass H/B) for latency consistency. The
 * caller (`extractRolePostingHybrid`) is responsible for performing the
 * verbatim text join after this pass returns.
 */
export async function classifyParagraphsByIndex(
  env: Env,
  paragraphs: FilteredParagraph[],
): Promise<{ assignments: PassAAssignmentT[] }> {
  if (paragraphs.length === 0) return { assignments: [] };

  const userMessage = formatParagraphsForPassA(paragraphs);

  const result = await generateStructuredAnalysis(env, {
    messages: [
      { role: "system", content: PASS_A_NARRATIVE_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    schema: PassAResult,
    schemaName: "PassANarrativeClassification",
    temperature: 0,
    max_tokens: 2048,
  });

  return { assignments: result.assignments };
}
