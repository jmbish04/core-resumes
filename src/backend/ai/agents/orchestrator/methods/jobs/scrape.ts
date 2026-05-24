import { z } from "zod";

import type { ScrapeResult } from "@/ai/tools/browser-rendering";

import { extractRolePostingHybrid, extractStructuredRolePosting } from "@/ai/tasks";
import { BrowserRendering } from "@/ai/tools/browser-rendering";
import { parseGreenhouseUrl, scrapeGreenhouseJob } from "@/ai/tools/greenhouse";
import {
  classifyScrapedElements,
  groupedBulletsByType,
  HYBRID_SCRAPE_SELECTORS,
} from "@/ai/tools/role/html-bullet-parser";

import { JobPosting, JobPostingSchema, type DetailedScrapeResult } from "../../types";

// ---------------------------------------------------------------------------
// Fidelity metadata types — kept exported for legacy /reconcile call sites.
// New code should rely on `_hybridMeta` produced by the hybrid pipeline.
// ---------------------------------------------------------------------------

export type FidelityFlag = {
  field: string;
  index: number;
  status: "auto_corrected" | "dom_only";
  aiBullet?: string;
  domBullet: string;
};

export type FidelityMeta = {
  truncatedBullets: FidelityFlag[];
  missingBullets: FidelityFlag[];
  domBulletCount: number;
  aiBulletCount: number;
};

/**
 * @deprecated Hybrid extraction sources bullets directly from the DOM, so
 * field → RoleBulletType remapping is no longer needed in the production
 * pipeline. Retained for the deprecated `reconcileJobExtractions` helper.
 */
const FIELD_TO_BULLET_TYPE: Record<string, string> = {
  responsibilities: "KEY_RESPONSIBILITY",
  requiredQualifications: "REQUIRED_QUALIFICATION",
  preferredQualifications: "PREFERRED_QUALIFICATION",
  requiredSkills: "REQUIRED_SKILL",
  preferredSkills: "PREFERRED_SKILL",
  benefits: "BENEFIT",
  educationRequirements: "EDUCATION_REQUIREMENT",
};

/**
 * Scrape a job URL via Browser Rendering.
 *
 * Concurrent calls (with a hard timeout):
 *   - `/markdown` → human-readable content used by Pass B fact extraction
 *   - `/pdf`      → archival snapshot uploaded to R2 for the user
 *   - `/scrape`   → DOM elements (h1-h3, ul>li, ol>li, p) for Pass H/A
 *
 * The legacy `/json` endpoint (its own LLM call inside Browser Rendering)
 * is intentionally NOT requested — the hybrid pipeline replaces it with
 * three small, faster, structured-output calls under our control.
 *
 * Falls back to the Greenhouse public API for Greenhouse URLs when all BR
 * methods fail.
 */
export async function handleScrapeJob(env: Env, url: string): Promise<DetailedScrapeResult> {
  const ghParsed = parseGreenhouseUrl(url);
  const browser = new BrowserRendering(env);

  // BR sessions can hang indefinitely on complex pages. Without an outer
  // timeout, tasks running inside ctx.waitUntil() never transition to
  // "failed" and block the orchestrator queue.
  const BR_TIMEOUT_MS = 120_000;

  const brPromise = Promise.allSettled([
    browser.extractMarkdown(url),
    browser.capturePdf(url),
    browser.scrapeElements(url, [...HYBRID_SCRAPE_SELECTORS]),
  ]);

  const timeoutPromise = new Promise<PromiseSettledResult<unknown>[]>((resolve) =>
    setTimeout(
      () =>
        resolve([
          { status: "rejected", reason: new Error("BR timeout") },
          { status: "rejected", reason: new Error("BR timeout") },
          { status: "rejected", reason: new Error("BR timeout") },
        ]),
      BR_TIMEOUT_MS,
    ),
  );

  const [mdResult, pdfResult, scrapeResult] = (await Promise.race([brPromise, timeoutPromise])) as [
    PromiseSettledResult<string>,
    PromiseSettledResult<ArrayBuffer>,
    PromiseSettledResult<ScrapeResult>,
  ];

  const mdOk = mdResult.status === "fulfilled" && mdResult.value.length > 100;
  const pdfOk = pdfResult.status === "fulfilled";
  const scrapeOk = scrapeResult.status === "fulfilled";

  let pdfUrl: string | undefined;
  if (pdfOk) {
    try {
      const key = `job-postings/${crypto.randomUUID()}.pdf`;
      pdfUrl = await browser.uploadPdfToR2(key, pdfResult.value as ArrayBuffer, {
        sourceUrl: url,
        capturedAt: new Date().toISOString(),
      });
    } catch {
      console.error("PDF R2 upload failed (non-fatal)");
    }
  }

  if (mdOk) {
    return {
      html: "",
      text: mdResult.value,
      markdown: mdResult.value,
      links: [{ href: url }],
      pdfUrl,
      scrapedElements: scrapeOk ? scrapeResult.value : undefined,
    };
  }

  // Fallback to Greenhouse API for Greenhouse URLs
  if (ghParsed) {
    try {
      const ghResult = await scrapeGreenhouseJob(ghParsed.boardToken, ghParsed.jobId);
      return { ...ghResult, pdfUrl };
    } catch (error) {
      console.error(
        `Greenhouse API fallback also failed for ${url}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  throw new Error(`All scrape methods failed for ${url}`);
}

/**
 * Run the production extractor for a job posting.
 *
 * When `scrapedElements` is provided (it always should be in the orchestrator
 * pipeline), the call is a single hybrid extraction — Pass H + Pass A + Pass B
 * with deterministic merge. When it isn't (e.g. callers passing pure
 * markdown / plaintext from PDF ingestion), this routes through the lossy
 * single-blob fallback in `extractStructuredRolePosting`.
 */
export async function handleExtractJobDetails(
  env: Env,
  text: string,
  scrapedElements?: ScrapeResult,
) {
  if (scrapedElements && scrapedElements.length > 0) {
    return extractRolePostingHybrid(env, { markdown: text, scrapedElements });
  }

  return extractStructuredRolePosting(env, {
    text,
    schema: JobPosting,
    extractionSchema: JobPostingSchema,
  });
}

// ---------------------------------------------------------------------------
// Legacy reconciliation helpers — DEPRECATED but still callable
// ---------------------------------------------------------------------------

/** Normalize whitespace and lowercase for fuzzy comparison. */
function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function findBestDomMatch(
  aiBullet: string,
  domBullets: string[],
  usedIndices: Set<number>,
): { index: number; domText: string; score: number } | null {
  const aiNorm = normalize(aiBullet);
  if (!aiNorm) return null;

  let bestIdx = -1;
  let bestScore = 0;
  let bestText = "";

  for (let i = 0; i < domBullets.length; i++) {
    if (usedIndices.has(i)) continue;
    const domNorm = normalize(domBullets[i]);
    if (!domNorm) continue;

    if (aiNorm === domNorm) {
      return { index: i, domText: domBullets[i].trim(), score: 1 };
    }

    if (domNorm.includes(aiNorm)) {
      const score = aiNorm.length / domNorm.length;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
        bestText = domBullets[i].trim();
      }
      continue;
    }

    if (aiNorm.includes(domNorm) && domNorm.length > 20) {
      const score = domNorm.length / aiNorm.length;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
        bestText = domBullets[i].trim();
      }
      continue;
    }

    const prefixLen = Math.min(40, Math.floor(domNorm.length * 0.4));
    if (prefixLen > 15 && aiNorm.startsWith(domNorm.substring(0, prefixLen))) {
      const score = aiNorm.length / domNorm.length;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
        bestText = domBullets[i].trim();
      }
    }
  }

  if (bestIdx >= 0 && bestScore > 0.15) {
    return { index: bestIdx, domText: bestText, score: bestScore };
  }

  return null;
}

/**
 * Reconcile two AI extractions against each other and against the DOM.
 *
 * @deprecated The hybrid pipeline (`extractRolePostingHybrid`) sources
 * bullets directly from the DOM, eliminating by construction the truncation
 * failure mode this function was patching. Retained only for legacy callers
 * that still produce `markdownExtract` + `jsonExtract` pairs without the
 * hybrid path. New code should NOT use this function.
 */
export function reconcileJobExtractions(
  markdownExtract: z.infer<typeof JobPosting>,
  jsonExtract?: z.infer<typeof JobPosting>,
  elements?: ScrapeResult,
): z.infer<typeof JobPosting> & { _fidelityMeta?: FidelityMeta } {
  const rawTextNodes = new Set<string>();
  if (elements) {
    for (const group of elements) {
      for (const res of group.results) {
        if (res.text) rawTextNodes.add(res.text.trim());
      }
    }
  }

  function countExactMatches(bullets?: string[]) {
    if (!bullets) return 0;
    return bullets.filter((b) =>
      Array.from(rawTextNodes).some((n) => n.includes(b.trim()) || b.trim().includes(n)),
    ).length;
  }

  const fieldsToCompare: (keyof z.infer<typeof JobPosting>)[] = [
    "responsibilities",
    "requiredQualifications",
    "preferredQualifications",
    "requiredSkills",
    "preferredSkills",
    "benefits",
  ];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reconciled: any = { ...markdownExtract };

  if (jsonExtract) {
    for (const field of fieldsToCompare) {
      const mdBullets = markdownExtract[field] as string[] | undefined;
      const jsonBullets = jsonExtract[field] as string[] | undefined;

      const mdMatches = countExactMatches(mdBullets);
      const jsonMatches = countExactMatches(jsonBullets);

      if (jsonMatches > mdMatches) {
        reconciled[field] = jsonBullets;
      } else if (
        jsonMatches === mdMatches &&
        jsonBullets &&
        (!mdBullets || jsonBullets.length > mdBullets.length)
      ) {
        reconciled[field] = jsonBullets;
      }
    }

    for (const key of Object.keys(JobPostingSchema.shape)) {
      if (!reconciled[key] && jsonExtract[key as keyof typeof jsonExtract]) {
        reconciled[key] = jsonExtract[key as keyof typeof jsonExtract];
      }
    }
  }

  if (!elements) {
    return reconciled as z.infer<typeof JobPosting>;
  }

  const classified = classifyScrapedElements(elements);
  const domByType = groupedBulletsByType(classified);

  const fidelity: FidelityMeta = {
    truncatedBullets: [],
    missingBullets: [],
    domBulletCount: 0,
    aiBulletCount: 0,
  };

  for (const items of Object.values(domByType)) {
    if (items) fidelity.domBulletCount += items.length;
  }

  for (const field of fieldsToCompare) {
    const aiBullets: string[] = reconciled[field] ?? [];
    const bulletType = FIELD_TO_BULLET_TYPE[field];
    const domBullets = bulletType ? (domByType[bulletType as keyof typeof domByType] ?? []) : [];

    fidelity.aiBulletCount += aiBullets.length;

    if (domBullets.length === 0) continue;

    const correctedBullets = [...aiBullets];
    const usedDomIndices = new Set<number>();

    for (let i = 0; i < correctedBullets.length; i++) {
      const match = findBestDomMatch(correctedBullets[i], domBullets, usedDomIndices);
      if (!match) continue;

      usedDomIndices.add(match.index);

      const aiLen = correctedBullets[i].trim().length;
      const domLen = match.domText.length;
      if (domLen > aiLen * 1.2) {
        fidelity.truncatedBullets.push({
          field,
          index: i,
          status: "auto_corrected",
          aiBullet: correctedBullets[i],
          domBullet: match.domText,
        });
        correctedBullets[i] = match.domText;
      }
    }

    for (let d = 0; d < domBullets.length; d++) {
      if (usedDomIndices.has(d)) continue;
      const domText = domBullets[d].trim();
      if (domText.length < 10) continue;

      const isAlreadyCovered = correctedBullets.some((ai) => {
        const aiNorm = normalize(ai);
        const domNorm = normalize(domText);
        return aiNorm.includes(domNorm) || domNorm.includes(aiNorm);
      });

      if (!isAlreadyCovered) {
        const insertIdx = correctedBullets.length;
        correctedBullets.push(domText);
        fidelity.missingBullets.push({
          field,
          index: insertIdx,
          status: "dom_only",
          domBullet: domText,
        });
      }
    }

    reconciled[field] = correctedBullets;
  }

  if (fidelity.truncatedBullets.length > 0 || fidelity.missingBullets.length > 0) {
    reconciled._fidelityMeta = fidelity;
  }

  return reconciled as z.infer<typeof JobPosting> & { _fidelityMeta?: FidelityMeta };
}
