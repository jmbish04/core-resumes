# Walkthrough — RSS Feed Pipeline + Cross-Pipeline Normalization

## What Changed

Two workstreams delivered in a single pass:

### Workstream 1: Cross-Pipeline Normalization

**Problem:** Each pipeline (A, B, External) wrote `jobs_postings` rows with inconsistent ID formats, missing `pipelineSource`, and no shared relevance scoring.

**Solution:**
- **[relevance.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/jobs/relevance.ts)** — Shared `isRelevantJob()` utility. Pure keyword + location matching against `applicant_profile` config. No AI.
- **[normalize-id.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/jobs/normalize-id.ts)** — `normalizeJobSiteId()` strips pipeline prefixes (`gh-stripe-4567890` → `4567890`) so the UNIQUE constraint catches duplicates across pipelines.
- **[migrate-ids.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/jobs/migrate-ids.ts)** — One-time migration to normalize existing DB rows. Run via `POST /api/pipeline/rss/migrate-ids` after deploy.

**Modified insertion paths:**
- [api-companies.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/pipeline/api-companies.ts) — Both bulk sync and recommend paths now call `normalizeJobSiteId()` and set `pipelineSource: "github_dataset"`
- [scan-board.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/job/scanner/methods/scan-board.ts) — Now extracts `job.location.name` from Greenhouse API response and sets `pipelineSource: "promoted_company"`
- [external-agents.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/pipeline/external-agents.ts) — Added `triageReason: "Submitted by external agent — awaiting HITL review"`

---

### Workstream 2: RSS Feed Aggregator (Pipeline C)

**New service layer:**

| File | Purpose |
|------|---------|
| [xml-parser.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/rss/xml-parser.ts) | V8-native regex XML parser (RSS 2.0 + Atom) |
| [feeds/types.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/rss/feeds/types.ts) | `RssFeedProvider` interface + `NormalizedRssJob` |
| [feeds/greenhouse-rss.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/rss/feeds/greenhouse-rss.ts) | Greenhouse RSS provider |
| [feeds/lever-rss.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/rss/feeds/lever-rss.ts) | Lever XML feed provider |
| [feeds/weworkremotely.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/rss/feeds/weworkremotely.ts) | WeWorkRemotely RSS provider (2 categories) |
| [feeds/remotive.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/rss/feeds/remotive.ts) | Remotive RSS provider |
| [feeds/index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/rss/feeds/index.ts) | Feed provider registry barrel |
| [dedup-catalog.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/rss/dedup-catalog.ts) | R2-backed dedup persistence (`R2_JOBS_BUCKET`) |
| [aggregator.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/rss/aggregator.ts) | Core orchestrator — fetch → parse → normalize → dedup → insert |

**API + Infrastructure:**

| File | Purpose |
|------|---------|
| [rss.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/pipeline/rss.ts) | `POST /rss/scan`, `GET /rss/feeds`, `POST /rss/migrate-ids` |
| [rss-feeds.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/health/checks/job-board-apis/rss-feeds.ts) | RSS feed connectivity health check |

**Modified files:**

| File | Change |
|------|--------|
| [jobs-postings.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/pipeline/jobs/jobs-postings.ts) | Added `'rss_feed'` to pipelineSource enum |
| [_worker.ts](file:///Volumes/Projects/workers/core-resumes/src/_worker.ts) | Added RSS aggregator to 12-hour cron |
| [pipeline/index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/pipeline/index.ts) | Mounted rssRouter |
| [config.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/config.ts) | Added `lever_tokens` + `rss_industry_feeds` to defaults |
| [health index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/health/checks/job-board-apis/index.ts) | Added RSS feeds to provider checks |

---

### Documentation

| File | Type |
|------|------|
| [AGENTS.md](file:///Volumes/Projects/workers/core-resumes/AGENTS.md) | RSS pipeline + shared utilities sections |
| [rss-feeds.md](file:///Volumes/Projects/workers/core-resumes/src/frontend/content/docs/integrations/rss-feeds.md) | Full frontend docs |
| [rss-feed-pipeline.md](file:///Volumes/Projects/workers/core-resumes/.agent/rules/rss-feed-pipeline.md) | Agent rules for adding providers |
| [job-boards.md](file:///Volumes/Projects/workers/core-resumes/src/frontend/content/docs/integrations/job-boards.md) | Cross-link to RSS docs |

---

## Testing & Verification

| Check | Result |
|-------|--------|
| `pnpm run build` | ✅ Zero errors |
| `pnpm run db:generate` | ✅ No migration needed (TEXT column) |

## Post-Deploy Steps

1. **Run ID migration:** `POST /api/pipeline/rss/migrate-ids` — normalizes existing prefixed `job_site_id` values
2. **Verify RSS scan:** `POST /api/pipeline/rss/scan` — manually trigger a scan and confirm jobs appear
3. **Check Discovery Dashboard:** Confirm RSS-sourced recommended jobs appear in the Unanalyzed Queue
4. **Check Health Dashboard:** Confirm RSS feed probes appear in job_board_api_connectivity results
