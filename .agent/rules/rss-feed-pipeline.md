# RSS Feed Pipeline Agent Rules

## Adding a New RSS Feed Provider

1. Create `src/backend/services/rss/feeds/{name}.ts` implementing `RssFeedProvider`
2. Import and add to `RSS_FEED_PROVIDERS` array in `src/backend/services/rss/feeds/index.ts`
3. If ATS provider (per-company token), add the `{provider}_tokens` key to `health_check_config` in `src/backend/api/routes/config.ts`
4. If industry feed, add the provider name to the `rss_industry_feeds` array in config defaults

## Provider Interface Requirements

Every provider must implement:
- `name` — unique machine name, used as R2 dedup catalog key
- `displayName` — human-readable name for UI
- `type` — `"ats"` (requires board token) or `"industry"` (static URL)
- `buildFeedUrl(token?)` — returns the feed URL
- `normalize(item, feedToken?)` — transforms `RssItem` into `NormalizedRssJob`

## Job Site ID Rules

- **Always use the raw ATS job ID** when extractable from the posting URL
- Fallback to `rss-{provider}-{hash}` only when no ATS ID is available
- Never prefix IDs with pipeline identifiers — `normalizeJobSiteId()` strips them
- The UNIQUE constraint on `jobs_postings.job_site_id` handles cross-pipeline dedup

## R2 Dedup Catalog

- Binding: `R2_JOBS_BUCKET`
- Key pattern: `rss-dedup/{provider}.json`
- Format: JSON array of `jobSiteId` strings
- Persist indefinitely — never expire dedup data
- One catalog per provider for independent management

## Relevance Scoring

- All pipelines use `isRelevantJob()` from `src/backend/services/jobs/relevance.ts`
- Loads keywords and locations from `applicant_profile` global config
- Pure heuristic — no AI at this stage
- Both title AND location must match for `isRelevant = true`
- Sets `isRecommended`, `recommendationScore`, `recommendationReason` on the job row

## Cron Schedule

- RSS aggregator runs on `0 */12 * * *` (12-hour) alongside freelance scanner
- Industry feeds checked every run
- ATS feeds checked for all configured tokens per provider

## API Endpoints

- `POST /api/pipeline/rss/scan` — manual trigger
- `GET /api/pipeline/rss/feeds` — list providers + dedup catalog stats
- `POST /api/pipeline/rss/migrate-ids` — one-time normalization of existing data
