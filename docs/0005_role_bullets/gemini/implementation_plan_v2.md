# Multi-Pass Browser Rendering Scraping & Extraction

We will update the job scraping orchestrator task to perform a robust, three-fold data collection and extraction process using the `BrowserRendering` class. We will also incorporate logo extraction to improve company profiles.

## Goal

Improve extraction accuracy for job postings by using a layered approach and explicitly comparing the results.
Additionally, extract company logos and upload them to Cloudflare Images for the company profile.

## Proposed Changes

### `src/backend/ai/agents/orchestrator/methods/jobs/scrape.ts`

- **Three-Fold Scrape Job:**
  Update `handleScrapeJob` to run these operations concurrently:
  1. **Markdown to AI:** `browser.extractMarkdown(url)` -> feed this output into the existing `extractStructuredRolePosting` (via Workers AI).
  2. **Browser Render JSON:** `browser.captureJSON(url, { prompt, responseFormat })` using the extracted Zod JSON schema and the same strict verbatim prompt from `extract.ts`.
  3. **Browser Render Scrape:** `browser.scrapeElements(url, [{ selector: "h1, h2, h3" }, { selector: "ul > li" }])` to act as our sidecar data source for verbatim list matching.
     _(We will also still run `browser.capturePdf(url)` for archival)._

- **Comparison Reconciliation:**
  Instead of passing only one source of truth, `handleScrapeJob` will return an enriched payload containing `markdownOutput`, `jsonOutput`, and `scrapedElements`. We will create a reconciliation function (e.g., `compareAndReconcileExtractions`) that inspects both JSON structures and cross-references the `scrapedElements` to produce the highest fidelity `JobPosting` object.

### `src/backend/ai/tools/google/templates/brand-colors.ts` & Company Logic

- **Theme & Logo Extraction via Browser Render:**
  The Cloudflare `/scrape` endpoint returns element attributes, but capturing dynamic/computed CSS theme colors is notoriously difficult with just static CSS selectors.
  Instead, we will use the **`/json` endpoint (Browser Render AI)** to extract both the `themeColors` (primary/accent) AND the `logoUrl`.
  We will update the `captureJSON` prompt in `brand-colors.ts` (or a dedicated company enrichment task) to explicitly locate the company logo image URL.

- **Logo Upload Flow:**
  Once the AI identifies the `logoUrl`, we will fetch the raw image buffer and upload it using our existing `uploadScreenshotToImages` logic (or a modified version for arbitrary image buffers) to Cloudflare Images. The returned Cloudflare Images delivery URL will be saved to the `companies` (or `roles`) D1 table.

### `src/backend/ai/tasks/extract.ts`

- Export the `defaultPrompt` string so that `scrape.ts` can import and reuse the EXACT same instructions for the `captureJSON` call.

## Open Questions

> [!IMPORTANT]
> **Comparison Heuristics**
> During reconciliation of the 3 streams, should we prioritize the `browser.captureJSON` output or the `markdown -> workers AI` output as the default base? (Usually, direct markdown->AI has context size advantages, but BR's native JSON might be cleaner).

> [!TIP]
> **Logo Extraction**
> Do you want the logo extraction to happen synchronously during the initial job scrape, or should it be a separate orchestrator task (`extract_brand_assets`) that runs asynchronously after the job is ingested?
