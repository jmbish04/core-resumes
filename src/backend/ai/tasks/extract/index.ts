/**
 * @fileoverview Extract structured data from a job posting.
 *
 * The hybrid pipeline (`extractRolePostingHybrid`) is the production-default
 * path — it consumes both the rendered markdown AND the `Browser Rendering`
 * `/scrape` element groups, runs three small parallel LLM passes, and returns
 * a `JobPosting`-shaped result with bullets that are provably verbatim from
 * the DOM.
 *
 * The legacy single-blob path (one giant LLM call against the full
 * `JobPostingExtractionSchema`) is retained as a "lossy fallback" for
 * intake sources where we don't have a DOM scrape (e.g. PDF-only ingestion
 * or pasted plaintext). It uses `generateStructuredAnalysis`
 * (`enable_thinking: false` + `strict: true`) and is roughly 3-5x slower,
 * with the well-known truncation-on-long-bullets failure mode that prompted
 * this refactor in the first place.
 */

import type { z } from "zod";

import type { ScrapeResult } from "../../tools/browser-rendering";

import { generateStructuredAnalysis } from "../../providers";
import { enforceTokenLimit } from "../../utils/token-estimator";
import { extractRolePostingHybrid } from "./role-hybrid";

export * from "./types";
export * from "./health";
export { extractRolePostingHybrid } from "./role-hybrid";

export const DEFAULT_EXTRACT_PROMPT = `You are a precision job posting parser. Extract the MAXIMUM structured data from the supplied text into the JSON schema.

<STRICT_VERBATIM_EXTRACTION>
CRITICAL REQUIREMENT: For ALL text fields — especially array fields (responsibilities, qualifications, skills, benefits, education) — you MUST extract each item VERBATIM.
- Copy the EXACT full text from the posting, character-for-character.
- Do NOT summarize, shorten, paraphrase, truncate, or rephrase ANYTHING.
- Every single word must perfectly match the original text.
- If an item spans multiple sentences in a single bullet, keep all sentences together as one entry.
- If a bullet is 200+ words long, include ALL of it. Length is not a reason to shorten.
- Do not lose any details, no matter how long or verbose a bullet point is.
- When in doubt, include MORE text rather than less.
</STRICT_VERBATIM_EXTRACTION>

<CAPTURE_ALL_CONTENT>
CRITICAL: Do NOT discard or exclude ANY content from the job posting. Every word must be captured in one of the schema fields:
- Company introductions, "About Us", or mission statements → put in "aboutCompany" field
- ALL free-text narrative paragraphs that appear BEFORE bullet lists → put in "aboutRoleNarrative" field. This includes: company/team description paragraphs, role overview paragraphs, "what's non-negotiable" statements, and any other prose that precedes the first bullet list. Concatenate ALL such paragraphs with newlines. Do NOT pick only one paragraph — capture EVERY paragraph.
- Bullet items for duties/responsibilities → "responsibilities" array
- Bullet items for required/must-have qualifications → "requiredQualifications" array
- Bullet items for preferred/nice-to-have qualifications → "preferredQualifications" array
- Required skills → "requiredSkills" array
- Preferred skills → "preferredSkills" array
- Education → "educationRequirements" array
- Benefits/perks → "benefits" array
- EEO statements, disclaimers, application instructions, form fields, and any other content that does not fit the above → put in "otherContent" field
- NOTHING should be excluded. If text exists in the posting, it MUST appear in exactly one field.
</CAPTURE_ALL_CONTENT>

Guidelines:
- Extract every field present in the posting. Leave optional fields as null/undefined only when the information is genuinely absent.
- Distinguish between REQUIRED qualifications (must-have, minimum) and PREFERRED qualifications (nice-to-have, ideal, strong).
- For salary, extract numeric values without currency symbols. Detect the currency code (USD, EUR, GBP, etc.).
- For location, include city, state/province, and country when available.
- For workplaceType, classify as 'remote', 'hybrid', or 'onsite' based on context clues.
- For yearsExperienceMin/Max, extract numeric values from phrases like '5+ years' (min=5) or '3-5 years' (min=3, max=5).
- Capture any RTO (return-to-office), schedule, or work arrangement details in rtoPolicy.
- Return JSON only — no markdown, no commentary.`;

/**
 * Extract a structured job posting from raw text — and, when available, from
 * a Browser Rendering DOM scrape.
 *
 * Production-preferred path: pass both `text` (markdown) and
 * `scrapedElements`. The function delegates to `extractRolePostingHybrid`,
 * which is faster (~10s vs ~49s on the validation Anthropic posting),
 * cheaper, and produces bullets that are provably verbatim from the DOM.
 *
 * Lossy fallback path: when `scrapedElements` is omitted (or empty), the
 * function runs the legacy single-blob extraction. This path is kept for
 * intake sources without a DOM (PDF ingestion, pasted plaintext) but is
 * known to occasionally summarize long bullets — callers that have a DOM
 * scrape SHOULD pass it.
 */
export async function extractStructuredRolePosting<TSchema extends z.ZodTypeAny>(
  env: Env,
  opts: {
    text: string;
    schema: TSchema;
    extractionSchema?: z.ZodTypeAny;
    systemPrompt?: string;
    cacheTtl?: number;
    /**
     * DOM elements (h1-h3, ul>li, ol>li, p) from `BrowserRendering.scrapeElements()`.
     * When present, the hybrid pipeline takes over and `schema` is asserted on
     * the merged result.
     */
    scrapedElements?: ScrapeResult;
  },
): Promise<z.infer<TSchema>> {
  if (opts.scrapedElements && opts.scrapedElements.length > 0) {
    const hybrid = await extractRolePostingHybrid(env, {
      markdown: opts.text,
      scrapedElements: opts.scrapedElements,
    });
    return opts.schema.parse(hybrid);
  }

  // ── Lossy fallback (single-blob LLM call) ──────────────────────────────
  // Kimi K2.5 has 256k context; cap input at 200k tokens for safety.
  enforceTokenLimit(opts.text, 200_000, "Extract Text");

  return generateStructuredAnalysis(env, {
    messages: [
      {
        role: "system",
        content: opts.systemPrompt ?? DEFAULT_EXTRACT_PROMPT,
      },
      { role: "user", content: opts.text },
    ],
    schema: opts.schema,
    extractionSchema: opts.extractionSchema,
    schemaName: "ExtractionSchema",
    temperature: 0,
    max_tokens: 8192,
    cacheTtl: opts.cacheTtl,
  });
}
