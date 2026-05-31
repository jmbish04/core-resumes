# Job Pipeline Architecture Overhaul — Schema Reorganization, Pipeline Gap Fix & HITL Discovery Viewport

> **Status: APPROVED — Executing**

## Decisions (from user feedback)

1. **`is_recommended` = keyword + location heuristic, NO AI involved**
   - **Jobs**: location is `remote` or `SF Bay Area` + title/description matches candidate profile keywords
   - **Companies**: has remote/SF jobs AND/OR description appeals to candidate profile, OR has matching jobs
2. **AI scoring is a SEPARATE step** that runs after `is_recommended:true` is set
   - Groups of 5-10 jobs per AI request for structured batch scoring
   - Max 100 jobs per cron cycle, remainder queued for next cycle
   - AI analysis runs **exactly once** per job — flag `analysis_executed` prevents re-processing
   - Snapshots always captured for `is_recommended:true` jobs
3. **Model choice**: Consider `@cf/moonshotai/kimi-k2.5` (256K context) for batch scoring
4. **Prioritization prompt**: Send all `is_recommended:true` unprocessed jobs in a single prompt to AI, grouped by role type, ask it to prioritize into groups of 100 by match quality

---

## Phase 1: Schema Reorganization

Move 28 files from `schemas/jobs/` → `schemas/pipeline/jobs/` + `schemas/pipeline/freelance/`

## Phase 2: Schema Migration

Add `is_recommended`, `recommendation_score`, `recommendation_reason`, `source_api_company_id` to `jobs_postings`

## Phase 3: Discovery Scorer Pipeline

**Step 3a**: Keyword/location heuristic scorer (sets `is_recommended`)
**Step 3b**: AI batch analyzer (processes `is_recommended:true` jobs, populates downstream tables)

## Phase 4: Promotion APIs

`api_companies` → `companies`, `jobs_postings` → `roles`

## Phase 5: HITL Discovery Viewport

`/discovery` page with recommended/unscored tabs, HITL controls, promotion buttons
