# Multi-Pass Browser Rendering Scraping & Extraction

We will update the job scraping orchestrator task to perform a more robust, multi-pass data collection and extraction process using the full capabilities of the new `BrowserRendering` class.

## Goal

Improve extraction accuracy for job postings by using a layered approach:

1. Extract raw Markdown for AI processing.
2. Capture a PDF for archival.
3. Capture a JSON structured extraction natively via Browser Rendering's AI integration.
4. Scrape raw HTML elements (headers, lists, logos, colors) to assist in verbatim bullet extraction and company branding.
5. Compare the AI extractions (Markdown -> AI vs JSON AI directly) to ensure data fidelity.

## Proposed Changes

### `src/backend/ai/agents/orchestrator/methods/jobs/scrape.ts`

- Add `zodToJsonSchema` to convert the `JobPosting` zod schema for `browser.captureJSON`.
- Update `handleScrapeJob` to run four concurrent Browser Rendering operations:
  1. `browser.extractMarkdown(url)`
  2. `browser.capturePdf(url)`
  3. `browser.captureJSON(url, { prompt, responseFormat })` using the extracted Zod JSON schema and the same strict verbatim prompt from `extract.ts`.
  4. `browser.scrapeElements(url, [ { selector: "h1, h2, h3" }, { selector: "ul > li" }, { selector: "img" } ])`
- Return these new data points in a newly extended `ScrapedPage` return type (or inline extended type) so the orchestrator has access to `jsonExtract` and `htmlElements`.

### `src/backend/ai/tasks/extract.ts`

- Export the `defaultPrompt` string so that `scrape.ts` can import and reuse the EXACT same prompt for the `captureJSON` call, guaranteeing the exact same instructions are sent.

### `src/backend/ai/agents/orchestrator/types.ts`

- Update the expected `ScrapedPage` type, or create a specific `DetailedScrapeResult` type that encompasses `markdown`, `pdfUrl`, `jsonExtract` (raw object), and `scrapedElements` for use in later tasks.

## Open Questions

> [!IMPORTANT]
> **Comparison Logic Destination**
> Where should the actual "comparison" logic live? `handleScrapeJob` just gathers the raw materials. Should we pass both the markdown-extracted `JobPosting` and the BR-JSON-extracted `JobPosting` into a third "reconciliation" step to merge them, or should we pass the array elements directly to the prompt as additional context?

> [!WARNING]
> **Theme Color Extraction**
> Extracting theme colors from raw HTML elements is often messy without full CSS computation. `scrapeElements` captures attributes and innerHTML. Are there specific attributes (like inline styles) you want captured, or is the `brand-colors.ts` tool (which uses `captureJSON`) preferred for robust color extraction?
