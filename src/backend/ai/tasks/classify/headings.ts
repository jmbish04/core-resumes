/**
 * @fileoverview Pass H — dynamic heading classifier for the hybrid role-intake
 * pipeline.
 *
 * Each posting structures its content under different headings — Anthropic uses
 * "You may be a good fit if you", another company uses "Minimum Qualifications",
 * another might use "Who you are". Hardcoding regex patterns is brittle and
 * drifts as new postings come in. Pass H asks Workers AI to classify each
 * heading by index based on the heading text plus a short preview of the first
 * item beneath it. The model never reproduces the heading text — it just labels
 * indices. Bullets remain provably verbatim from the DOM.
 *
 * Empirical results on the Anthropic posting (gpt-oss-120b):
 *   - 12 headings → 3 classified into bullet fields, 9 labeled `skip`.
 *   - 307 completion tokens (~$0.0002).
 *   - Critically: a 22-item EEO disability self-identification list was
 *     correctly labeled `skip` because the heading made its purpose clear.
 *     No regex pattern would have caught that without false-positive risk.
 */

import { z } from "zod";

import type { HeadingGroup } from "../../tools/role/html-bullet-parser";


import { generateStructuredAnalysis } from "../../providers";

// ---------------------------------------------------------------------------
// Field enum + Zod schema
// ---------------------------------------------------------------------------

export const HEADING_FIELDS = [
  "responsibilities",
  "requiredQualifications",
  "preferredQualifications",
  "requiredSkills",
  "preferredSkills",
  "educationRequirements",
  "benefits",
  "skip",
] as const;

export type HeadingField = (typeof HEADING_FIELDS)[number];

export const PassHAssignment = z.object({
  idx: z.number().int(),
  field: z.enum(HEADING_FIELDS),
});

export const PassHResult = z.object({
  assignments: z.array(PassHAssignment),
});

export type PassHAssignmentT = z.infer<typeof PassHAssignment>;

// ---------------------------------------------------------------------------
// System prompt — ported verbatim from scripts/test-extraction-fidelity.py
// ---------------------------------------------------------------------------

export const PASS_H_HEADING_SYSTEM_PROMPT = `You are a precision document classifier. Below are NUMBERED heading texts from a job posting. Each heading typically introduces a SECTION of content. Assign each heading to exactly one schema field that describes the BULLET LIST appearing under that heading. DO NOT generate, summarize, or rewrite any heading text — your only job is to label headings by index.

Schema fields (pick the closest match — these correspond to JobPosting bullet arrays):

- responsibilities: duties, what you'll do, key tasks, day-to-day activities, "the role", "in this role", "your role"
- requiredQualifications: must-have / minimum qualifications, "you may be a good fit if", "what we're looking for", "who you are", "you'll have", "requirements"
- preferredQualifications: nice-to-have, bonus, "strong candidates also have", "additionally", "ideal but not required", "it's a plus if"
- requiredSkills: required technical skills (use ONLY when explicitly distinguished from broader qualifications)
- preferredSkills: preferred technical skills (use ONLY when explicitly distinguished)
- educationRequirements: degrees, education, academic background
- benefits: perks, benefits, "what we offer", "why join us", compensation packages, "come work with us" (when followed by perk bullets)

Skip:
- skip: heading is a NARRATIVE section header (e.g. "About <Company>", "About the role", "Logistics", "Visa sponsorship", "Mission") — its content is paragraphs, not bullets, and Pass A will handle the prose. Also skip page chrome (nav labels, button text, footer fragments).

Each heading is shown along with a preview of the first item that follows it, to help disambiguate. Use the preview as a hint only — the heading text is the primary signal.

Return JSON only: { "assignments": [{ "idx": 0, "field": "responsibilities" }, ...] }.
Every input heading must appear exactly once in \`assignments\`.`;

// ---------------------------------------------------------------------------
// Format helper — mirrors _format_headings_for_pass_h in the Python harness
// ---------------------------------------------------------------------------

const PREVIEW_TRUNCATE = 140;

export function formatHeadingsForPassH(groups: HeadingGroup[]): string {
  const lines: string[] = [];
  for (const g of groups) {
    let line = `[${g.idx}] ${g.heading}`;
    if (g.items.length > 0) {
      const first = g.items[0];
      const preview = first.length > PREVIEW_TRUNCATE ? `${first.slice(0, PREVIEW_TRUNCATE)}…` : first;
      line += `\n     ↳ first item: ${preview}`;
      line += `\n     ↳ (${g.items.length} list item${g.items.length !== 1 ? "s" : ""} total)`;
    } else {
      line += "\n     ↳ (no <li> items — narrative section, label `skip`)";
    }
    lines.push(line);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Public task
// ---------------------------------------------------------------------------

/**
 * Pass H — classify each heading group by index into a `JobPosting` bullet
 * field (or `skip` for narrative-section headings handled by Pass A).
 *
 * Empirically tuned defaults:
 *   - `gpt-oss-120b` (cheaper + 3-5x faster than Kimi K2.5/2.6 for this size).
 *   - `temperature: 0` — deterministic classification.
 *   - `max_tokens: 2048` — even on a 30-heading page the response is ~500
 *     tokens; 2048 leaves headroom without inviting runaway reasoning.
 */
export async function classifyHeadingsByIndex(
  env: Env,
  groups: HeadingGroup[],
): Promise<{ assignments: PassHAssignmentT[] }> {
  if (groups.length === 0) return { assignments: [] };

  const userMessage = formatHeadingsForPassH(groups);

  const result = await generateStructuredAnalysis(env, {
    messages: [
      { role: "system", content: PASS_H_HEADING_SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    schema: PassHResult,
    schemaName: "PassHHeadingClassification",
    temperature: 0,
    max_tokens: 2048,
  });

  return { assignments: result.assignments };
}
