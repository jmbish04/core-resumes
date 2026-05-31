---
title: "Role Insights Engine"
date_last_updated: "2026-05-31"
---

# Role Insights Engine

The Role Insights Engine provides AI-powered analysis across three dimensions — **Location**, **Compensation**, and **Combined Value** — to help evaluate job opportunities against Justin's preferences and historical compensation at Google.

## Architecture

### Multi-Dimension Analysis

Each role can be analyzed across three independent dimensions, each producing a versioned, scored insight:

- **Location** — Evaluates commute time, cost, and workplace type against Justin's WFH/hybrid preferences and his SF 94134 home base.
- **Compensation** — Compares the advertised salary range against Justin's Google TC (~$260,672), estimates negotiation targets, and calculates the delta.
- **Combined** — Synthesizes location and compensation scores into a single holistic value assessment.

### Versioned History with Change Detection

Every analysis run is versioned. The system uses **SHA-256 input hashing** to detect when the underlying data has changed:

- **Location hash** = `sha256(location + workplaceType + rtoPolicy + bullets)`
- **Compensation hash** = `sha256(salaryMin + salaryMax + currency + bullets)`
- **Combined hash** = `sha256(locationHash + compensationHash)`

If a new analysis request matches any prior hash (not just the latest version), the cached result is returned immediately. This handles rollback scenarios where a role's metadata is reverted to a prior state.

## Scoring Rubrics

Analysis scores are not hardcoded — they are driven by **configurable scoring rubrics** stored in the `scoring_rubrics` D1 table.

### Managing Rubrics

Navigate to **Config → Scoring Rubrics** to manage rubrics. Each rubric type has its own management table:

- **Location rubrics** — Criteria for evaluating commute, workplace type, and geographic fit.
- **Compensation rubrics** — Criteria for evaluating salary range, benefits, and total compensation.
- **Combined rubrics** — Criteria for holistic trade-off evaluation between dimensions.

Each rubric defines:

- **Criteria** — A human-readable description of what is being scored (e.g., "Commute under 30 minutes").
- **Score range** — The min/max score band for this criteria (e.g., 80–100 for a fully remote role).
- **Active status** — Soft-delete toggle. Inactive rubrics are excluded from analysis.

### Seeding Default Rubrics

Click the **Seed Defaults** button on the Scoring Rubrics config tab to populate the system with a baseline rubric set. The seed endpoint is idempotent — it only creates rubrics that don't already exist.

## Location Analysis

The location analysis evaluates a role's geographic fit based on:

### Justin's Commute Profile

- Home: San Francisco, CA 94134
- Strong WFH preference
- Acceptable: hybrid 2 days/week with short commute
- Benchmark: 7 years commuting SF → Mountain View via free Google Bus
- Primary vehicle: Tesla Model 3
- Transit access: BART and Muni

### Output

- **Score** (0–100) — Based on active location rubrics
- **Commute table** — Duration and monthly cost estimates for:
  - 2, 3, and 5 days/week schedules
  - Both driving (Tesla Model 3) and public transit (BART/Muni)
- **Workplace assessment** — WFH/hybrid/onsite fit evaluation
- **Location metadata** — Badges showing location, workplace type, and RTO policy

## Compensation Analysis

The compensation analysis evaluates a role's pay against Justin's Google baseline:

### Google Compensation Baseline

Loaded from the `compensation_baseline` key in `global_config`. The default baseline includes:

- **Total Target Compensation:** ~$260,672
- **Base Salary:** ~$176,000 ($84.6154/hr)
- **Target Annual Bonus:** ~$32,000 (18% target)
- **Annual Equity:** ~$52,672 (vested RSUs)
- **Total Equity (all years):** ~$750,000
- **PTO:** 25 vacation days
- **Perks:** Free meals 5x/week, free commute via Google Bus

### Output

- **Score** (0–100) — Based on active compensation rubrics
- **Advertised range** — Min/max salary badges
- **Negotiation target** — AI-recommended negotiation number with strategy rationale
- **Delta vs Google** — Dollar difference between the role's TC and Google TC
- **Comparative Bar Chart** — A visual `BarChart` comparing Google TC, Advertised Max, and Target Compensation side-by-side.
- **Advertised assessment** — Contextual evaluation of the salary range relative to market

## Combined Value Score

The combined analysis synthesizes location and compensation into a single value:

- Both sub-dimension insights are generated first (if not already cached).
- The AI considers **trade-offs** — e.g., a high salary may offset a longer commute.
- **Sub-scores** for location and compensation are displayed alongside the combined gauge.

## Frontend Panels

The three analysis panels are displayed on the **Role Viewport → Overview** tab in a 3-column grid between the Hireability Header and Role Bullets:

- **LocationAnalysis** — Radial gauge + location badges + commute table
- **CompensationAnalysis** — Radial gauge + salary badges + delta vs Google + negotiation strategy
- **CombinedValueScore** — Radial gauge + sub-dimension score cards

Each panel includes:

- **Version badge** — Shows which analysis version is displayed
- **Refresh button** — Re-runs analysis for that dimension
- **Empty state** — Analyze button when no analysis exists yet

## API Reference

### `GET /api/roles/:roleId/insights?type=location|compensation|combined`

Returns the latest insight for the specified type. Returns 404 if no analysis exists.

### `GET /api/roles/:roleId/insights/history?type=location|compensation|combined`

Returns all versioned insights for the type, ordered newest first.

### `GET /api/roles/:roleId/insights/changes`

Returns a map of which dimensions have changed inputs since their last analysis: `{ location: true, compensation: false, combined: true }`.

### `POST /api/roles/:roleId/insights`

Triggers analysis for specified types. Body: `{ types: ["location", "compensation", "combined"] }`. Omit `types` to analyze all three dimensions.

## File Reference

- `src/backend/db/schemas/role-insights.ts` — D1 table definition
- `src/backend/db/schemas/scoring-rubrics.ts` — Scoring rubrics table
- `src/backend/services/role-insights-service.ts` — Analysis orchestration + caching
- `src/backend/api/routes/insights.ts` — API endpoints
- `src/backend/api/routes/scoring-rubrics.ts` — CRUD + seed endpoints
- `src/frontend/components/role/LocationAnalysis.tsx` — Location panel
- `src/frontend/components/role/CompensationAnalysis.tsx` — Compensation panel
- `src/frontend/components/role/CombinedValueScore.tsx` — Combined panel
- `src/frontend/components/config/ScoringRubricsEditor.tsx` — Config UI
