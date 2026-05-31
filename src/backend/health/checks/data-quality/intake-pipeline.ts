import type { HealthStepResult } from "@/backend/health/types";

import { extractRolePostingHybrid } from "@/ai/tasks/extract/role-hybrid";
import { HYBRID_SCRAPE_SELECTORS } from "@/ai/tools/role/html-bullet-parser";
import { BrowserRendering } from "@/backend/ai/tools/browser-rendering";

import { findSFAreaJob } from "../job-board-apis/greenhouse-boards";

/**
 * End-to-end intake pipeline health check.
 *
 * Validates the production hybrid extraction flow against a real Greenhouse
 * job posting:
 *   1. Greenhouse API — pick a random live SF Bay Area listing.
 *   2. Browser Rendering `/markdown` + `/scrape` — concurrent.
 *   3. Hybrid extraction — Pass H + Pass A + Pass B (`extractRolePostingHybrid`).
 *   4. Smoke-check the result has populated `companyName` and `jobTitle`.
 *
 * Mirrors what the real intake route does in production (`routes/intake.ts` →
 * `extract()` → `extractRolePostingHybrid()`).
 */
export async function checkIntakePipeline(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const issues: string[] = [];
  const details: Record<string, unknown> = {};

  // ── Step 1: pick a job ─────────────────────────────────────────────────
  let jobUrl = "";
  let jobTitle = "";
  try {
    const boardResult = await findSFAreaJob(env);
    jobUrl = boardResult.job.absolute_url;
    jobTitle = boardResult.job.title;
    details.greenhouseStatus = "ok";
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
    const msg = error instanceof Error ? error.message : String(error);
    issues.push(`Greenhouse job selection failed: ${msg}`);
    details.greenhouseStatus = "fail";
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: issues.join("; "),
      details,
    };
  }

  // ── Step 2: Browser Rendering markdown + DOM scrape ────────────────────
  const browser = new BrowserRendering(env);
  const [mdResult, scrapeResult] = await Promise.allSettled([
    browser.extractMarkdown(jobUrl),
    browser.scrapeElements(jobUrl, [...HYBRID_SCRAPE_SELECTORS]),
  ]);

  let markdownContent = "";
  if (mdResult.status === "fulfilled") {
    markdownContent = mdResult.value;
    details.scrapeBytes = markdownContent.length;
    details.scrapeMethod = "markdown";
    details.scrapeStatus = markdownContent.length > 200 ? "ok" : "too_short";
    if (markdownContent.length < 200) {
      issues.push(
        `Markdown extraction returned only ${markdownContent.length} chars for ${jobUrl}`,
      );
    }
  } else {
    issues.push(
      `Browser Rendering /markdown failed: ${String(mdResult.reason).slice(0, 200)}`,
    );
    details.scrapeStatus = "fail";
    details.scrapeMethod = "markdown";
  }

  if (scrapeResult.status !== "fulfilled") {
    issues.push(
      `Browser Rendering /scrape failed: ${String(scrapeResult.reason).slice(0, 200)}`,
    );
    details.domScrapeStatus = "fail";
  } else {
    details.domScrapeStatus = "ok";
  }

  // ── Step 3: hybrid extraction ──────────────────────────────────────────
  if (markdownContent.length > 200 && scrapeResult.status === "fulfilled") {
    try {
      const extracted = await extractRolePostingHybrid(env, {
        markdown: markdownContent,
        scrapedElements: scrapeResult.value,
      });

      details.extractStatus = "ok";
      details.extractedCompany = extracted.companyName ?? "(missing)";
      details.extractedTitle = extracted.jobTitle ?? "(missing)";
      details.hybridMeta = extracted._hybridMeta?.stats;

      if (!extracted.companyName)
        issues.push("Hybrid extraction returned empty companyName");
      if (!extracted.jobTitle)
        issues.push("Hybrid extraction returned empty jobTitle");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      issues.push(`Hybrid extraction failed: ${msg}`);
      details.extractStatus = "fail";
      details.extractError = msg.slice(0, 300);
    }
  }

  return {
    status: issues.length === 0 ? "ok" : issues.length === 1 ? "warn" : "fail",
    latencyMs: Date.now() - start,
    error: issues.length > 0 ? issues.join("; ") : undefined,
    details,
  };
}
