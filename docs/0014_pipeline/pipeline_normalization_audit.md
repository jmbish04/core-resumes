# Pipeline Normalization Audit

## `jobs_postings` Table Schema (16 writable columns)

| Column | Type | Default | Notes |
|--------|------|---------|-------|
| `job_site_id` | text, UNIQUE | — | **Required.** Dedup key |
| `job_title` | text | — | **Required** |
| `company` | text | — | **Required.** Board token or company name |
| `date_first_seen` | integer (timestamp) | `$defaultFn` (now) | Auto-set |
| `triage_passed` | boolean | `false` | |
| `triage_reason` | text | `null` | |
| `analysis_executed` | boolean | `false` | |
| `is_favorite` | boolean | `false` | |
| `location` | text | `null` | |
| `is_recommended` | boolean | `false` | |
| `recommendation_score` | integer | `null` | |
| `recommendation_reason` | text | `null` | |
| `source_api_company_id` | integer | `null` | FK to `api_companies.id` |
| `is_rejected` / `reject_reason` | boolean / text | `false` / `null` | |
| `is_watching` / `is_detected_change` | booleans | `false` | |
| `pipeline_source` | text (enum) | `null` | `github_dataset`, `promoted_company`, `freelance`, `external_agent` |
| `company_id` | text | `null` | FK to `companies.id` (promoted) |

---

## Pipeline A: GitHub Dataset (`sync-upstream.py`)

Pipeline A has **two separate insertion code paths** that both write to `jobs_postings`:

### Path 1 — Bulk Sync (`/api-companies/sync`)

> [api-companies.ts:L213-L224](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/pipeline/api-companies.ts#L213-L224)

```ts
db.insert(jobsPostings).values({
  jobSiteId:     job.jobSiteId,       // e.g. "gh-stripe-123456"
  jobTitle:      job.jobTitle,
  company:       job.company,          // board token (e.g. "stripe")
  location:      job.location,         // ✅ populated
  triagePassed:  job.triagePassed,     // always true (pre-filtered by Python)
  triageReason:  job.triageReason,     // "Discovered and matched during aggregator sync: '...' in '...'"
  // ❌ MISSING: pipelineSource        — NOT SET (defaults to null)
  // ❌ MISSING: isRecommended         — NOT SET (defaults to false)
  // ❌ MISSING: recommendationScore   — NOT SET
  // ❌ MISSING: sourceApiCompanyId    — NOT SET
})
```

### Path 2 — Real-Time Recommend (`/api-companies/recommend`)

> [api-companies.ts:L1006-L1021](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/pipeline/api-companies.ts#L1006-L1021)

```ts
db.insert(jobsPostings).values({
  jobSiteId:           job.id.toString(),  // e.g. "gh-stripe-123456"
  jobTitle:            job.title,
  company:             body.token,
  location:            job.location,        // ✅ populated
  triagePassed:        true,
  triageReason:        "Discovered and matched during real-time REST API recommend push: '...'",
  isRecommended:       true,               // ✅ SET
  recommendationScore: 100,                // ✅ SET (hardcoded 100)
  recommendationReason: body.recommendationReason,  // ✅ SET
  // ❌ MISSING: pipelineSource        — NOT SET (defaults to null)
  // ❌ MISSING: sourceApiCompanyId    — NOT SET
})
```

### Path 3 — External Agent Ingestion (`/external-agents/jobs`)

> [external-agents.ts:L161-L170](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/pipeline/external-agents.ts#L161-L170)

```ts
db.insert(jobsPostings).values({
  jobSiteId:     siteId,                // "ext-{md5hash}"
  jobTitle:      job.jobTitle,
  company:       job.company,
  location:      job.location ?? null,   // ✅ populated if available
  pipelineSource: "external_agent",      // ✅ SET
  triagePassed:  false,                  // starts in HITL queue
  isRecommended: false,
  // ❌ MISSING: triageReason          — NOT SET
  // ❌ MISSING: sourceApiCompanyId    — NOT SET
})
```

---

## Pipeline B: Promoted Companies (Scanner Agent)

> [scan-board.ts:L73-L91](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/job/scanner/methods/scan-board.ts#L73-L91)

```ts
db.insert(jobsPostings).values({
  jobSiteId:    job.id.toString(),     // raw Greenhouse job ID (e.g. "4567890")
  jobTitle:     job.title,
  company:      token,                 // board token
  triagePassed: passed,                // ✅ AI triage result
  triageReason: reasoning,            // ✅ AI reasoning
  // ❌ MISSING: location              — NOT SET (even though available in API response)
  // ❌ MISSING: pipelineSource        — NOT SET
  // ❌ MISSING: isRecommended         — NOT SET
  // ❌ MISSING: recommendationScore   — NOT SET
  // ❌ MISSING: sourceApiCompanyId    — NOT SET
})
```

---

## Pipeline C: RSS Feeds (Proposed)

Not yet built — but the plan proposes:

```ts
db.insert(jobsPostings).values({
  jobSiteId:     normalized.jobSiteId,  // "rss-{hash}" or extracted ID
  jobTitle:      normalized.jobTitle,
  company:       normalized.company,
  location:      normalized.location,
  pipelineSource: "rss_feed",
  triagePassed:  false,                 // starts in discovery scorer queue
  triageReason:  null,
})
```

---

## Pipeline D: Freelance

> ⚠️ Freelance **does NOT use `jobs_postings` at all**. It has its own `freelance_opportunities` and `freelance_opportunity_triage` tables. This is a completely separate data model — not in scope for this normalization.

---

## Gap Matrix

| Field | Pipeline A (Bulk) | Pipeline A (Recommend) | Pipeline A (External) | Pipeline B (Scanner) | Pipeline C (RSS) |
|-------|:-:|:-:|:-:|:-:|:-:|
| `jobSiteId` | ✅ | ✅ | ✅ | ✅ | ✅ planned |
| `jobTitle` | ✅ | ✅ | ✅ | ✅ | ✅ planned |
| `company` | ✅ | ✅ | ✅ | ✅ | ✅ planned |
| `location` | ✅ | ✅ | ✅ | ❌ **MISSING** | ✅ planned |
| `triagePassed` | ✅ | ✅ | ✅ | ✅ | ✅ planned |
| `triageReason` | ✅ | ✅ | ❌ **MISSING** | ✅ | — |
| `pipelineSource` | ❌ **null** | ❌ **null** | ✅ `external_agent` | ❌ **null** | ✅ `rss_feed` |
| `isRecommended` | ❌ default | ✅ `true` | ✅ `false` | ❌ default | ✅ planned |
| `recommendationScore` | ❌ | ✅ `100` | ❌ | ❌ | — |
| `recommendationReason` | ❌ | ✅ | ❌ | ❌ | — |
| `sourceApiCompanyId` | ❌ | ❌ | ❌ | ❌ | — |

---

## Critical Issues Found

### 1. `pipelineSource` is NOT SET on 4 out of 5 code paths

> [!CAUTION]
> **Only** the `external_agent` path correctly sets `pipelineSource`. The two Pipeline A paths and Pipeline B all leave it as `null`. This means you cannot reliably query jobs by pipeline source in the HITL dashboard.
>
> **Fix:** Set `pipelineSource: "github_dataset"` in both Pipeline A paths, and `pipelineSource: "promoted_company"` in Pipeline B.

### 2. Pipeline B drops `location` data

> [!WARNING]
> The Greenhouse API response includes `job.location.name` but [scan-board.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/job/scanner/methods/scan-board.ts#L73-L91) does not extract or persist it. The discovery scorer then can't do location matching on Pipeline B jobs.
>
> **Fix:** Extract location from the `fetchBoard` response and include it in the insert.

### 3. `sourceApiCompanyId` is never populated

> [!NOTE]
> This FK column linking back to `api_companies.id` is defined in the schema but zero pipelines set it. Pipeline A has access to the `api_companies` table during sync (it knows the token → company id mapping) but doesn't populate this FK.

### 4. `jobSiteId` format varies across pipelines

| Pipeline | Format | Example |
|----------|--------|---------|
| A (Bulk Sync) | `gh-{token}-{id}` or `lv-{token}-{id}` or `as-{token}-{id}` | `gh-stripe-4567890` |
| A (Recommend) | Same as bulk | `gh-stripe-4567890` |
| A (External Agent) | `ext-{md5}` | `ext-a1b2c3d4e5f6` |
| B (Scanner) | Raw Greenhouse ID (numeric string) | `4567890` |
| C (RSS, planned) | TBD | — |

> [!IMPORTANT]
> Pipeline A uses prefixed IDs (`gh-stripe-123`) while Pipeline B uses raw IDs (`123`). This means **the same Greenhouse job can exist twice** in the table with different `jobSiteId` values if discovered by both pipelines. The UNIQUE constraint won't catch the duplicate.

---

## Recommended Normalization Fixes

These should be incorporated into the RSS pipeline implementation plan:

1. **Set `pipelineSource`** on all 4 existing code paths (2× Pipeline A, 1× Pipeline B, 1× External Agent is already correct)
2. **Extract location** in Pipeline B's `scan-board.ts`
3. **Standardize `jobSiteId` format** — either always prefix, or never prefix. Consider `{provider}-{rawId}` as the universal format
4. **Populate `sourceApiCompanyId`** in Pipeline A sync where the token→id mapping is already available
