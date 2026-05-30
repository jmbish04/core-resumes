# Implementation Plan: Centralized Geo & EAV Data Architecture

## Overview

The current architecture scatters geographic data across **5+ independent sources**:

| Source | Location | Type | Problem |
|--------|----------|------|---------|
| `cost_of_living_index` | D1 table | Metro → COL multiplier | String PK, no coordinates, no FK |
| `roles.metro` | D1 column | Free-text metro string | No FK, no validation, inconsistent naming |
| `COUNTRY_COORDS` | [country-coords.ts](file:///Volumes/Projects/workers/core-resumes/src/frontend/lib/country-coords.ts) | Static dict (57 countries) | Hardcoded frontend, not queryable |
| `HUB_COORDS` | [GeographicPremiumChart.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/salary/charts/GeographicPremiumChart.tsx#L24-L99) | Static dict (~50 metros + micro-hubs) | Hardcoded frontend, duplicates metro data |
| `COMPANY_HUB_MAP` | [GeographicPremiumChart.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/salary/charts/GeographicPremiumChart.tsx#L118-L157) | Company → micro-hub mapping | Hardcoded frontend |
| Salary Agent `data-dictionary.ts` | [data-dictionary.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/salary/data-dictionary.ts#L35-L37) | LLM prompt text referencing `cost_of_living_index` | Stale if table changes |
| `PASS_B_FACTS_SYSTEM_PROMPT` | [facts.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/extract/facts.ts#L50) | AI extracts `location` as free-text | No geo_id tagging |

This plan introduces a **single-source-of-truth** `geo_locations` table with **autoincrement integer IDs**, strict FK relations, and EAV metadata mappings. All consumers — backend benchmarks, AI agents, and frontend charts — will reference this table.

---

## Architecture Decisions

- **Integer autoincrement PK** — no UUID overhead. All FK references use `geo_id INTEGER`.
- **EAV for extensibility** — `geo_location_meta_definitions` + `geo_location_mappings` lets us attach arbitrary metrics (COL index, tech-hub tier, remote discount factor, etc.) without schema changes.
- **FK migration, not string joins** — `roles.metro` → `roles.geo_id` (FK to `geo_locations.id`). APIs resolve the human-readable metro name so the frontend never needs to join.
- **AI geo-awareness** — agents receive the full `geo_locations` list (id + metro + country) in their system prompt so they can return `geo_id` in structured responses for zero-ambiguity programmatic processing.
- **Backend-resolved lookups** — all API endpoints that return geo-related data will JOIN to `geo_locations` and return the resolved `metro`, `lat`, `lng`, `country` inline. The frontend never queries geo separately for display.
- **Deprecation path** — `cost_of_living_index` table stays in the schema temporarily but is marked deprecated. All consumers switch to EAV. Table is dropped in a future migration.

---

## Comprehensive Impact Map

### Backend Files Requiring Changes

| File | Current Geo Usage | Required Change |
|------|-------------------|-----------------|
| [roles.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/applications/roles.ts#L95) | `metro: text("metro")` | Add `geoId: integer("geo_id")` FK, keep `metro` temporarily for migration |
| [cost-of-living-index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/applications/cost-of-living-index.ts) | Entire table | Deprecate → migrate data to EAV |
| [schema barrel](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/applications/index.ts#L28) | Exports `cost-of-living-index` | Add new geo exports |
| [geo-premium-deltas.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/salary/benchmarks/aggregate/geo-premium-deltas.ts#L22-L28) | Raw SQL: `JOIN cost_of_living_index col ON m.metro = col.metro` | Rewrite to join `geo_locations` + `geo_location_mappings` |
| [remote-discount-index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/salary/benchmarks/aggregate/remote-discount-index.ts#L27) | Raw SQL: `WHERE metro = 'Remote'` | Use `geo_id` FK or canonical "Remote" geo record |
| [vs-cross-market.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/salary/benchmarks/vs-cross-market.ts) | Stub — references `CrossMarketInput.baseMetro` | Implement using `geo_locations` + EAV |
| [data-dictionary.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/salary/data-dictionary.ts#L35-L37) | LLM prompt references `cost_of_living_index` schema | Update to reference `geo_locations` + EAV tables |
| [sql-tool.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/salary/sql-tool.ts#L17) | `ALLOWED_TABLES` includes `cost_of_living_index` | Add `geo_locations`, `geo_location_meta_definitions`, `geo_location_mappings`; deprecate `cost_of_living_index` |
| [types.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/salary/types.ts#L17) | `metro: string \| null` in `BenchmarkInput` | Add `geoId: number \| null`, keep `metro` for display |
| [types.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/salary/types.ts#L101-L103) | `MetroRow { metro: string; colIndex: number }` | Add `geoId: number` |
| [single-role.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/salary/modes/single-role.ts#L33) | `metro: role.metro` | Resolve `geoId` → metro name from `geo_locations` |
| [aggregate.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/salary/modes/aggregate.ts#L6) | Imports `runGeoPremiumDeltas` | No import change, but output payload changes |
| [seed-salary-refactor.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/pipeline/seed-salary-refactor.ts#L86-L108) | Hardcoded `{ metro, colIndex }` array → `costOfLivingIndex` | Rewrite to upsert `geo_locations` + EAV |
| [role-insights.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/role-insights.ts#L69-L70) | `geographicPositioning: string` in compensation prompt | Inject `geo_locations` data into prompt context |
| [openroute.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/openroute.ts#L69-L86) | Geocodes via external Pelias API | Check `geo_locations` table first as cache |
| [facts.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/extract/facts.ts#L29) | Extracts `location: z.string().nullable()` | Add `geoId: z.number().nullable()` — AI receives geo list to tag |

### Frontend Files Requiring Changes

| File | Current Geo Usage | Required Change |
|------|-------------------|-----------------|
| [country-coords.ts](file:///Volumes/Projects/workers/core-resumes/src/frontend/lib/country-coords.ts) | Static `COUNTRY_COORDS` dict | **DELETE** — replaced by API `/api/geo/locations` |
| [FreelanceDashboard.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/freelance/FreelanceDashboard.tsx#L110) | `import { COUNTRY_COORDS }` | Fetch from `/api/geo/locations?type=country` on mount |
| [GeographicPremiumChart.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/salary/charts/GeographicPremiumChart.tsx#L24-L157) | `HUB_COORDS`, `BAY_AREA_MICRO_HUBS`, `COMPANY_HUB_MAP` hardcoded | Fetch from `/api/geo/locations?type=metro` + `/api/geo/locations?type=micro_hub` |

### AI Agent / Prompt Files Requiring Changes

| File | Change |
|------|--------|
| [data-dictionary.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/salary/data-dictionary.ts) | Update schema docs: add `geo_locations`, `geo_location_meta_definitions`, `geo_location_mappings`; mark `cost_of_living_index` deprecated |
| [facts.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/extract/facts.ts#L43-L54) | Modify `PASS_B_FACTS_SYSTEM_PROMPT` to instruct AI to match extracted location against a provided geo list and return `geoId` |
| [single-role.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/salary/modes/single-role.ts#L42-L45) | Inject geo context (resolved metro name + COL index from EAV) into the prompt |
| [role-insights.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/role-insights.ts#L539-L564) | Inject geo_locations + EAV metrics into compensation analysis prompt |

### Documentation Files

| File | Change |
|------|--------|
| [salary.md](file:///Volumes/Projects/workers/core-resumes/src/frontend/content/docs/agents/salary.md#L29-L34) | Update SQL Tool Constraints section: add new geo tables to allowlist, document EAV query patterns |

---

## Proposed Changes — Detailed

### Phase 1: Database Schema Foundation

#### [NEW] `src/backend/db/schemas/geo/geo-locations.ts`

```typescript
// id: integer autoincrement PK
// type: text("type") — 'metro' | 'country' | 'micro_hub' | 'neighborhood'
// name: text("name").notNull() — canonical display name (e.g., "San Francisco, CA")
// country: text("country") — ISO 3166-1 alpha-2 (e.g., "US")
// region: text("region") — state/province (e.g., "CA")
// city: text("city") — city name
// metro: text("metro") — normalized metro area string (unique for metros)
// lat: real("lat")
// lng: real("lng")
// parent_id: integer("parent_id") — self-referential FK for micro_hub → metro hierarchy
// created_at, updated_at: integer timestamps
```

> [!IMPORTANT]
> The `type` column discriminates between country-level centroids (for freelance maps), metro-level areas (for salary benchmarking), micro-hubs (Bay Area sub-regions), and neighborhoods. The `parent_id` allows micro-hubs to reference their parent metro.

#### [NEW] `src/backend/db/schemas/geo/geo-location-meta-definitions.ts`

```typescript
// id: integer autoincrement PK
// key: text("key").unique() — e.g., "cost_of_living_index", "tech_hub_tier", "remote_discount_factor"
// label: text("label") — human-readable label
// description: text("description")
// value_type: text("value_type") — 'number' | 'string' | 'json'
// created_at, updated_at
```

#### [NEW] `src/backend/db/schemas/geo/geo-location-mappings.ts`

```typescript
// id: integer autoincrement PK
// geo_id: integer FK → geo_locations.id (ON DELETE CASCADE)
// meta_id: integer FK → geo_location_meta_definitions.id (ON DELETE CASCADE)
// value: text("value").notNull() — stringified value (parsed by consumer based on value_type)
// source: text("source") — e.g., "BLS", "manual", "seed"
// as_of: text("as_of") — date string for the data point
// created_at, updated_at
// UNIQUE(geo_id, meta_id) — one value per location per metric
```

#### [MODIFY] [roles.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/applications/roles.ts)

```diff
+ geoId: integer("geo_id"),  // FK to geo_locations.id — set at intake or backfill
  metro: text("metro"),       // DEPRECATED — kept for migration, will be removed
```

Add index: `geoIdx: index("roles_geo_id_idx").on(table.geoId)`

#### [MODIFY] [index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/applications/index.ts)

Add `export * from "../geo/geo-locations"` etc. to the barrel.

---

### Phase 2: Data Migration & Seed Script

#### [MODIFY] [seed-salary-refactor.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/pipeline/seed-salary-refactor.ts)

The `seedColIndex` route will be rewritten to:
1. Upsert all 14 metros (SF, NYC, Seattle, etc.) into `geo_locations` with `type='metro'`, lat/lng coordinates, country='US', region, city.
2. Upsert all 57 countries from `COUNTRY_COORDS` into `geo_locations` with `type='country'`.
3. Upsert all Bay Area micro-hubs from `HUB_COORDS` into `geo_locations` with `type='micro_hub'` and `parent_id` pointing to the SF metro record.
4. Upsert company→hub mappings from `COMPANY_HUB_MAP` into a new `geo_company_hub_mappings` EAV or a dedicated seed.
5. Upsert the `cost_of_living_index` meta definition and all COL index values into EAV mappings.

#### [NEW] Backfill route: `POST /api/pipeline/seed-salary-refactor/backfill-geo-ids`

Backfills `roles.geo_id` for all existing roles:
- For each role with a non-null `roles.metro`, fuzzy-match against `geo_locations.metro` or `geo_locations.name`.
- Set `roles.geo_id` to the matched record's ID.
- If no match found, set `geo_id = NULL` (never guess).
- Log all unmatched metros for manual review.

---

### Phase 3: Geo API Layer

#### [NEW] `src/backend/api/routes/geo.ts`

| Endpoint | Description |
|----------|-------------|
| `GET /api/geo/locations` | List all locations. Supports `?type=metro&country=US&includeMetrics=true`. When `includeMetrics=true`, JOINs EAV and returns all metrics inline. |
| `GET /api/geo/locations/:id` | Single location with all EAV mappings. |
| `GET /api/geo/locations/list` | Lightweight list returning only `{ id, name, type, country }` — designed for AI agent consumption (injected into system prompts). |

> [!IMPORTANT]
> The `/list` endpoint is the key enabler for AI geo-awareness. It returns a compact JSON array that agents receive in their system prompt, allowing them to return `geoId` in structured responses.

---

### Phase 4: Backend Consumer Refactoring

#### [MODIFY] [geo-premium-deltas.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/salary/benchmarks/aggregate/geo-premium-deltas.ts)

Replace:
```sql
JOIN cost_of_living_index col ON m.metro = col.metro
```
With:
```sql
JOIN geo_locations gl ON m.geo_id = gl.id
JOIN geo_location_mappings glm ON gl.id = glm.geo_id
JOIN geo_location_meta_definitions gmd ON glm.meta_id = gmd.id AND gmd.key = 'cost_of_living_index'
```

#### [MODIFY] [remote-discount-index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/salary/benchmarks/aggregate/remote-discount-index.ts)

Replace `WHERE metro = 'Remote'` with `WHERE geo_id = (SELECT id FROM geo_locations WHERE name = 'Remote' AND type = 'metro')`.

#### [MODIFY] [sql-tool.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/salary/sql-tool.ts#L11-L22)

Update `ALLOWED_TABLES`:
```diff
- "cost_of_living_index",
+ "cost_of_living_index",     // deprecated, kept for backward compat
+ "geo_locations",
+ "geo_location_meta_definitions",
+ "geo_location_mappings",
```

#### [MODIFY] [data-dictionary.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/salary/data-dictionary.ts)

Rewrite the data dictionary to:
- Add `geo_locations`, `geo_location_meta_definitions`, `geo_location_mappings` schema documentation.
- Mark `cost_of_living_index` as `⚠️ DEPRECATED — use geo_location_mappings WHERE key = 'cost_of_living_index'`.
- Update the example JOIN to use `geo_id` FK.

#### [MODIFY] [types.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/salary/types.ts)

```diff
  export interface BenchmarkInput {
    roleId: string;
+   geoId: number | null;
    metro: string | null;  // resolved display name
    ...
  }

  export interface MetroRow {
+   geoId: number;
    metro: string;
    colIndex: number;
    ...
  }
```

#### [MODIFY] [single-role.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/salary/modes/single-role.ts)

Resolve `role.geoId` → geo record before passing to benchmark battery. Inject resolved metro name + COL index from EAV into the AI prompt context.

#### [MODIFY] [openroute.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/openroute.ts)

Add a `lookupGeoCoords(env, locationString)` step before Pelias:
1. Query `geo_locations` for a matching `name`, `metro`, or `city` (case-insensitive).
2. If found and has `lat`/`lng`, return coordinates without external API call.
3. If not found, fall through to Pelias geocoding as before.

#### [MODIFY] [role-insights.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/role-insights.ts)

In `generateCompensationInsight`, inject a `<GEO_CONTEXT>` block into the system prompt containing the role's resolved geo location, its COL index from EAV, and the nearest comparable metros with their COL indices.

---

### Phase 5: AI Agent Geo-Awareness

#### [MODIFY] [facts.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/extract/facts.ts)

1. Before calling the LLM, query `GET /api/geo/locations/list` (or direct DB query) to get the compact geo list.
2. Inject the list into `PASS_B_FACTS_SYSTEM_PROMPT`:
   ```
   - location: a single string, e.g. "San Francisco, CA"
   - geoId: match the extracted location against the following geo list and return the matching ID. If no exact match, return null.
   <GEO_LOCATIONS_LIST>
   [{"id":1,"name":"San Francisco, CA","type":"metro"},{"id":2,"name":"New York, NY","type":"metro"}, ...]
   </GEO_LOCATIONS_LIST>
   ```
3. Add `geoId: z.number().nullable()` to `RoleFactFields` schema.

#### [MODIFY] Orchestrator / Role intake pipeline

When a new role is created via the intake pipeline:
- If `facts.geoId` is non-null, set `roles.geo_id = facts.geoId` directly.
- If `facts.geoId` is null but `facts.location` is non-null, do a fuzzy lookup against `geo_locations` and set `roles.geo_id`.
- If neither matches, leave `roles.geo_id = NULL`.

---

### Phase 6: Frontend Migration

#### [MODIFY] [FreelanceDashboard.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/freelance/FreelanceDashboard.tsx)

1. Remove `import { COUNTRY_COORDS }` from `@/lib/country-coords`.
2. Add a `useEffect` to fetch `GET /api/geo/locations?type=country` on mount.
3. Store the response in state: `Record<string, { lat: number; lng: number; name: string }>` (keyed by ISO country code from `geo_locations.country`).
4. The `clientHubs` computation uses this dynamic data instead of the static dict.
5. Fallback: if the API call fails, use the curated hardcoded list (as today) for resilience.

#### [MODIFY] [GeographicPremiumChart.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/salary/charts/GeographicPremiumChart.tsx)

1. Remove the `HUB_COORDS`, `BAY_AREA_MICRO_HUBS`, and `COMPANY_HUB_MAP` constants.
2. Accept a new prop `geoLocations` containing the fetched geo data (fetched by the parent `SalaryIntelligenceDashboard`).
3. The marker computation uses `geoLocations` to resolve coordinates by matching `metricLabel` to `geo_locations.name`.
4. Bay Area micro-hub detection uses `type === 'micro_hub'` from the geo data instead of a hardcoded `Set`.

#### [DELETE] [country-coords.ts](file:///Volumes/Projects/workers/core-resumes/src/frontend/lib/country-coords.ts)

Fully removed. All consumers migrated.

---

### Phase 7: Documentation

#### [MODIFY] [salary.md](file:///Volumes/Projects/workers/core-resumes/src/frontend/content/docs/agents/salary.md)

- Update SQL Tool Constraints: document new geo tables in the allowlist.
- Add EAV query pattern examples.
- Document the `cost_of_living_index` deprecation.

#### [NEW] Geo documentation page

Create `src/frontend/content/docs/data/geo.md` documenting:
- The EAV schema and query patterns.
- How to add new geo locations and metrics.
- The AI geo-tagging flow.

---

## Verification Plan

### Automated
- `pnpm run db:generate` — verify clean Drizzle migration output.
- `pnpm run types` — verify TypeScript compilation after all changes.
- `pnpm run build` — verify full production build succeeds.

### Manual
1. Hit `POST /api/pipeline/seed-salary-refactor/col-index` → verify `geo_locations` and EAV tables are populated.
2. Hit `POST /api/pipeline/seed-salary-refactor/backfill-geo-ids` → verify `roles.geo_id` is populated for existing roles.
3. Hit `GET /api/geo/locations?type=metro&includeMetrics=true` → verify metros with COL indices are returned.
4. Hit `GET /api/geo/locations?type=country` → verify all 57 countries with coordinates are returned.
5. Load the Freelance Dashboard → verify client hub map markers render from API data.
6. Load the Salary Intelligence Dashboard → verify GeographicPremiumChart renders from API data.
7. Trigger a role intake → verify the AI sets `geoId` in the structured extraction response.

---

## Migration Safety

> [!CAUTION]
> **No data loss allowed.** The `cost_of_living_index` table and `roles.metro` column are kept during the migration period. The new `roles.geo_id` column is additive. The old table can be dropped only after all consumers are verified to use the new EAV path.

> [!WARNING]
> **Backfill must fail to NULL, never guess.** If a role's `metro` string doesn't match any `geo_locations` record, `geo_id` stays NULL. An unmatched-metros report is generated for manual review.
