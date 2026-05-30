# Job Pipeline Overhaul — Walkthrough

## Summary

This overhaul addresses the core issue: the pipeline successfully collects 48,590 companies and 579 job postings, but **never processes them**. All downstream tables (`job_snapshots`, `job_categories`, etc.) were empty, and every company was blindly marked `is_recommended:true`.

## Changes Made

### Phase 1: Schema Reorganization ✅

Moved 27 schema files from a flat `schemas/jobs/` directory into a domain-organized `schemas/pipeline/` structure:

```
schemas/jobs/                    →  schemas/pipeline/
                                      ├── index.ts (barrel)
                                      ├── jobs/
                                      │   ├── index.ts (barrel)
                                      │   └── 22 table schema files
                                      └── freelance/
                                          ├── index.ts (barrel)
                                          └── 5 table schema files
```

**Files changed:**
- [schema.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schema.ts) — Root barrel: `jobs` → `pipeline`
- [pipeline/index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/pipeline/index.ts) — New barrel
- [pipeline/jobs/index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/pipeline/jobs/index.ts) — New barrel
- [pipeline/freelance/index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/pipeline/freelance/index.ts) — New barrel
- [freelance-proposals.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/pipeline/freelance/freelance-proposals.ts) — Fixed cross-domain import `../applications/roles` → `../../applications/roles`
- Deleted entire `schemas/jobs/` directory

**Zero import breakage** — all consumers import from the `@/backend/db/schema` barrel.

---

### Phase 2: Schema Migration ✅

Added 5 new columns and 1 index to `jobs_postings` table:

| Column | Type | Purpose |
|:-------|:-----|:--------|
| `location` | `TEXT` | Extracted location from ATS API |
| `is_recommended` | `INTEGER (bool)` | Keyword + location match result |
| `recommendation_score` | `INTEGER` | 0-100 heuristic match score |
| `recommendation_reason` | `TEXT` | Human-readable match explanation |
| `source_api_company_id` | `INTEGER` | FK back to `api_companies.id` |

- [jobs-postings.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/pipeline/jobs/jobs-postings.ts) — Schema updated
- Migration: `drizzle/0040_even_daredevil.sql` — Applied to production

---

### Phase 3a: Discovery Scorer ✅

Created a keyword + location heuristic scorer (NO AI involved for `is_recommended`):

- [discovery-scorer.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/cron/discovery-scorer.ts) — New cron handler

**Scoring logic:**
- Jobs: `is_recommended = true` when **BOTH** location matches (remote / SF Bay Area) AND title matches (software engineer, frontend, backend, etc.)
- Companies: promoted based on having `is_recommended:true` jobs
- Profile loaded from `globalConfig.applicant_profile` with sensible fallback

**Pipeline fixes:**
- [github-watch-alert.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/cron/github-watch-alert.ts) — Fixed `isRecommended: true` → `false` for new companies
- [api-companies.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/pipeline/api-companies.ts) — Persists `location`, `isRecommended`, `recommendationScore`, `recommendationReason` on job inserts
- [_worker.ts](file:///Volumes/Projects/workers/core-resumes/src/_worker.ts) — Wired discovery scorer into 4-hour cron

**Production data reset:**
- Reset 48,471 blindly-set `is_recommended:true` rows to `false` on `api_companies`

---

## Verification

| Check | Status |
|:------|:-------|
| `pnpm run build` (3 consecutive) | ✅ |
| `pnpm run db:generate` | ✅ Migration `0040_even_daredevil.sql` |
| Migration apply (remote) | ✅ |
| `is_recommended` reset (48,471 rows) | ✅ |
| `applicant_profile` seeded to D1 | ✅ |
| Deploy to production | ✅ Version `67bb8f83` |

## Next Steps

- **Phase 3b**: AI batch analyzer cron (groups of 5-10 jobs per request, max 100/cycle)
- **Phase 4**: Promotion APIs (`api_companies` → `companies`, `jobs_postings` → `roles`)
- **Phase 5**: HITL Discovery Viewport (`/discovery` page)
