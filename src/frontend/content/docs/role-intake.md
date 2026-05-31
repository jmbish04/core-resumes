# Role Intake Pipeline

Last updated: May 4, 2026

The role intake pipeline is the entry point for adding new job opportunities to the Career Orchestrator. It transforms a raw job posting URL into structured, actionable data through a hybrid DOM-and-AI extraction process.

## Pipeline Overview

1. **URL Submission** — User pastes a job posting URL into the intake form.
2. **Browser Rendering** — The system extracts the page as markdown, captures a PDF snapshot, and runs a structured DOM scrape (`h1-h3, ul>li, ol>li, p`) in parallel.
3. **Hybrid Extraction** — Three small Workers AI calls (Pass H + Pass A + Pass B) classify and merge content. Bullets are sourced verbatim from the DOM — the AI only labels indices.
4. **Confirmation** — The user reviews the extracted data in a confirmation modal before committing.
5. **Batch Persist** — On confirmation, the role, bullets, company, and Google Drive folder are created.

## Hybrid Extraction

The hybrid pipeline (`src/backend/ai/tasks/extract-role-hybrid.ts`) replaces the legacy single-blob LLM extraction. It is **3-5x faster** (~10s vs ~49s on the validation Anthropic posting), **cheaper** (~1.6k vs ~4k completion tokens), and **provably verbatim** for bullets — the model never reproduces bullet text, only assigns indices.

### Three-source merge

| Source           | Mechanism                                              | Produces                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DOM bullets**  | Browser Rendering `/scrape` → `extractHeadingGroups()` | All `responsibilities`, `requiredQualifications`, `preferredQualifications`, `requiredSkills`, `preferredSkills`, `educationRequirements`, `benefits` arrays — verbatim from `<li>` |
| **Pass H (LLM)** | `classifyHeadingsByIndex()` with `gpt-oss-120b`        | Maps each heading by index → bullet field name (or `skip`)                                                                                                                          |
| **Pass A (LLM)** | `classifyParagraphsByIndex()` with `gpt-oss-120b`      | Maps each filtered `<p>` by index → narrative bucket: `aboutCompany`, `aboutRoleNarrative`, `rtoPolicy`, `visaSponsorship`, `otherContent`, or `skip`                               |
| **Pass B (LLM)** | `extractRoleFactFields()` with `gpt-oss-120b`          | The 12 scalar fields: `companyName`, `jobTitle`, `salaryMin/Max`, `salaryCurrency`, `location`, `workplaceType`, `yearsExperienceMin/Max`, `department`, `reportingTo`, `jobUrl`    |

The three passes run in parallel via `Promise.all()`. The merge is purely deterministic:

- **Bullets**: `groupedItems = headingGroups.filter(g => passH[g.idx] === field)` — verbatim DOM `<li>` text.
- **Narrative**: `field = paragraphs.filter((p, idx) => passA[idx] === field).map(p => p.text).join("\n\n")` — model output is only the field label, the text comes straight from the DOM.
- **Facts**: copy directly from Pass B output.

### Why dynamic heading classification (Pass H)?

Each posting structures content under different headings: Anthropic uses "You may be a good fit if you", another company uses "Minimum Qualifications", another might use "Who you are". A 7-bucket regex map drifts as new postings come in.

Pass H asks the LLM to label each heading by index based on the heading text plus a short preview of the first item beneath it. Empirical results on the validation Anthropic posting:

- 12 headings total → 3 classified into bullet fields (responsibilities, requiredQualifications, preferredQualifications) → 9 labeled `skip`.
- A 22-item EEO disability self-identification list was correctly labeled `skip` because the heading made its purpose clear. **No regex pattern would have caught that without false-positive risk on real benefits/perks lists**.
- 307 completion tokens for Pass H (~$0.0002).

### Pass A — capture-everything default

The Pass A prompt explicitly tells the model: _"When in doubt between `otherContent` and `skip`, pick `otherContent` — we never want to leave real body content on the floor."_ Five narrative buckets cover the entire space, plus `skip` for genuine page chrome (nav labels, button text, footer fragments).

### Telemetry

Hybrid extraction attaches `_hybridMeta` to the result with full provenance:

- `headingGroupsClassified` — the heading groups Pass H labeled into bullet fields.
- `headingGroupsSkipped` — heading groups Pass H labeled `skip` (or that had no items).
- `paragraphAssignments` — Pass A's per-paragraph bucket assignments.
- `stats` — DOM headings/list-items/paragraph-filter counts, plus bullet-group classified/skipped totals.

This metadata is persisted on the role's `metadata.hybridExtraction` field for dashboards and auditing.

## Browser Rendering

The pipeline calls four Browser Rendering endpoints concurrently inside `handleScrapeJob` (orchestrator) and `scrapeWithFallback` (intake API route):

- **`/markdown`** — primary content source; consumed by Pass B.
- **`/pdf`** — archival snapshot uploaded to R2.
- **`/scrape`** — DOM elements with `top` positions; consumed by Pass H + Pass A. Selectors come from `HYBRID_SCRAPE_SELECTORS` in `src/backend/ai/tools/html-bullet-parser.ts`.
- **`/snapshot`** — full HTML for downstream tools (only fetched in the API route).

The legacy `/json` endpoint is **no longer used** — running our own three structured-output calls is faster, cheaper, and gives us full control over the schema.

### Greenhouse Fallback

If all Browser Rendering methods fail and the URL matches a Greenhouse pattern, the system falls back to the Greenhouse public API for structured data retrieval.

## Lossy Fallback Path

When a caller has only markdown / plaintext (e.g. PDF ingestion, pasted job posting), `extractStructuredRolePosting` falls back to a single-blob LLM call against the full `JobPostingExtractionSchema`. This path is **slower and lossier** — long bullets occasionally get summarized — but it's retained for ingestion sources without a DOM. The hybrid path is preferred whenever DOM scrape is available.

## Paragraph Filtering

`extractFilteredParagraphs()` in `src/backend/ai/tools/html-bullet-parser.ts` cleans the raw `<p>` stream before Pass A sees it:

- Drop paragraphs shorter than 40 characters.
- Drop paragraphs that exactly match a heading (some Greenhouse pages re-render heading text as a `<p>`).
- Drop paragraphs that overlap with a list-item text longer than 30 characters — list items are already DOM-extracted and shouldn't be double-counted as narrative.
- Dedupe case-insensitively.

## Confirmation Flow

After extraction, the user sees a **confirmation modal** with:

- Parsed role metadata (title, company, location, salary).
- Extracted bullet points grouped by type with counts.
- Ability to edit any field before confirming.

On confirmation, the `POST /api/intake/confirm` endpoint:

1. Creates the `roles` record with all metadata.
2. Inserts all `role_bullets` classified by type.
3. Creates or finds the `companies` record.
4. Triggers an `OrchestratorAgent` task to create a Google Drive folder and trigger baseline asynchronous tasks (like initial hireability analysis).
   > Note: As of May 2026, the `mock_interview` task generation is fully decoupled from the automatic intake flow and is strictly an on-demand, user-triggered action to conserve tokens and reduce redundant processing.

## Extraction Fidelity Health Check

The **extraction_fidelity** health check now exercises the production hybrid pipeline:

1. Picks a random live SF Bay Area job from the configured Greenhouse boards.
2. Runs Browser Rendering `/markdown` and `/scrape` in parallel.
3. Calls `extractRolePostingHybrid()`.
4. Randomly samples up to 3 bullets per non-empty array (responsibilities, qualifications, benefits, etc.).
5. For each sample, asserts the bullet is present verbatim inside a `<li>` element from the DOM scrape.

By construction, hybrid bullets are sourced from the DOM, so any sample failure is a sign the merge has gone wrong (rare). The check also asserts `_hybridMeta.headingGroupsClassified` is non-empty.

## File Reference

- `src/backend/ai/agents/orchestrator/methods/jobs/scrape.ts` — `handleScrapeJob` (BR orchestration) and `handleExtractJobDetails` (delegates to hybrid).
- `src/backend/ai/agents/orchestrator/methods/jobs/intake.ts` — Confirmation and batch persist.
- `src/backend/ai/tasks/extract-role-hybrid.ts` — Hybrid pipeline orchestrator (Pass H + A + B merge).
- `src/backend/ai/tasks/classify-headings.ts` — Pass H prompt + Zod schema.
- `src/backend/ai/tasks/classify-narrative.ts` — Pass A prompt + Zod schema.
- `src/backend/ai/tasks/extract-facts.ts` — Pass B prompt + Zod schema.
- `src/backend/ai/tasks/extract.ts` — `extractStructuredRolePosting` (delegates to hybrid when scrapedElements is provided; lossy fallback otherwise).
- `src/backend/ai/tools/html-bullet-parser.ts` — DOM helpers: `extractHeadingGroups`, `extractFilteredParagraphs`, `HYBRID_SCRAPE_SELECTORS`. Legacy regex helpers (`classifyScrapedElements`) marked `@deprecated`.
- `src/backend/ai/tools/browser-rendering.ts` — Browser Rendering API wrapper.
- `src/backend/api/routes/intake.ts` — Intake API endpoints.
- `src/backend/health/checks/extraction-fidelity.ts` — Hybrid extraction fidelity health check.
