# Greenhouse

**Greenhouse** appears in two ways: **job posting ingestion** (public Harvest API + URL parsing) and **per-company metadata** stored in D1 for branding and board tokens.

## Job board scraping

Many roles are posted on `job-boards.greenhouse.io` or `boards.greenhouse.io`. Browser-based scraping can be brittle on JS-heavy boards, so the Worker implements a **direct API fallback**.

### Module: `src/backend/ai/tools/greenhouse.ts`

- **`parseGreenhouseUrl(url)`** — Extracts `boardToken` and `jobId` from common URL shapes (including embed `token=` / `id=` query variants).
- **`isGreenhouseUrl(url)`** — Boolean guard for routing.
- **`scrapeGreenhouseJob(boardToken, jobId)`** — Calls `https://boards-api.greenhouse.io/v1/boards/{token}/jobs/{id}` (public **Harvest** job board API — no API key). Returns normalized HTML/plain content compatible with the rest of the scrape pipeline.

### Orchestrator scrape flow

`src/backend/ai/agents/orchestrator/methods/jobs/scrape.ts` tries Browser Rendering first, then **falls back to `scrapeGreenhouseJob`** when the URL parses as Greenhouse. Errors from both paths are logged for debugging.

### Intake API

`src/backend/api/routes/intake.ts` can use the same Greenhouse helpers when resolving pasted job URLs so intake matches orchestrator behavior.

## Company records (`greenhouse_token`)

The **`companies`** table (`src/backend/db/schemas/companies.ts`) stores an optional **`greenhouse_token`** — the short board slug (e.g. `stripe` from `boards.greenhouse.io/stripe`). The API exposes it on create/update (`src/backend/api/routes/companies.ts`) for UI and for flows that need a stable board identifier alongside brand colors.

## Related documentation

- **[Greenhouse Pipeline](/docs/greenhouse-pipeline)** — Comprehensive pipeline documentation with live widgets, analytics, and configuration
- [OrchestratorAgent](/docs/agents/orchestrator) — Scrape and role pipeline entry points
- [Database Schema](/docs/database) — `companies` table column descriptions
- [Greenhouse Job Board API](https://developers.greenhouse.io/job-board.html) — Official Harvest documentation
