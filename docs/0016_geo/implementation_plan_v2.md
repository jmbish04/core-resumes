# Implementation Plan: Centralized Geo & EAV Data Architecture

## Overview
The current architecture relies on disparate, hardcoded geographic data: string-based `metro` names (e.g., "San Francisco, CA") spread across `roles` and `cost_of_living_index`, and hardcoded coordinate dictionaries like `COUNTRY_COORDS` in the frontend. This plan introduces a strict Entity-Attribute-Value (EAV) schema to standardize how we track geographic areas (metros, countries, cities) and their coordinates, and associate diverse metrics (Cost of Living index, remote discount indices) with those areas.

This will unify geo tracking, allow dynamic frontend maps, optimize backend routing, and prevent data fragmentation.

## Architecture Decisions
- **EAV Mapping:** Metrics like Cost-of-Living will be stored as generic key-value mappings tied to `geo_locations`, allowing us to easily add new metrics (e.g., tech-hub-tier) without schema changes.
- **Dynamic Frontend Maps:** The frontend `FreelanceDashboard` will dynamically fetch `lat`/`lng` from the backend `/api/geo/locations` instead of relying on the static `COUNTRY_COORDS` dictionary.
- **Backend Geocoding Cache:** `OpenRouteService` will check the `geo_locations` table for coordinates before making external API calls to Pelias, improving performance and reliability.
- **Migration Strategy:** `cost_of_living_index` will be deprecated. A new seed script will populate `geo_locations` with both the previous metros and the country coordinates.

## Task List

### Phase 1: Foundation (Database Schema)
- [ ] **Task 1: Create Geo Schema Files**
  - Create `src/backend/db/schemas/geo/geo-locations.ts`, `geo-location-meta-definitions.ts`, and `geo-location-mappings.ts`.
  - Add to `src/backend/db/schemas/applications/index.ts` and `schema.ts`.
  - Run `pnpm run db:generate`.

### Checkpoint: Foundation
- [ ] Schemas compile successfully.
- [ ] Drizzle migration is generated.

### Phase 2: API & Data Sourcing Layer
- [ ] **Task 2: Seed Script Expansion**
  - Update `src/backend/api/routes/pipeline/seed-salary-refactor.ts`.
  - Migrate all metros from `cost_of_living_index` into `geo_locations` + EAV mapping.
  - Migrate `COUNTRY_COORDS` from `src/frontend/lib/country-coords.ts` into `geo_locations` (as country-level records).
- [ ] **Task 3: Create Geo API Router**
  - Create `src/backend/api/routes/geo.ts` exposing `GET /api/geo/locations` (with `includeMetrics` support) and `GET /api/geo/locations/:id`.
  - Wire it into the main Hono app.

### Checkpoint: Core API
- [ ] `POST /api/pipeline/seed-salary-refactor/col-index` successfully populates tables.
- [ ] `GET /api/geo/locations` returns both metros and countries with coordinates.

### Phase 3: Refactoring Consumers (Backend & Frontend)
- [ ] **Task 4: Update Aggregate Benchmarks**
  - Modify `src/backend/services/salary/benchmarks/aggregate/geo-premium-deltas.ts` to join `geo_locations` and `geo_location_mappings` instead of `cost_of_living_index`.
- [ ] **Task 5: Refactor Role Insights**
  - Update `src/backend/services/role-insights.ts` to query the new EAV tables when performing geographic positioning analysis.
- [ ] **Task 6: Refactor OpenRoute Geocoding**
  - Update `src/backend/services/openroute.ts` to query `geo_locations` for coordinates (matching by city/metro/country name) before calling the external Pelias API.
- [ ] **Task 7: Refactor Frontend Maps & Deprecate Static Lib**
  - Update `src/frontend/components/freelance/FreelanceDashboard.tsx` to fetch country coordinates from `/api/geo/locations` on mount, rather than importing the static dictionary.
  - Delete `src/frontend/lib/country-coords.ts`.

### Checkpoint: Complete
- [ ] All benchmarks and AI pipelines execute without SQL errors.
- [ ] Freelance Dashboard successfully loads client hub map markers dynamically.
- [ ] TypeScript `pnpm run types` check passes cleanly.

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Query complexity on EAV | Med | Ensure proper indexes on `geo_id` and `meta_id` in mappings table. |
| Dashboard map loading delay | Low | Fetch geo data asynchronously on mount, map falls back to curated list if API fails. |

## Open Questions
- Do you want to explicitly run a data migration script to convert existing rows in `cost_of_living_index` to the new EAV tables, or can we just rely on running the updated seed script in production to populate the new tables from scratch?
- When updating `roles.metro` to point to the new `geo_locations` table, should we change the column to be a UUID Foreign Key (`geo_id`), or keep it as a string (`metro`) that joins on `geo_locations.metro` for simplicity in this phase?
