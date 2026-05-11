# Location, Compensation & Bullet Extraction Overhaul

Four interconnected workstreams to deliver versioned, intelligent analysis panels and fix verbatim extraction.

---

## Workstream 1: Role Insights D1 Table & Service

### [NEW] [role-insights.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/role-insights.ts)

New versioned D1 table `role_insights`:

| Column             | Type          | Description                                                                                        |
| ------------------ | ------------- | -------------------------------------------------------------------------------------------------- |
| `id`               | text PK       | UUID                                                                                               |
| `role_id`          | text FK→roles | Cascading delete                                                                                   |
| `version`          | integer       | Auto-incremented per role                                                                          |
| `type`             | text          | `location`, `compensation`, or `combined`                                                          |
| `input_hash`       | text          | SHA-256 of `(location+workplaceType+rtoPolicy+salaryMin+salaryMax+bullets_hash)` to detect changes |
| `score`            | integer       | 0–100                                                                                              |
| `rationale`        | text          | AI summary (always visible)                                                                        |
| `raw_api_response` | text (JSON)   | The raw ORS/geocode API response (collapsible on frontend)                                         |
| `analysis_payload` | text (JSON)   | Structured analysis blob (commute table, comp breakdown, etc.)                                     |
| `config_snapshot`  | text (JSON)   | Snapshot of the compensation_baseline config at analysis time                                      |
| `created_at`       | timestamp     |                                                                                                    |

**Change detection logic** (in service): Before generating, hash the current `location + workplaceType + rtoPolicy + salaryMin + salaryMax + role_bullets_content_sorted` and compare against the most recent `input_hash` for that role+type. If unchanged, return the last version. If changed, generate new version.

> [!IMPORTANT]
> Must check ALL versions (not just latest) to detect if the current state matches any historical snapshot — this enables detecting "rolled back" changes too.

---

### [NEW] [role-insights-service.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/role-insights-service.ts)

Central service with methods:

- `generateLocationInsight(env, roleId)` — Geocode → ORS → AI synthesis
- `generateCompensationInsight(env, roleId)` — Read comp config → AI analysis
- `generateCombinedInsight(env, roleId)` — Takes location + comp scores, synthesizes combined WLB/value score
- `getLatestInsight(env, roleId, type)` — Returns latest version for a type
- `getInsightHistory(env, roleId, type)` — Returns all versions
- `checkForChanges(env, roleId)` — Returns `{ locationChanged, compensationChanged, bulletsChanged }`

---

### [MODIFY] [schema.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schema.ts)

Add `export * from "./schemas/role-insights"` to barrel.

---

## Workstream 2: Commute Analysis (ORS Integration)

### [NEW] [commute-service.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/commute-service.ts)

Using the OpenRouteService API (user-provided pattern adapted for Workers):

```
CommuteService
├── geocode(query: string) → GeoPoint | null
├── getCommuteMatrix(home, office) → { driving, transit }
└── analyzeCommute(env, roleId) → CommuteAnalysis
```

**Geocode resolution**: The service will:

1. Read `metadata.location` from the role (e.g. "San Francisco, CA")
2. Try geocoding `"{companyName} office {location}"` first (e.g. "Anthropic office San Francisco")
3. Fall back to just `"{location}"` if the company-specific query fails
4. AI can also extract a more specific address from the role description if available

**Fixed home**: `126 Colby St, San Francisco, CA 94134`

**Commute modes** (separate ORS calls):

- `driving-car` — Tesla Model 3
- Public transit — estimate via AI synthesis (ORS doesn't have real-time transit; will note this in the response)

**RTO schedules** calculated: 2 days/wk, 3 days/wk, 5 days/wk

**Cost estimates** (AI-generated, based on distance):

- Driving: electricity cost (~$0.04/mi for Tesla), SF parking ($15-30/day), Bay Bridge toll ($7 if applicable)
- Transit: BART/Muni monthly pass vs per-ride pricing

**Fallback**: If ORS API fails → pure AI estimation based on location text

### Environment Setup

#### [MODIFY] `wrangler.jsonc`

Add `ORS_API_KEY` as a Worker Secret (via `wrangler secret put ORS_API_KEY`).

#### [MODIFY] `worker-configuration.d.ts`

After `pnpm run cf-typegen`, will include `ORS_API_KEY: string`.

---

## Workstream 3: Frontend Analysis Panels

### [NEW] [LocationAnalysis.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/LocationAnalysis.tsx)

**Layout:**

```
┌─────────────────────────────────────────┐
│ 📍 Location Analysis          Score: 82 │ ← Radial gauge + location badges
├─────────────────────────────────────────┤
│ Office: Anthropic, 548 Market St, SF    │
│ Type: Hybrid │ RTO: 3 days/week        │
├─────────────────────────────────────────┤
│ ▾ API Response (collapsible)            │ ← Raw ORS/geocode JSON, minimized
│   { geocoded coords, distances, ... }   │
├─────────────────────────────────────────┤
│ AI Commute Summary (always visible)     │
│                                         │
│ ┌─────────┬──────────┬────────┬───────┐ │
│ │Schedule │Transit   │Tesla   │Hrs/wk │ │
│ ├─────────┼──────────┼────────┼───────┤ │
│ │2 days   │35m/$4.50 │22m/$8  │2.3h   │ │
│ │3 days   │35m/$4.50 │22m/$8  │3.4h   │ │
│ │5 days   │35m/$4.50 │22m/$8  │5.7h   │ │
│ └─────────┴──────────┴────────┴───────┘ │
│                                         │
│ Monthly cost: Transit $95 vs Drive $210 │
│                                         │
│ "Justin prefers WFH. This hybrid role   │
│  at 3 days/wk from 94134 to SoMa is a  │
│  22-min drive — far better than the     │
│  2-2.5hr Google Bus to MTV. Score       │
│  reflects manageable commute."          │
└─────────────────────────────────────────┘
```

**Scoring context injected into AI prompt:**

- Justin prefers WFH, benchmarks at 2 days in-office
- 7 years commuting SF → Mountain View on Google Bus (2-2.5hr each way, free)
- Not a deal-breaker but impacts quality of life
- Full remote = highest score, short commute 2 days = good, 5 days long commute = lowest

---

### [NEW] [CompensationAnalysis.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/CompensationAnalysis.tsx)

**Layout:**

```
┌─────────────────────────────────────────┐
│ 💰 Compensation Analysis     Score: 68  │ ← Radial gauge
├─────────────────────────────────────────┤
│ ┌─ Salary Range Bar ─────────────────┐  │
│ │ $200K ▓▓▓▓▓▓▓▓[★$265K]▓▓ $300K    │  │ ← ★ = negotiation target
│ └────────────────────────────────────┘  │
├─────────────────────────────────────────┤
│ AI Analysis                             │
│                                         │
│ Historical Google TC: ~$260,672         │
│  Base: $176K │ Bonus: $32K (18%)       │
│  Equity: $52,672/yr │ Perks: Bus, food │
│                                         │
│ Advertised Range: $200K – $300K base    │
│ Negotiation target: $265K base          │
│  → "Anchor at $280K citing Google L5    │
│    total comp. $265K is achievable..."  │
│                                         │
│ Net vs Google:                          │
│  Base: +$89K │ But no RSU/bus/food     │
│  Effective TC delta: +$4K to -$12K     │
│  depending on equity/perks package     │
└─────────────────────────────────────────┘
```

**Data sourced from**: `global_config.compensation_baseline` (the full text the user has saved, including all line items).

---

### [NEW] [CombinedValueScore.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/CombinedValueScore.tsx)

A small card below the two panels showing the **combined score** — AI synthesizes location + compensation together:

- High pay + long commute = balanced
- Low pay + full WFH = balanced
- Low pay + long commute = low score
- High pay + full WFH = highest score

---

### [MODIFY] [HireabilityHeader.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/HireabilityHeader.tsx)

- Remove the **Compensation** RadialScoreCard from the 2-column grid
- Keep only **Hire Likelihood** radial (still uses `role_analyses.hireScore`)
- Make it full-width (single column)

---

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

Pass `role` object (with metadata) to the new components. Components self-fetch insights from the API.

### [MODIFY] [types.ts](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/dashboard/types.ts)

Add `metadata` and `roleInstructions` to `RoleRow`:

```ts
metadata?: Record<string, unknown> | null;
roleInstructions?: string | null;
```

---

## Workstream 4: HTML Sidecar Bullet Parser

> [!IMPORTANT]
> This runs **in parallel** with AI extraction during scrape. It provides a ground-truth "HTML-parsed" version of each bullet to compare against the AI's extraction.

### [NEW] [html-bullet-parser.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tools/html-bullet-parser.ts)

A deterministic, non-AI parser:

1. Takes raw HTML from the scrape (`scrapedHtml`)
2. Uses a lightweight HTML parser (Workers-compatible — `htmlrewriter` or simple regex since we're just finding `<ul>/<li>`)
3. For each `<ul>` block:
   - Walk backward through the DOM to find the closest preceding `<h1-h6>` heading
   - Extract each `<li>` as a separate string (stripped of HTML tags, preserving `—`, `–` dashes and punctuation)
4. Classify each group by heading keyword matching:
   - `responsibilities` → heading contains "responsibilit" / "what you'll do" / "role" / "duties"
   - `required_qualification` → "required" / "must have" / "minimum" / "qualifications"
   - `preferred_qualification` → "preferred" / "nice to have" / "ideal" / "bonus"
   - `required_skill` → "required skill" / "technical requirements"
   - `preferred_skill` → "preferred skill" / "desired skill"
   - `education` → "education" / "degree"
   - `benefit` → "benefit" / "perk" / "what we offer" / "why join"
   - **Fallback**: Use the heading text verbatim as the type label
5. Returns:
   ```ts
   type ParsedBulletGroup = {
     heading: string; // Raw heading text
     type: RoleBulletType | string; // Matched enum or heading fallback
     bullets: string[]; // Verbatim <li> content
     confidence: "keyword" | "heading_fallback";
   };
   ```

### [MODIFY] [intake.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/intake.ts)

In the SSE scrape handler, after the AI extraction succeeds:

1. Also run `parseHtmlBullets(scrapedHtml)` in parallel
2. Include both in the SSE `extracted` event:
   ```json
   {
     "stage": "extracted",
     "payload": {
       "posting": { ... },        // AI extraction
       "htmlBullets": [ ... ],    // Sidecar parser output
       "pdfUrl": "..."
     }
   }
   ```

### [MODIFY] [IntakeModal.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/intake/IntakeModal.tsx)

For each `BulletSection`, if the sidecar parser returned matching bullets:

- Show an indicator: **"HTML parser found N bullets for this section"**
- Add a **"Compare"** button that opens an inline diff view
- For each bullet, show side-by-side: AI version vs HTML version
- User can click to select which version to use (or keep AI, or swap to HTML)
- Default: If the HTML version is longer (more verbatim), auto-prefer it

---

## API Routes

### [NEW] `GET /api/roles/:roleId/insights?type=location|compensation|combined`

Returns the latest insight for the given type. If none exists, returns `null`.

### [NEW] `POST /api/roles/:roleId/insights`

Body: `{ types: ["location", "compensation", "combined"] }`

1. Checks for changes (hashes location, comp, bullets)
2. If no changes found vs last version of each type → returns existing
3. If changes detected → generates new version(s)
4. Returns all generated/existing insights

### [NEW] `GET /api/roles/:roleId/insights/history?type=location`

Returns all versions for a type, enabling timeline view of how scores changed.

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

**Context**: "Justin's benchmark: 2 days WFH. He survived 7 years on Google Bus (2-2.5hr each way SF→MTV, free). He was miserable. Full WFH is the dream. Any commute under 30 min for 2-3 days is good."

### Compensation Score (0–100)

Scored relative to Google historical TC of ~$260,672:

- Role advertised max ≥ 120% of Google TC → 90–100
- Role advertised max ≈ Google TC ± 10% → 60–80
- Role advertised max ≤ 80% of Google TC → 30–50
- Factor in non-cash: Google had free bus, food, 25 PTO days

### Combined Score (0–100)

AI synthesizes both:

- "$400K + 5 days Cupertino" → comp offsets commute pain → 65-75
- "$176K + 5 days SF RTO" → at/below Google + commute → 30-40
- "$176K + full WFH" → at Google base but WLB improvement → 60-70
- "$300K + full WFH" → premium on every axis → 90+

---

## Verification Plan

### Automated

- `pnpm run build` — type-check everything
- `pnpm run db:generate` — generate migration for `role_insights` table
- `pnpm run cf-typegen` — regenerate types after adding ORS_API_KEY

### Manual

1. Set up ORS_API_KEY: `pnpm dlx wrangler secret put ORS_API_KEY`
2. Load a role with location + salary data → verify both panels render
3. Trigger insights generation → verify ORS API call + AI synthesis
4. Edit role location → re-trigger → verify new version created
5. Test fallback: disconnect ORS → verify AI-only estimation works
6. Test HTML bullet comparison during new role intake
