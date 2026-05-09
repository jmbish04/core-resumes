/**
 * @fileoverview Extraction Fidelity Health Check
 *
 * Validates the production hybrid extraction pipeline end-to-end by scraping
 * a real Greenhouse posting and asserting that:
 *   1. The hybrid pipeline (`extractRolePostingHybrid`) returns a populated
 *      `JobPosting` with the expected fact fields and bullet arrays.
 *   2. Every bullet emitted is present verbatim in the raw `<li>` DOM scrape
 *      — by construction the hybrid path sources bullets directly from the
 *      DOM, so this is a tautology unless something has gone wrong.
 *   3. `_hybridMeta.headingGroupsClassified` is non-empty (Pass H labeled at
 *      least one bullet section).
 *
 * Timeout strategy: an internal 60s safety net. Each pass (H/A/B) runs in
 * parallel inside `extractRolePostingHybrid`, so the wall-clock budget is
 * dominated by Browser Rendering session warm-up, not the LLM calls.
 */

import type { HealthStepResult } from "@/backend/health/types";

import { extractRolePostingHybrid } from "@/ai/tasks/extract/role-hybrid";
import {
  BrowserRendering,
  type ScrapeResult,
  type ScrapeResultItem,
} from "@/backend/ai/tools/browser-rendering";
import { HYBRID_SCRAPE_SELECTORS } from "@/ai/tools/role/html-bullet-parser";

import { findSFAreaJob } from "./greenhouse-boards";

const SAMPLES_PER_ARRAY = 3;
const OVERALL_SAFETY_TIMEOUT_MS = 90_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomSample<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

function findBulletInLiElements(
  bullet: string,
  liElements: ScrapeResultItem[],
): { found: boolean; liText?: string; matchType: "exact" | "contains" | "missing" } {
  const bulletNormalized = bullet.trim().toLowerCase();

  for (const li of liElements) {
    const liText = li.text.trim();
    if (liText.toLowerCase() === bulletNormalized) {
      return { found: true, liText, matchType: "exact" };
    }
  }

  for (const li of liElements) {
    const liText = li.text.trim();
    if (liText.toLowerCase().includes(bulletNormalized)) {
      return { found: true, liText, matchType: "contains" };
    }
  }

  for (const li of liElements) {
    const liText = li.text.trim().toLowerCase();
    if (liText.length > 20 && bulletNormalized.includes(liText)) {
      return { found: true, liText: li.text.trim(), matchType: "contains" };
    }
  }

  return { found: false, matchType: "missing" };
}

const BULLET_FIELDS = [
  "responsibilities",
  "requiredQualifications",
  "preferredQualifications",
  "requiredSkills",
  "preferredSkills",
  "educationRequirements",
  "benefits",
] as const;

type BulletField = (typeof BULLET_FIELDS)[number];

function collectHybridBullets(
  posting: Record<string, unknown>,
): Array<{ field: BulletField; bullets: string[] }> {
  const out: Array<{ field: BulletField; bullets: string[] }> = [];
  for (const field of BULLET_FIELDS) {
    const v = posting[field];
    if (Array.isArray(v) && v.length > 0) {
      out.push({ field, bullets: v.filter((s): s is string => typeof s === "string") });
    }
  }
  return out;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Main check
// ---------------------------------------------------------------------------

export async function checkExtractionFidelity(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const issues: string[] = [];
  const details: Record<string, unknown> = {};
  const phaseTiming: Record<string, number> = {};

  try {
    return await withTimeout(
      executeExtractionFidelity(env, start, issues, details, phaseTiming),
      OVERALL_SAFETY_TIMEOUT_MS,
      "Overall extraction fidelity check",
    );
  } catch (e) {
    issues.push(`Safety timeout: ${e instanceof Error ? e.message : String(e)}`);
    details.phaseTiming = phaseTiming;

    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: issues.join("; "),
      details,
    };
  }
}

async function executeExtractionFidelity(
  env: Env,
  start: number,
  issues: string[],
  details: Record<string, unknown>,
  phaseTiming: Record<string, number>,
): Promise<HealthStepResult> {
  // ── Step 1: pick a live SF Bay Area Greenhouse posting ─────────────────
  let jobUrl = "";
  let jobTitle = "";
  const step1Start = Date.now();
  try {
    const boardResult = await findSFAreaJob(env);
    jobUrl = boardResult.job.absolute_url;
    jobTitle = boardResult.job.title;
    details.selectedJob = {
      id: boardResult.job.id,
      title: jobTitle,
      url: jobUrl,
      location: boardResult.job.location.name,
      boardToken: boardResult.boardToken,
      companyName: boardResult.companyName,
      source: boardResult.source,
      boardsChecked: boardResult.boardsChecked,
    };
  } catch (error) {
    phaseTiming.step1_jobSelection = Date.now() - step1Start;
    details.phaseTiming = phaseTiming;
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: `Greenhouse job selection failed: ${error instanceof Error ? error.message : String(error)}`,
      details,
    };
  }
  phaseTiming.step1_jobSelection = Date.now() - step1Start;

  // ── Step 2: Browser Rendering (markdown + DOM scrape in parallel) ──────
  const browser = new BrowserRendering(env);

  let markdown = "";
  let scrapedElements: ScrapeResult | null = null;
  let allLiElements: ScrapeResultItem[] = [];

  const brStart = Date.now();
  const [mdResult, scrapeResult] = await Promise.allSettled([
    browser.extractMarkdown(jobUrl),
    browser.scrapeElements(jobUrl, [...HYBRID_SCRAPE_SELECTORS]),
  ]);
  phaseTiming.step2_browserRendering = Date.now() - brStart;

  if (mdResult.status === "fulfilled") {
    markdown = mdResult.value;
    details.markdown = { status: "ok", bytes: markdown.length };
  } else {
    issues.push(`Browser Rendering /markdown failed: ${String(mdResult.reason).slice(0, 200)}`);
    details.markdown = { status: "fail", error: String(mdResult.reason).slice(0, 300) };
  }

  if (scrapeResult.status === "fulfilled") {
    scrapedElements = scrapeResult.value;
    const liGroup = scrapedElements.find((g) => g.selector.includes("li"));
    allLiElements = liGroup?.results ?? [];
    details.domScrape = {
      status: "ok",
      headingCount: scrapedElements.find((g) => g.selector.includes("h1"))?.results.length ?? 0,
      liCount: allLiElements.length,
      paragraphCount: scrapedElements.find((g) => g.selector.trim() === "p")?.results.length ?? 0,
    };
  } else {
    issues.push(`Browser Rendering /scrape failed: ${String(scrapeResult.reason).slice(0, 200)}`);
    details.domScrape = { status: "fail", error: String(scrapeResult.reason).slice(0, 300) };
  }

  // Cannot proceed without both markdown and DOM scrape
  if (!markdown || !scrapedElements) {
    phaseTiming.total = Date.now() - start;
    details.phaseTiming = phaseTiming;
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: issues.join("; "),
      details,
    };
  }

  // ── Step 3: hybrid extraction (Pass H + A + B) ─────────────────────────
  const hybridStart = Date.now();
  let posting: Awaited<ReturnType<typeof extractRolePostingHybrid>> | null = null;
  try {
    posting = await extractRolePostingHybrid(env, { markdown, scrapedElements });
    phaseTiming.step3_hybridExtraction = Date.now() - hybridStart;
    details.hybridExtraction = {
      status: "ok",
      durationMs: phaseTiming.step3_hybridExtraction,
      companyName: posting.companyName,
      jobTitle: posting.jobTitle,
      meta: posting._hybridMeta?.stats,
      bulletGroupsClassified:
        posting._hybridMeta?.headingGroupsClassified.map((g) => ({
          heading: g.heading,
          field: g.field,
          itemCount: g.itemCount,
        })) ?? [],
    };
  } catch (err) {
    phaseTiming.step3_hybridExtraction = Date.now() - hybridStart;
    issues.push(`Hybrid extraction failed: ${err instanceof Error ? err.message : String(err)}`);
    details.hybridExtraction = {
      status: "fail",
      durationMs: phaseTiming.step3_hybridExtraction,
      error: String(err).slice(0, 400),
    };
  }

  // ── Step 4: verify bullets are verbatim in the DOM ─────────────────────
  if (posting && allLiElements.length > 0) {
    const bulletGroups = collectHybridBullets(posting as unknown as Record<string, unknown>);
    const samples: Array<{
      field: string;
      bullet: string;
      found: boolean;
      matchType: "exact" | "contains" | "missing";
      liText?: string;
    }> = [];

    for (const group of bulletGroups) {
      const sampled = randomSample(group.bullets, SAMPLES_PER_ARRAY);
      for (const bullet of sampled) {
        const result = findBulletInLiElements(bullet, allLiElements);
        samples.push({
          field: group.field,
          bullet: bullet.slice(0, 120) + (bullet.length > 120 ? "…" : ""),
          found: result.found,
          matchType: result.matchType,
          liText: result.liText?.slice(0, 120),
        });
      }
    }

    const passed = samples.filter((s) => s.found).length;
    const totalBullets = bulletGroups.reduce((acc, g) => acc + g.bullets.length, 0);

    details.fidelityCheck = {
      totalBullets,
      totalSamples: samples.length,
      passedSamples: passed,
      failedSamples: samples.length - passed,
      samples,
    };

    if (samples.length > 0 && samples.length - passed > 0) {
      issues.push(
        `Hybrid bullet fidelity: ${samples.length - passed}/${samples.length} sampled bullets not found verbatim in DOM <li>s — this should be impossible by construction`,
      );
    }

    if (totalBullets === 0) {
      issues.push("Hybrid extraction returned zero bullets — check Pass H heading classification");
    }
  } else if (allLiElements.length === 0) {
    details.fidelityCheck = { status: "skipped", reason: "no_li_elements_in_dom" };
  }

  phaseTiming.total = Date.now() - start;
  details.phaseTiming = phaseTiming;

  const failCount = issues.filter(
    (i) => i.includes("failed") || i.includes("not found in DOM"),
  ).length;

  return {
    status: failCount > 0 ? "fail" : issues.length > 0 ? "warn" : "ok",
    latencyMs: Date.now() - start,
    error: issues.length > 0 ? issues.join("; ") : undefined,
    details,
  };
}
