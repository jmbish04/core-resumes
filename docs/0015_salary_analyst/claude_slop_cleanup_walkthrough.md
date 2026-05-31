# Walkthrough: Centralized Geo & EAV Data Architecture

## Overview

Implemented a centralized geographic data system that replaces 5+ scattered location data sources with a single-source-of-truth `geo_locations` table, an EAV metadata layer (`geo_location_meta_definitions` + `geo_location_mappings`), and a REST API. All backend benchmarks, AI agents, and frontend charts now reference this system.

## Changes Made

### Phase 1: Database Schema

**New files:**
- [geo-locations.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/geo/geo-locations.ts) — 4 location types (metro, country, micro_hub, neighborhood), autoincrement integer PK, lat/lng, self-referential `parent_id` for hierarchy
- [geo-location-meta-definitions.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/geo/geo-location-meta-definitions.ts) — EAV attribute registry (e.g., `cost_of_living_index`)
- [geo-location-mappings.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/geo/geo-location-mappings.ts) — EAV value store (geo_id × meta_id → value), unique constraint
- [index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/geo/index.ts) — barrel export

**Modified:**
- [roles.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/applications/roles.ts#L96) — Added `geoId: integer("geo_id")` FK + index
- [cost-of-living-index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/applications/cost-of-living-index.ts#L22) — Added `geoId` FK reference to `geo_locations`

**Migrations:** `0042_confused_inhumans.sql` (schema), `0043_brainy_bastion.sql` (COL geo_id FK)

---

### Phase 2: Comprehensive Seed Script

**Modified:** [seed-salary-refactor.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/pipeline/seed-salary-refactor.ts#L77)

The `col-index` seed endpoint now upserts:
1. **13 US metros** — with lat/lng, region, city, country
2. **EAV meta definition** — `cost_of_living_index` (created once, reused)
3. **COL values via EAV** — `geo_location_mappings` entries per metro
4. **Legacy COL table** — backward-compatible `cost_of_living_index` rows
5. **56 country centroids** — matching the old `COUNTRY_COORDS` dict
6. **16 Bay Area micro-hubs** — with `parent_id` → SF metro record

---

### Phase 3: Geo API

**New:** [geo.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/geo.ts)

| Endpoint | Description |
|----------|-------------|
| `GET /api/geo/locations` | Full list with optional `?type=&country=&includeMetrics=` |
| `GET /api/geo/locations/list` | Compact (id, name, type, country) for AI prompt injection |
| `GET /api/geo/locations/{id}` | Single location with all EAV mappings |
| `POST /api/geo/locations/seed` | Bulk upsert locations + EAV via JSON body |
| `POST /api/geo/locations/backfill-roles` | Backfill `roles.geo_id` from metro strings |

---

### Phase 4: Backend Consumer Migration

| File | Change |
|------|--------|
| [geo-premium-deltas.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/salary/benchmarks/aggregate/geo-premium-deltas.ts) | Joins via `geo_locations` + `geo_location_mappings` instead of `cost_of_living_index` string join |
| [remote-discount-index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/salary/benchmarks/aggregate/remote-discount-index.ts) | Uses `geo_locations` subquery to find canonical "Remote" record |
| [vs-cross-market.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/salary/benchmarks/vs-cross-market.ts) | **Full implementation** (was stub) — COL-adjusted cross-metro comparison, returns ranked `MetroRow[]` with adjusted salaries |
| [sql-tool.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/salary/sql-tool.ts#L11-L25) | Added `geo_locations`, `geo_location_meta_definitions`, `geo_location_mappings` to `ALLOWED_TABLES` |
| [data-dictionary.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/salary/data-dictionary.ts) | Full rewrite with geo tables documented, deprecated COL table noted, example JOINs updated |
| [types.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/salary/types.ts#L17) | `geoId: number | null` on `BenchmarkInput`, `geoId: number` on `MetroRow` |
| [single-role.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/salary/modes/single-role.ts#L18-L28) | Resolves `role.geoId` → metro name from `geo_locations` |

---

### Phase 5: AI Agent Geo-Awareness

**Modified:** [facts.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/extract/facts.ts#L30)

- Added `geoId: z.number().nullable()` to `RoleFactFields` schema
- System prompt includes `<GEO_LOCATIONS_LIST>` XML block when `geoList` is provided
- `extractRoleFactFields()` accepts optional `geoList` parameter for AI geo-tagging

---

### Phase 6: Frontend Migration

| File | Change |
|------|--------|
| [GeographicPremiumChart.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/salary/charts/GeographicPremiumChart.tsx#L182-L219) | Accepts optional `geoLocations` prop — uses API data for coordinate resolution when available, falls back to hardcoded |
| [SalaryIntelligenceDashboard.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/salary/SalaryIntelligenceDashboard.tsx#L162) | Fetches `GET /api/geo/locations` on mount, passes to chart |
| [FreelanceDashboard.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/freelance/FreelanceDashboard.tsx#L291) | Replaced `COUNTRY_COORDS` import with `GET /api/geo/locations?type=country` fetch, keyed by ISO code |
| [country-coords.ts](file:///Volumes/Projects/workers/core-resumes/src/frontend/lib/country-coords.ts) | **Deprecated** — exports empty dict with deprecation warnings |

---

### Phase 7: Documentation

| File | Change |
|------|--------|
| [salary.md](file:///Volumes/Projects/workers/core-resumes/src/frontend/content/docs/agents/salary.md) | Added allowed tables list, geo-aware query patterns, cross-market benchmark note |
| [geo.md](file:///Volumes/Projects/workers/core-resumes/src/frontend/content/docs/data/geo.md) | **New** — EAV schema docs, API endpoints, consumer integration patterns, seeding, deprecation notes |

---

## Verification Report

| Check | Result |
|-------|--------|
| `pnpm run db:generate` | ✅ `No schema changes, nothing to migrate` |
| `pnpm run build` | ✅ `Server built in 22.66s, Complete!` |
| TypeScript compilation | ✅ No type errors |
| No stale `COUNTRY_COORDS` imports | ✅ Zero references remaining |
| `country-coords.ts` safely deprecated | ✅ Exports empty dict, not deleted |
| All geo API routes wired | ✅ `app.route("/api/geo", geoRouter)` in [index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/index.ts#L141) |
| Drizzle schema matches D1 | ✅ 82 tables, all columns/indexes verified |
