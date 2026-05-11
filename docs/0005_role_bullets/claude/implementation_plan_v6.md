# Location, Compensation, Multi-Pass Scrape & Bullet Extraction Overhaul

Five workstreams. Status reflects all code changes made by the user and other coding agent.

---

## Workstream 4: Multi-Pass Browser Rendering Scrape

### Status: 🟢 Nearly Complete — 2 minor fixes remain

#### ✅ DONE

- **All prompt migrations** — Template literals with XML `<STRICT_VERBATIM_EXTRACTION>` tags across all 8 task files + `role-podcast-prompt.ts`. `max_tokens: 8096` on all major generative nodes.
- **Model Registry Convention** documented — `getModelRegistry(env).<role>` for all AI task code. `.agent/rules/ai-prompts.md` created.
- **`AGENTS.md` updated** with Prompt Engineering & Token Allocation section
- **`BrowserRendering` class** — All consumers migrated, `uploadImageFromUrl()` method working
- **`DEFAULT_EXTRACT_PROMPT` export** from `extract.ts` — template literal, reused by `scrape.ts`
- **`DetailedScrapeResult` type** — extends `ScrapedPage` with `jsonExtract` and `scrapedElements`
- **3-fold concurrent scrape** in `scrape.ts` — `extractMarkdown`, `captureJSON`, `scrapeElements` in parallel
- **`zodToJsonSchema` conversion** — auto-converts `JobPosting` Zod schema for BR `/json`
- **`reconcileJobExtractions()`** — defined AND wired into `tasks.ts` `job_extract` handler (lines 79-85)
- **Logo extraction** in `brand-colors.ts` — BR `/json` already extracts `logo_url`
- **`handleExtractBrandColors`** — takes `companyId`, D1 lookup, CF Images upload, persists colors + logo
- **`companies.logoUrl` column** added with documentation
- **Import ordering fixed** in `google-docs.ts` — `brand-colors` import moved to header; `eq`/`BrowserRendering` properly separated
- **`analyze-role.ts` fully refactored** — template literals for Phase 1 & Phase 2 system/user prompts, formatting cleanup, `max_tokens: 8096`

#### 🔧 2 Remaining Fixes

##### Fix A. `brand-colors.ts` — Add `logoUrl` to `BrandColorPalette` type

Currently uses an unsafe cast on line 186: `as BrandColorPalette & { logoUrl?: string }`, and `google-docs.ts` uses `(result as any).logoUrl`.

```diff
 export type BrandColorPalette = {
   primary: string;
   accent: string;
   source: string;
+  logoUrl?: string;
 };
```

##### Fix B. `scrape.ts` line 28 — Type `zodToJsonSchema` return

```diff
-const jsonSchemaRaw = zodToJsonSchema(JobPosting, "JobPosting");
+const jsonSchemaRaw = zodToJsonSchema(JobPosting, "JobPosting") as {
+  definitions?: Record<string, unknown>;
+  [key: string]: unknown;
+};
```

> [!NOTE]
> One remaining array `.join("\n")` in `tasks.ts:213` (`interview_feedback` prompt). Not broken (uses real `\n`), but should ideally be a template literal per the new standard. Low priority — can fix in a follow-up.

---

## Workstream 1: Role Insights D1 Table & Service

### Status: 🔴 Not Started

### [NEW] [role-insights.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/role-insights.ts)

Versioned D1 table `role_insights`:

| Column             | Type          | Description                                               |
| ------------------ | ------------- | --------------------------------------------------------- |
| `id`               | text PK       | UUID                                                      |
| `role_id`          | text FK→roles | Cascading delete                                          |
| `version`          | integer       | Auto-incremented per role per type                        |
| `type`             | text          | `location`, `compensation`, or `combined`                 |
| `input_hash`       | text          | SHA-256 of input fields for this type                     |
| `score`            | integer       | 0–100                                                     |
| `rationale`        | text          | AI summary (always visible on frontend)                   |
| `raw_api_response` | text (JSON)   | Raw ORS/geocode API response (collapsible)                |
| `analysis_payload` | text (JSON)   | Structured analysis blob (commute table, comp breakdown)  |
| `config_snapshot`  | text (JSON)   | Snapshot of compensation_baseline config at analysis time |
| `created_at`       | timestamp     |                                                           |

**Input hashing per type:**

- `location` → `SHA256(location + workplaceType + rtoPolicy + role_bullets_sorted)`
- `compensation` → `SHA256(salaryMin + salaryMax + salaryCurrency + role_bullets_sorted)`
- `combined` → `SHA256(location_hash + compensation_hash)`

**Change detection**: Check ALL versions for this role+type. If current hash matches any previous version, return that version (handles "rolled back" changes).

### [NEW] [role-insights-service.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/role-insights-service.ts)

```ts
export class RoleInsightsService {
  generateLocationInsight(env, roleId);
  generateCompensationInsight(env, roleId);
  generateCombinedInsight(env, roleId);
  getLatestInsight(env, roleId, type);
  getInsightHistory(env, roleId, type);
  checkForChanges(env, roleId);
  computeInputHash(env, roleId, type);
}
```

All AI calls use `getModelRegistry(env).extract` or `.chat` — never hardcoded model IDs.

### [MODIFY] [schema.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schema.ts)

Add barrel export: `export * from "./schemas/role-insights"`

---

## Workstream 2: Commute Analysis (ORS Integration)

### Status: 🔴 Not Started

### [NEW] [commute-service.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/commute-service.ts)

```ts
export class CommuteService {
  geocode(query: string): Promise<GeoPoint | null>;
  getCommuteData(homeQuery: string, jobQuery: string): Promise<CommuteResult | null>;
  analyzeCommute(env: Env, roleId: string): Promise<CommuteAnalysis>;
}
```

**Geocode pipeline**: Role location → AI address extraction → ORS geocode → fallback to raw location → fallback to pure AI estimation

**Fixed home**: `126 Colby St, San Francisco, CA 94134`

**Commute modes**: `driving-car` via ORS Matrix + AI transit estimation

**RTO schedules**: 2/3/5 days per week

**Environment**: `pnpm dlx wrangler secret put ORS_API_KEY`

---

## Workstream 5: HTML Sidecar Bullet Parser

### Status: 🟡 Partially Addressed

The existing `scrapeElements(url, [{ selector: "h1, h2, h3" }, { selector: "ul > li" }])` call in `scrape.ts` provides the raw DOM elements. What's **still needed**:

### [NEW] [html-bullet-parser.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tools/html-bullet-parser.ts)

Higher-level parser that takes the raw `ScrapeResult` from `scrapeElements` and:

1. Correlates headings with their child `<li>` items using vertical positioning (`top` values from `ScrapeResultItem`)
2. Classifies each group by heading keyword matching
3. Returns `ParsedBulletGroup[]` for frontend comparison

```ts
export function classifyScrapedElements(elements: ScrapeResult): ParsedBulletGroup[];
```

### [MODIFY] [IntakeModal.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/intake/IntakeModal.tsx)

Per-section "Compare AI vs HTML" UX — **still to build**.

---

## Workstream 3: Frontend Analysis Panels

### Status: 🔴 Not Started

### [NEW] [LocationAnalysis.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/LocationAnalysis.tsx)

Layout: Radial gauge + location badges + collapsible ORS API response + always-visible AI commute summary table (2/3/5 days × transit/Tesla) + monthly cost comparison + AI synthesis paragraph.

**Scoring context**: Justin prefers WFH, benchmarks at 2 days. 7 years on Google Bus SF→MTV. Full remote = highest. Short commute 2 days = good. 5 days long commute = lowest.

### [NEW] [CompensationAnalysis.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/CompensationAnalysis.tsx)

Layout: Radial gauge + salary range bar with negotiation target marker + AI analysis below radial (Google historical TC breakdown, advertised range, negotiation strategy, net-vs-Google delta).

**Data source**: Full `compensation_baseline` from global_config.

### [NEW] [CombinedValueScore.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/CombinedValueScore.tsx)

Small card synthesizing location + compensation scores.

### [MODIFY] [HireabilityHeader.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/HireabilityHeader.tsx)

Remove Compensation RadialScoreCard → single column Hire Likelihood only.

### [MODIFY] [RoleViewport.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/RoleViewport.tsx)

New layout: HireabilityHeader → LocationAnalysis | CompensationAnalysis → CombinedValueScore → RoleBullets.

---

## API Routes (New)

### Status: 🔴 Not Started

### [NEW] `GET /api/roles/:roleId/insights?type=location|compensation|combined`

### [NEW] `POST /api/roles/:roleId/insights` — body: `{ types: [...] }`

### [NEW] `GET /api/roles/:roleId/insights/history?type=location`

---

## Scoring Guidelines

### Location Score (0–100)

| Scenario                                     | Score Range |
| -------------------------------------------- | ----------- |
| Full remote / WFH                            | 90–100      |
| Hybrid 2 days, short commute (<30 min) in SF | 75–90       |
| Hybrid 3 days, short commute in SF           | 60–75       |
| Hybrid 2-3 days, medium commute (30-60 min)  | 50–65       |
| 5 days/wk, short commute in SF               | 50–60       |
| Hybrid 2-3 days, long commute (>60 min)      | 30–50       |
| 5 days/wk, long commute (Mountain View etc.) | 10–30       |

### Compensation Score (0–100)

Uses FULL `compensation_baseline` from global_config (TC ~$260,672, equity ~$750K total, perks, W-2 verification).

### Combined Score (0–100)

AI synthesizes both dimensions.

---

## Execution Order

1. **WS4 Fix A + B** — 2 quick type-safety fixes (5 min)
2. **WS1** (role_insights table + service) — foundation
3. **WS2** (CommuteService + ORS) — location scoring backend
4. **WS5** (html-bullet-parser classification) — structured sidecar
5. **WS3** (frontend panels + API routes) — user-facing layer

---

## Verification Plan

### Automated

- `pnpm run build` — type-check with fixes applied
- `pnpm run db:generate` — migration for `role_insights` + `companies.logo_url`
- `pnpm run cf-typegen` — regenerate after ORS_API_KEY

### Manual

1. Scrape a job → verify 3-fold extraction + reconciliation produces best-quality posting
2. Extract brand colors for a company → verify logo appears in `companies.logoUrl`
3. Load role with location + salary → verify both analysis panels render
4. Test change detection → edit location → verify new insight version generated
5. Test sidecar HTML comparison in IntakeModal
