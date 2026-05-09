/**
 * @fileoverview Hybrid role-intake extraction — DOM-as-source-of-truth +
 * three small Workers AI passes.
 *
 * Architecture (no regex, no single-blob extraction):
 *   1. Browser Rendering `/scrape` returns h1-h3, ul>li, ol>li, p elements
 *      with vertical positions — deterministic DOM access, no model.
 *   2. <li> elements get grouped under the nearest preceding <hN> by `top`
 *      via `extractHeadingGroups()`.
 *   3. Pass H (LLM): label each heading by index → bullet field or `skip`.
 *   4. Pass A (LLM): label each filtered <p> by index → narrative bucket.
 *   5. Pass B (LLM): extract the 12 scalar fact fields from the markdown.
 *   6. Code-side merge: bullets (DOM verbatim, attributed by Pass H) +
 *      narrative (paragraphs joined by code, never re-generated) + facts.
 *
 * Empirical wins over the legacy single-blob `extractStructuredRolePosting`:
 *   - 3-5x faster end-to-end (10s vs 49s on the Anthropic posting with
 *     gpt-oss-120b).
 *   - Bullets are provably verbatim from the DOM — eliminates the entire
 *     class of "model summarized the bullet" failures the old
 *     `reconcileJobExtractions` truncation auto-correction was patching.
 *   - Cheaper (1.6k vs 4k completion tokens for the same posting).
 *
 * Fan-out: Pass H, Pass A, and Pass B are independent and run via
 * `Promise.all()`. The merge is purely deterministic.
 */

import { z } from "zod";

import type { ScrapeResult } from "../../tools/browser-rendering";
import type { HeadingField } from "../classify/headings";
import type { NarrativeField } from "../classify/narrative";

import { JobPosting, JobPostingExtractionSchema } from "../../agents/orchestrator/types";
import {
  type FilteredParagraph,
  type HeadingGroup,
  extractFilteredParagraphs,
  extractHeadingGroups,
} from "../../tools/role/html-bullet-parser";
import { classifyHeadingsByIndex } from "../classify/headings";
import { classifyParagraphsByIndex } from "../classify/narrative";
import { extractRoleFactFields, type RoleFactFieldsT } from "./facts";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Bullet array fields written by Pass H + DOM merge. */
const HYBRID_BULLET_FIELDS = [
  "responsibilities",
  "requiredQualifications",
  "preferredQualifications",
  "requiredSkills",
  "preferredSkills",
  "educationRequirements",
  "benefits",
] as const;

type HybridBulletField = (typeof HYBRID_BULLET_FIELDS)[number];

/** Narrative string fields written by Pass A + code-side concat. */
const HYBRID_NARRATIVE_FIELDS = [
  "aboutCompany",
  "aboutRoleNarrative",
  "rtoPolicy",
  "visaSponsorship",
  "otherContent",
] as const;

type HybridNarrativeField = (typeof HYBRID_NARRATIVE_FIELDS)[number];

// ---------------------------------------------------------------------------
// Telemetry shape — surfaced on the merged result for downstream auditing
// ---------------------------------------------------------------------------

export type HybridExtractionMeta = {
  /** Heading groups Pass H labeled into a bullet field. */
  headingGroupsClassified: Array<{
    idx: number;
    heading: string;
    field: HybridBulletField;
    itemCount: number;
  }>;
  /** Heading groups Pass H labeled `skip` (or that had no items). */
  headingGroupsSkipped: Array<{
    idx: number;
    heading: string;
    field: HeadingField | null;
    itemCount: number;
  }>;
  /** Paragraph index assignments Pass A produced (preview-truncated). */
  paragraphAssignments: Array<{
    idx: number;
    field: NarrativeField;
    preview: string;
  }>;
  /** Aggregate stats — useful for health checks and dashboards. */
  stats: {
    domHeadings: number;
    domListItems: number;
    paragraphsFiltered: number;
    bulletGroupsClassified: number;
    bulletGroupsSkipped: number;
  };
};

export type HybridJobPosting = z.infer<typeof JobPosting> & {
  _hybridMeta?: HybridExtractionMeta;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PARAGRAPH_PREVIEW_TRUNCATE = 140;

function isHybridBulletField(field: string | undefined | null): field is HybridBulletField {
  if (!field) return false;
  return (HYBRID_BULLET_FIELDS as readonly string[]).includes(field);
}

function isHybridNarrativeField(field: string | undefined | null): field is HybridNarrativeField {
  if (!field) return false;
  return (HYBRID_NARRATIVE_FIELDS as readonly string[]).includes(field);
}

function countListItems(elements: ScrapeResult): number {
  let total = 0;
  for (const group of elements) {
    if (group.selector.includes("li")) {
      total += group.results.filter((r) => (r.text ?? "").trim().length > 0).length;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Public task
// ---------------------------------------------------------------------------

/**
 * Hybrid role posting extraction.
 *
 * @param env Worker environment
 * @param opts.markdown Browser Rendering `/markdown` output for the posting.
 *                      Used by Pass B for fact extraction.
 * @param opts.scrapedElements Browser Rendering `/scrape` output covering
 *                             h1-h3, ul>li, ol>li, p selectors. Used by Pass H
 *                             (bullets) and Pass A (narrative).
 *
 * @returns A validated `JobPosting` shape with `_hybridMeta` telemetry attached.
 */
export async function extractRolePostingHybrid(
  env: Env,
  opts: {
    markdown: string;
    scrapedElements: ScrapeResult;
  },
): Promise<HybridJobPosting> {
  const headingGroups: HeadingGroup[] = extractHeadingGroups(opts.scrapedElements);
  const paragraphs: FilteredParagraph[] = extractFilteredParagraphs(opts.scrapedElements);

  // Fan out the three AI passes. Each is small (≤2k completion tokens) and
  // independent — Promise.all cuts wall-clock time roughly to max(H, A, B).
  const [headingResult, narrativeResult, facts] = await Promise.all([
    classifyHeadingsByIndex(env, headingGroups),
    classifyParagraphsByIndex(env, paragraphs),
    extractRoleFactFields(env, opts.markdown),
  ]);

  // ── Bullets (DOM verbatim, attributed by Pass H) ───────────────────────
  const headingFieldByIdx = new Map<number, HeadingField>();
  for (const a of headingResult.assignments) {
    headingFieldByIdx.set(a.idx, a.field);
  }

  const bulletsByField = new Map<HybridBulletField, string[]>();
  const headingGroupsClassified: HybridExtractionMeta["headingGroupsClassified"] = [];
  const headingGroupsSkipped: HybridExtractionMeta["headingGroupsSkipped"] = [];

  for (const group of headingGroups) {
    const field = headingFieldByIdx.get(group.idx) ?? null;
    if (isHybridBulletField(field) && group.items.length > 0) {
      const existing = bulletsByField.get(field) ?? [];
      existing.push(...group.items);
      bulletsByField.set(field, existing);
      headingGroupsClassified.push({
        idx: group.idx,
        heading: group.heading,
        field,
        itemCount: group.items.length,
      });
    } else {
      headingGroupsSkipped.push({
        idx: group.idx,
        heading: group.heading,
        field,
        itemCount: group.items.length,
      });
    }
  }

  // ── Narrative (Pass A indices → code-side join, never re-generated) ────
  const narrativeBuckets = new Map<HybridNarrativeField, string[]>();
  const paragraphAssignments: HybridExtractionMeta["paragraphAssignments"] = [];
  const seenIdx = new Set<number>();

  for (const a of narrativeResult.assignments) {
    if (a.idx < 0 || a.idx >= paragraphs.length) continue;
    if (seenIdx.has(a.idx)) continue;
    seenIdx.add(a.idx);

    const text = paragraphs[a.idx].text;
    paragraphAssignments.push({
      idx: a.idx,
      field: a.field,
      preview: text.slice(0, PARAGRAPH_PREVIEW_TRUNCATE),
    });

    if (isHybridNarrativeField(a.field)) {
      const existing = narrativeBuckets.get(a.field) ?? [];
      existing.push(text);
      narrativeBuckets.set(a.field, existing);
    }
  }

  // ── Merge ─────────────────────────────────────────────────────────────
  const merged: Record<string, unknown> = {};

  // Pass B facts (copy directly; null becomes undefined via JobPosting.transform).
  const factEntries: Array<[keyof RoleFactFieldsT, unknown]> = Object.entries(facts) as Array<
    [keyof RoleFactFieldsT, unknown]
  >;
  for (const [k, v] of factEntries) {
    merged[k as string] = v;
  }

  for (const field of HYBRID_BULLET_FIELDS) {
    const items = bulletsByField.get(field);
    merged[field] = items && items.length > 0 ? items : null;
  }

  for (const field of HYBRID_NARRATIVE_FIELDS) {
    const parts = narrativeBuckets.get(field);
    merged[field] = parts && parts.length > 0 ? parts.join("\n\n") : null;
  }

  // Validate against the canonical schema. JobPostingExtractionSchema (the
  // structural contract) plus JobPosting (which adds preprocessors + null→
  // undefined transform).
  const validated = JobPosting.parse(JobPostingExtractionSchema.parse(merged));

  const meta: HybridExtractionMeta = {
    headingGroupsClassified,
    headingGroupsSkipped,
    paragraphAssignments,
    stats: {
      domHeadings: headingGroups.length,
      domListItems: countListItems(opts.scrapedElements),
      paragraphsFiltered: paragraphs.length,
      bulletGroupsClassified: headingGroupsClassified.length,
      bulletGroupsSkipped: headingGroupsSkipped.length,
    },
  };

  return Object.assign({} as HybridJobPosting, validated, { _hybridMeta: meta });
}
