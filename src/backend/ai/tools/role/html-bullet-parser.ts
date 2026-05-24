/**
 * @fileoverview HTML Sidecar Bullet Parser
 *
 * Takes raw `ScrapeResult` from `BrowserRendering.scrapeElements()` (headings,
 * list items, and paragraphs) and converts it into structured DOM data ready
 * for AI classification.
 *
 * In the hybrid extraction pipeline (`extractRolePostingHybrid`), the helpers
 * here are pure data-shaping — no heading classification, no regex patterns,
 * no model calls. Pass H (LLM) labels each heading group dynamically, which
 * is more robust across the long tail of company-specific phrasing than the
 * old static regex map.
 *
 * Legacy regex-based helpers (`classifyScrapedElements`, `groupedBulletsByType`)
 * are kept exported for the few remaining call sites that haven't migrated to
 * the hybrid path. They are marked `@deprecated` — prefer `extractHeadingGroups`
 * + Pass H for new code.
 */

import type { RoleBulletType } from "../../../db/schemas/applications/role-bullets";
import type { ScrapeResult, ScrapeResultItem } from "../browser-rendering";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw heading group — every heading on the page with its grouped <li>s. */
export type HeadingGroup = {
  /** Stable index used by Pass H to label headings without echoing the text. */
  idx: number;
  /** Verbatim heading text. */
  heading: string;
  /** Vertical pixel position from the DOM bounding rect (used for ordering). */
  top: number;
  /** Verbatim list-item texts grouped under this heading by `top` proximity. */
  items: string[];
};

/** Filtered, deduplicated narrative paragraph. */
export type FilteredParagraph = {
  text: string;
  top: number;
};

/** Selectors required for the hybrid extraction pipeline. */
export const HYBRID_SCRAPE_SELECTORS = [
  { selector: "h1, h2, h3" },
  { selector: "ul > li" },
  { selector: "ol > li" },
  { selector: "p" },
] as const;

/**
 * Legacy classified bullet group (regex-driven `RoleBulletType` mapping).
 *
 * @deprecated Use `extractHeadingGroups()` + Pass H (`classifyHeadingsByIndex`)
 * for new code. Kept so the `extraction-fidelity` health check and
 * `reconcileJobExtractions` continue to compile during the rollout.
 */
export type ParsedBulletGroup = {
  heading: string;
  type: RoleBulletType | null;
  items: string[];
  topPosition: number;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function pickGroup(
  elements: ScrapeResult,
  predicate: (selector: string) => boolean,
): ScrapeResultItem[] {
  const group = elements.find((g) => predicate(g.selector));
  if (!group) return [];
  return group.results.filter((r) => (r.text ?? "").trim().length > 0);
}

function selectorIncludesHeading(selector: string): boolean {
  return selector.includes("h1") || selector.includes("h2") || selector.includes("h3");
}

function selectorIsListItem(selector: string): boolean {
  return selector.includes("li");
}

function selectorIsParagraph(selector: string): boolean {
  return selector.trim() === "p";
}

/**
 * Group list-item items under their nearest preceding heading by `top`.
 * Headings with no items still get an entry (Pass H may label them `skip`).
 */
function groupListItemsUnderHeadings(
  headings: ScrapeResultItem[],
  listItems: ScrapeResultItem[],
): HeadingGroup[] {
  const groups: HeadingGroup[] = headings.map((h, idx) => ({
    idx,
    heading: h.text.trim(),
    top: h.top ?? 0,
    items: [],
  }));

  for (const li of listItems) {
    const liTop = li.top ?? 0;
    let bestIdx = -1;
    let bestTop = -Infinity;
    for (const g of groups) {
      if (g.top <= liTop && g.top > bestTop) {
        bestTop = g.top;
        bestIdx = g.idx;
      }
    }
    if (bestIdx >= 0) {
      groups[bestIdx].items.push(li.text.trim());
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Hybrid pipeline helpers (preferred)
// ---------------------------------------------------------------------------

/**
 * Extract every heading on the page along with its grouped `<li>` items.
 *
 * No classification is performed — Pass H (`classifyHeadingsByIndex`) labels
 * each entry by index. Returned ordered top-down. Headings with no list items
 * are still emitted (typical for narrative sections like "About <Company>")
 * so Pass H can label them `skip` and Pass A can pick up their paragraphs.
 */
export function extractHeadingGroups(elements: ScrapeResult): HeadingGroup[] {
  if (!elements || elements.length === 0) return [];

  const headings = pickGroup(elements, selectorIncludesHeading)
    .slice()
    .sort((a, b) => (a.top ?? 0) - (b.top ?? 0));

  // Combine ul>li and ol>li into a single list-item stream.
  const listItems = pickGroup(elements, selectorIsListItem)
    .slice()
    .sort((a, b) => (a.top ?? 0) - (b.top ?? 0));

  if (headings.length === 0) return [];

  return groupListItemsUnderHeadings(headings, listItems);
}

/**
 * Filter raw `<p>` elements down to genuine narrative paragraphs.
 *
 * Mirrors the Python reference (`scripts/test-extraction-fidelity.py`,
 * `parse_dom_groups`):
 *   - drop paragraphs shorter than 40 chars
 *   - drop paragraphs that exactly match a heading (some Greenhouse pages
 *     re-render the heading text as a `<p>`)
 *   - drop paragraphs that are substrings of (or contain) a list-item text
 *     longer than 30 chars — list items are already DOM-extracted and we
 *     don't want them double-counted as narrative
 *   - dedupe case-insensitively (some templates emit the same paragraph twice)
 *
 * Returned ordered top-down so Pass A's index assignments keep meaning.
 */
export function extractFilteredParagraphs(elements: ScrapeResult): FilteredParagraph[] {
  if (!elements || elements.length === 0) return [];

  const headings = pickGroup(elements, selectorIncludesHeading);
  const listItems = pickGroup(elements, selectorIsListItem);
  const rawParagraphs = pickGroup(elements, selectorIsParagraph)
    .slice()
    .sort((a, b) => (a.top ?? 0) - (b.top ?? 0));

  const headingTextsLc = new Set(headings.map((h) => h.text.trim().toLowerCase()));
  const listItemTextsLc = listItems.map((li) => li.text.trim().toLowerCase());

  const seen = new Set<string>();
  const out: FilteredParagraph[] = [];

  for (const p of rawParagraphs) {
    const text = (p.text ?? "").trim();
    if (text.length < 40) continue;

    const lc = text.toLowerCase();
    if (headingTextsLc.has(lc)) continue;

    // Mirror the Python reference exactly:
    //   drop if paragraph is a substring of any <li> (no length gate), OR
    //   drop if any <li> is a substring of the paragraph AND that <li> is >30 chars.
    let collidesWithListItem = false;
    for (const lt of listItemTextsLc) {
      if (!lt) continue;
      if (lt.includes(lc)) {
        collidesWithListItem = true;
        break;
      }
      if (lc.includes(lt) && lt.length > 30) {
        collidesWithListItem = true;
        break;
      }
    }
    if (collidesWithListItem) continue;

    if (seen.has(lc)) continue;
    seen.add(lc);
    out.push({ text, top: p.top ?? 0 });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Legacy regex classifier (deprecated)
// ---------------------------------------------------------------------------

const HEADING_CLASSIFIERS: Array<{
  type: RoleBulletType;
  patterns: RegExp[];
}> = [
  {
    type: "KEY_RESPONSIBILITY",
    patterns: [
      /responsibilit/i,
      /what you('|')?ll do/i,
      /the role/i,
      /your role/i,
      /about the job/i,
      /job duties/i,
      /day.to.day/i,
    ],
  },
  {
    type: "REQUIRED_QUALIFICATION",
    patterns: [
      /minimum qualif/i,
      /required qualif/i,
      /basic qualif/i,
      /must have/i,
      /requirements$/i,
      /what we('|')?re looking for/i,
      /who you are/i,
    ],
  },
  {
    type: "PREFERRED_QUALIFICATION",
    patterns: [/preferred qualif/i, /nice to have/i, /bonus/i, /ideal/i, /additionally/i],
  },
  {
    type: "EDUCATION_REQUIREMENT",
    patterns: [/education/i, /degree/i, /academic/i],
  },
  {
    type: "REQUIRED_SKILL",
    patterns: [/required skill/i, /technical skill/i, /skills required/i, /core compet/i],
  },
  {
    type: "PREFERRED_SKILL",
    patterns: [/preferred skill/i, /additional skill/i],
  },
  {
    type: "BENEFIT",
    patterns: [
      /benefit/i,
      /perk/i,
      /compensation/i,
      /salary/i,
      /what we offer/i,
      /why join/i,
      /why work/i,
    ],
  },
];

function classifyHeading(headingText: string): RoleBulletType | null {
  for (const { type, patterns } of HEADING_CLASSIFIERS) {
    for (const pattern of patterns) {
      if (pattern.test(headingText)) return type;
    }
  }
  return null;
}

/**
 * Parse scraped DOM elements into classified bullet groups (regex-driven).
 *
 * @deprecated The hybrid extraction pipeline replaces the regex map with a
 * Pass H LLM call. New code should use `extractHeadingGroups` and call
 * `classifyHeadingsByIndex` from `@/ai/tasks/classify-headings`.
 *
 * Kept for the `extraction-fidelity` health check (which still cross-checks
 * regex output against the DOM as a fast smoke test) and the
 * `reconcileJobExtractions` truncation-correction path (also deprecated).
 */
export function classifyScrapedElements(elements: ScrapeResult): ParsedBulletGroup[] {
  const groups = extractHeadingGroups(elements);
  return groups
    .filter((g) => g.items.length > 0)
    .map((g) => ({
      heading: g.heading,
      type: classifyHeading(g.heading),
      items: g.items,
      topPosition: g.top,
    }))
    .sort((a, b) => a.topPosition - b.topPosition);
}

/**
 * Flatten classified groups into a simple Record keyed by `RoleBulletType`.
 *
 * @deprecated Hybrid pipeline produces field-keyed bullet maps directly via
 * `extractRolePostingHybrid`. Kept for legacy call sites only.
 */
export function groupedBulletsByType(
  groups: ParsedBulletGroup[],
): Partial<Record<RoleBulletType, string[]>> {
  const result: Partial<Record<RoleBulletType, string[]>> = {};

  for (const group of groups) {
    if (!group.type) continue;
    if (!result[group.type]) result[group.type] = [];
    result[group.type]!.push(...group.items);
  }

  return result;
}
