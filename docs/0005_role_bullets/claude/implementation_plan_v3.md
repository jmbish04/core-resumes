# Location, Compensation, Multi-Pass Scrape & Bullet Extraction Overhaul

Five interconnected workstreams for the role analysis viewport.

---

## Workstream 1: Role Insights D1 Table & Service

### [NEW] [role-insights.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/role-insights.ts)

Versioned D1 table `role_insights`:

| Column             | Type          | Description                                               |
| ------------------ | ------------- | --------------------------------------------------------- |
| `id`               | text PK       | UUID                                                      |
| `role_id`          | text FK→roles | Cascading delete                                          |
| `version`          | integer       | Auto-incremented per role per type                        |
| `type`             | text          | `location`, `compensation`, or `combined`                 |
| `input_hash`       | text          | SHA-256 of the input fields for this type (see below)     |
| `score`            | integer       | 0–100                                                     |
| `rationale`        | text          | AI summary (always visible on frontend)                   |
| `raw_api_response` | text (JSON)   | The raw ORS/geocode API response (collapsible)            |
| `analysis_payload` | text (JSON)   | Structured analysis blob (commute table, comp breakdown)  |
| `config_snapshot`  | text (JSON)   | Snapshot of compensation_baseline config at analysis time |
| `created_at`       | timestamp     |                                                           |

**Input hashing per type:**

- `location` → `SHA256(location + workplaceType + rtoPolicy + role_bullets_sorted)`
- `compensation` → `SHA256(salaryMin + salaryMax + salaryCurrency + role_bullets_sorted)`
- `combined` → `SHA256(location_hash + compensation_hash)`

**Change detection**: Check ALL versions for this role+type, not just latest. If the current input hash matches any previous version, return that version. This handles "rolled back" changes and avoids redundant regeneration.

### [NEW] [role-insights-service.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/role-insights-service.ts)

```ts
export class RoleInsightsService {
  generateLocationInsight(env, roleId); // Geocode → ORS → AI synthesis
  generateCompensationInsight(env, roleId); // Read comp config → AI analysis
  generateCombinedInsight(env, roleId); // Synthesize both scores
  getLatestInsight(env, roleId, type); // Latest version for a type
  getInsightHistory(env, roleId, type); // All versions (timeline)
  checkForChanges(env, roleId); // → { locationChanged, compensationChanged, bulletsChanged }
  computeInputHash(env, roleId, type); // SHA-256 hash computation
}
```

### [MODIFY] [schema.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schema.ts)

Add barrel export: `export * from "./schemas/role-insights"`

---

## Workstream 2: Commute Analysis (ORS Integration)

### [NEW] [commute-service.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/commute-service.ts)

Using OpenRouteService API adapted for Workers' native `fetch`:

```ts
export class CommuteService {
  geocode(query: string): Promise<GeoPoint | null>;
  getCommuteData(homeQuery: string, jobQuery: string): Promise<CommuteResult | null>;
  analyzeCommute(env: Env, roleId: string): Promise<CommuteAnalysis>;
}
```

**Geocode resolution pipeline:**

1. Read `metadata.location` + `companyName` from the role
2. Use AI (quick `gpt-oss-120b` structured call) to extract the most specific address from the role description/bullets
3. Try geocoding `"{companyName} office {extracted_address}"` first
4. Fall back to `"{location}"` if company-specific fails
5. If all geocoding fails → pure AI estimation based on location text

**Fixed home**: `126 Colby St, San Francisco, CA 94134`

**Commute modes:**

- `driving-car` via ORS Matrix API — Tesla Model 3 costs
- Public transit — AI synthesis based on driving distance + known SF transit patterns (ORS doesn't have real-time transit)

**RTO schedules calculated**: 2 days/wk, 3 days/wk, 5 days/wk

**Cost estimates** (AI-generated from distance):

- Driving: electricity ~$0.04/mi for Tesla, SF parking $15-30/day, Bay Bridge toll $7 if applicable
- Transit: BART/Muni monthly pass vs per-ride

**Fallback**: If ORS API fails entirely → pure AI estimation

### Environment Setup

Add `ORS_API_KEY` as a Worker Secret:

```bash
pnpm dlx wrangler secret put ORS_API_KEY
```

---

## Workstream 3: Frontend Analysis Panels

### [NEW] [LocationAnalysis.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/LocationAnalysis.tsx)

**Layout:**

```
┌─────────────────────────────────────────┐
│ 📍 Location Analysis          Score: 82 │  ← Radial gauge + badges
├─────────────────────────────────────────┤
│ Office: Anthropic, 548 Market St, SF    │
│ Type: [Hybrid] │ RTO: 3 days/week      │
├─────────────────────────────────────────┤
│ ▾ API Response (collapsed by default)   │  ← Raw ORS JSON, expandable
│   { geocoded coords, distances, ... }   │
├─────────────────────────────────────────┤
│ AI Commute Summary (always visible)     │
│ ┌─────────┬──────────┬────────┬───────┐ │
│ │Schedule │Transit   │Tesla   │Hrs/wk │ │
│ ├─────────┼──────────┼────────┼───────┤ │
│ │2 days   │35m/$4.50 │22m/$8  │2.3h   │ │
│ │3 days   │35m/$4.50 │22m/$8  │3.4h   │ │
│ │5 days   │35m/$4.50 │22m/$8  │5.7h   │ │
│ └─────────┴──────────┴────────┴───────┘ │
│ Monthly: Transit $95 vs Drive $210      │
│                                         │
│ "This hybrid role at 3 days/wk from     │
│  94134 to SoMa is a 22-min drive —      │
│  far better than the 2-2.5hr Google Bus │
│  to MTV."                               │
└─────────────────────────────────────────┘
```

**Scoring context injected into AI prompt:**

- Justin prefers WFH, benchmarks at 2 days in-office
- 7 years commuting SF → Mountain View on Google Bus (2-2.5hr each way, free) — was miserable
- Not a deal-breaker (would do 5 days if needed) but significantly impacts quality of life
- Full remote = highest score, short commute 2 days = good, 5 days long commute = lowest

### [NEW] [CompensationAnalysis.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/CompensationAnalysis.tsx)

**Layout:**

```
┌─────────────────────────────────────────┐
│ 💰 Compensation Analysis     Score: 68  │  ← Radial gauge
├─────────────────────────────────────────┤
│ ┌─ Salary Range Bar ─────────────────┐  │
│ │ $200K ▓▓▓▓▓▓▓▓[★$265K]▓▓ $300K    │  │  ← ★ = negotiation target
│ └────────────────────────────────────┘  │
├─────────────────────────────────────────┤
│ AI Analysis (below radial)              │
│                                         │
│ Google Historical TC: ~$260,672         │
│  Base: $176K │ Bonus: $32K (18%)       │
│  Equity: $52,672/yr ($750K total)      │
│  Perks: Google Bus, free food, 25 PTO  │
│                                         │
│ 2025 W-2: $263,427 (incl $72.7K        │
│  non-recurring departure payouts)       │
│                                         │
│ Advertised: $200K – $300K base          │
│ Negotiation target: $265K base          │
│  → "Anchor at $280K citing Google L5    │
│    total comp + $750K total equity.     │
│    $265K is achievable given the        │
│    equity gap this role needs to fill." │
│                                         │
│ Net vs Google:                          │
│  Base: +$89K │ But no RSU/bus/food     │
│  Effective TC delta: depends on equity  │
└─────────────────────────────────────────┘
```

**Data source**: Full `global_config.compensation_baseline` text (including TC breakdown, equity, perks, W-2 reference).

### [NEW] [CombinedValueScore.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/CombinedValueScore.tsx)

Small card below the two panels — AI synthesizes location + compensation together:

| Scenario                 | Reasoning                                       |
| ------------------------ | ----------------------------------------------- |
| $400K + 5 days Cupertino | Comp offsets commute pain → 65-75               |
| ≤$176K + 5 days SF RTO   | At/below Google + commute burden → 30-40        |
| ≤$176K + full WFH        | At Google base but huge WLB improvement → 60-70 |
| $300K + full WFH         | Premium on every axis → 90+                     |

### [MODIFY] [HireabilityHeader.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/HireabilityHeader.tsx)

- Remove the **Compensation** RadialScoreCard from the 2-column grid
- Keep only **Hire Likelihood** radial (still uses `role_analyses.hireScore`)
- Make it full-width (single column)

### [MODIFY] [RoleViewport.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/RoleViewport.tsx)

New Overview tab layout:

```
┌──────────────────────────────────────────┐
│      HireabilityHeader (full width)      │  ← Hire Likelihood only
├────────────────────┬─────────────────────┤
│  LocationAnalysis  │ CompensationAnalysis│  ← New side-by-side panels
├────────────────────┴─────────────────────┤
│          CombinedValueScore              │  ← Combined synthesis
├──────────────────────────────────────────┤
│              RoleBullets                 │
│              Overview                    │
└──────────────────────────────────────────┘
```

### [MODIFY] [types.ts](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/dashboard/types.ts)

Add `metadata` and `roleInstructions` to `RoleRow`:

```ts
metadata?: Record<string, unknown> | null;
roleInstructions?: string | null;
```

---

## Workstream 4: Multi-Pass Browser Rendering Scrape

### [MODIFY] [scrape.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/orchestrator/methods/jobs/scrape.ts)

Upgrade `handleScrapeJob` to **three-fold concurrent scrape**:

```ts
const [mdResult, jsonResult, scrapeResult, pdfResult] = await Promise.allSettled([
  // Stream 1: Markdown → Workers AI structured extraction
  browser.extractMarkdown(url),
  // Stream 2: Browser Render /json — native structured extraction
  browser.captureJSON(url, { prompt: EXTRACTION_PROMPT, responseFormat: BR_JSON_SCHEMA }),
  // Stream 3: Browser Render /scrape — deterministic HTML element extraction
  browser.scrapeElements(url, [{ selector: "h1, h2, h3, h4, h5, h6" }, { selector: "ul > li" }]),
  // Archival
  browser.capturePdf(url),
]);
```

### [NEW] [reconcile-extractions.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/reconcile-extractions.ts)

Comparison + reconciliation function:

```ts
export function compareAndReconcileExtractions(
  markdownAiOutput: JobPosting, // Stream 1
  brJsonOutput: Record<string, unknown>, // Stream 2
  scrapedElements: ScrapeResult, // Stream 3 (headings + li items)
): ReconciledPosting {
  // For each array field (responsibilities, qualifications, etc.):
  // 1. Parse scrapedElements to build the ground-truth bullet list
  //    (using heading-to-UL classification from Workstream 5)
  // 2. Compare AI bullets vs HTML bullets
  // 3. Prefer the longer/more complete version per bullet
  // 4. Flag discrepancies for user review
}
```

**Returns:**

```ts
type ReconciledPosting = {
  posting: JobPosting; // Best-quality merged result
  sources: {
    markdownAi: JobPosting; // What AI extracted from markdown
    brJson: Record<string, unknown>; // What BR /json extracted
    htmlBullets: ParsedBulletGroup[]; // What HTML parser found
  };
  discrepancies: Array<{
    field: string; // e.g. "responsibilities[3]"
    aiVersion: string;
    htmlVersion: string;
    selectedSource: "ai" | "html";
  }>;
};
```

### [MODIFY] [extract.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/extract.ts)

Export the `defaultPrompt` so `scrape.ts` can reuse the exact same instructions for the `captureJSON` call:

```ts
export const EXTRACTION_SYSTEM_PROMPT = [...].join("\n");
```

### Logo & Brand Extraction

#### [MODIFY] [scrape.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/orchestrator/methods/jobs/scrape.ts)

After the 3-fold scrape, run a **separate BR `/json` call** for brand/logo extraction:

```ts
const brandResult = await browser.captureJSON(companyHomepageUrl, {
  prompt:
    "Extract the company's primary logo image URL and theme colors (primary hex, accent hex).",
  responseFormat: {
    type: "json_schema",
    json_schema: {
      name: "brand_assets",
      properties: {
        logoUrl: "string",
        colorPrimary: "string",
        colorAccent: "string",
      },
    },
  },
});
```

#### [MODIFY] [companies.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/companies.ts)

Add `logo_url` column:

```ts
logoUrl: text("logo_url"),  // Cloudflare Images delivery URL
```

#### Upload flow:

1. Fetch raw image from extracted `logoUrl`
2. Upload to Cloudflare Images via `uploadScreenshotToImages` (adapted for arbitrary buffers)
3. Store the Cloudflare Images delivery URL in `companies.logoUrl`

> [!IMPORTANT]
> Logo extraction should happen **asynchronously** as a separate orchestrator task (`extract_brand_assets`) after the job is ingested. This avoids slowing down the intake flow.

---

## Workstream 5: HTML Sidecar Bullet Parser

### [NEW] [html-bullet-parser.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tools/html-bullet-parser.ts)

Deterministic, non-AI parser:

```ts
export type ParsedBulletGroup = {
  heading: string; // Raw heading text
  type: RoleBulletType | string; // Matched enum or heading fallback
  bullets: string[]; // Verbatim <li> content
  confidence: "keyword" | "heading_fallback";
};

export function parseHtmlBullets(html: string): ParsedBulletGroup[];
```

**Algorithm:**

1. Find all `<ul>` blocks in the HTML
2. For each `<ul>`:
   - Extract every `<li>` child as a separate string (strip inner HTML tags, preserve `—`, `–`, punctuation)
   - Walk backward from the `<ul>` to find the closest preceding `<h1-h6>` heading
   - A heading _below_ the `<ul>` belongs to the next section — skip it
3. Classify each group by heading keyword matching:

| Keywords in heading                             | Mapped type                         |
| ----------------------------------------------- | ----------------------------------- |
| "responsibilit", "what you'll do", "duties"     | `KEY_RESPONSIBILITY`                |
| "required" + ("qualif" \| "minimum")            | `REQUIRED_QUALIFICATION`            |
| "preferred" + "qualif", "nice to have", "ideal" | `PREFERRED_QUALIFICATION`           |
| "required skill", "technical requirements"      | `REQUIRED_SKILL`                    |
| "preferred skill", "desired skill"              | `PREFERRED_SKILL`                   |
| "education", "degree"                           | `EDUCATION_REQUIREMENT`             |
| "benefit", "perk", "what we offer", "why join"  | `BENEFIT`                           |
| **No match**                                    | Use heading text verbatim as `type` |

### [MODIFY] [intake.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/intake.ts)

In the SSE scrape handler, after AI extraction:

1. Also run `parseHtmlBullets(scrapedHtml)` — this is instant (no API calls)
2. Include both in the SSE `extracted` / `mapping` event:

```json
{
  "stage": "mapping",
  "payload": {
    "posting": { ... },
    "htmlBullets": [ ... ],
    "pdfUrl": "..."
  }
}
```

### [MODIFY] [IntakeModal.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/intake/IntakeModal.tsx)

For each `BulletSection`, if the sidecar parser returned matching bullets:

```
┌──────────────────────────────────────────────┐
│ Key Responsibilities                    (7)  │
│ ⚠ HTML parser found 7 matching bullets       │
│ ┌──────────────────────────────────────────┐  │
│ │ [Compare AI vs HTML] button              │  │
│ └──────────────────────────────────────────┘  │
│                                              │
│ Inline diff view (when expanded):            │
│ ┌─ AI ──────────────┬─ HTML ───────────────┐ │
│ │ "Coordinate the   │ "Coordinate the      │ │
│ │  legal team's AI  │  legal team's AI     │ │
│ │  tooling roadmap" │  tooling roadmap —   │ │
│ │                   │  maintaining         │ │
│ │                   │  visibility into..." │ │
│ │ [Use AI]          │ [Use HTML ✓]         │ │
│ └───────────────────┴──────────────────────┘ │
│                                              │
│ Default: auto-prefer the longer version      │
└──────────────────────────────────────────────┘
```

- Each bullet shows side-by-side: AI version vs HTML version
- User can click to select which to use
- **Default heuristic**: If HTML version is longer (more verbatim), auto-prefer it
- A "Use All HTML" bulk action at section level

---

## API Routes

### [NEW] `GET /api/roles/:roleId/insights?type=location|compensation|combined`

Returns latest insight for the given type. Returns `null` if none exists.

### [NEW] `POST /api/roles/:roleId/insights`

Body: `{ types: ["location", "compensation", "combined"] }`

1. Checks for changes (hashes current role state)
2. Checks ALL historical versions — if current hash matches any version, returns that
3. If truly new → generates new version(s)
4. Returns all generated/existing insights

### [NEW] `GET /api/roles/:roleId/insights/history?type=location`

Returns all versions for timeline view.

---

## Scoring Guidelines (Injected into AI Prompts)

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

**Personal context**: "Justin prefers WFH, benchmarks at 2 days. 7 years on Google Bus SF→MTV (2-2.5hr each way, free) — miserable. Not a deal-breaker but major QoL impact."

### Compensation Score (0–100)

Uses the FULL `compensation_baseline` from global_config:

- Target TC ~$260,672 (Base $176K + Bonus $32K + Equity $52.6K/yr)
- Total equity over all years: ~$750K
- Perks: Free bus, food 5 days, 25 PTO
- W-2 verification: $263,427 (2025, incl $72.7K non-recurring)

Scoring:

- Role max ≥ 120% of Google TC → 90–100
- Role max ≈ Google TC ± 10% → 60–80
- Role max ≤ 80% of Google TC → 30–50
- Factor non-cash: Google had bus, food, 25 PTO

### Combined Score (0–100)

| Scenario                   | Combined Score                    |
| -------------------------- | --------------------------------- |
| $400K + 5d/wk Cupertino    | 65–75 (comp offsets commute)      |
| ≤$176K base + 5d/wk SF RTO | 30–40 (at/below Google + commute) |
| ≤$176K base + full WFH     | 60–70 (WLB improvement offsets)   |
| $300K+ + full WFH          | 90+ (premium everywhere)          |

---

## Execution Order

1. **WS1** (role_insights table + service) — foundation for all panels
2. **WS2** (CommunteService + ORS) — location scoring backend
3. **WS5** (HTML bullet parser) — can run in parallel with WS2
4. **WS4** (multi-pass scrape + reconciliation) — depends on WS5 for parser
5. **WS3** (frontend panels) — depends on WS1 + WS2 being deployed

---

## Verification Plan

### Automated

- `pnpm run build` — type-check everything
- `pnpm run db:generate` — migration for `role_insights` + `companies.logo_url`
- `pnpm run cf-typegen` — regenerate after ORS_API_KEY added

### Manual

1. `pnpm dlx wrangler secret put ORS_API_KEY`
2. Load a role with location + salary → verify panels render
3. Trigger insights → verify ORS geocode + AI synthesis
4. Edit role location → re-trigger → verify new version detected + created
5. Same role unchanged → verify existing version returned (no redundant generation)
6. Test ORS failure → verify AI-only fallback works
7. Scrape a new Greenhouse job → verify 3-fold extraction + HTML comparison in IntakeModal
8. Verify logo extraction populates `companies.logoUrl` with Cloudflare Images URL
