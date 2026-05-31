# Centralized Geo & EAV Data Architecture

The current implementation relies on string-based `metro` names (e.g., "San Francisco, CA") spread across `roles`, `cost_of_living_index`, and hardcoded constants in seeding scripts. This plan introduces a strict Entity-Attribute-Value (EAV) schema to standardize how we track geographic areas and associate diverse metrics (like Cost of Living index, remote discount indices, etc.) with those areas.

## User Review Required

> [!WARNING]
> This requires introducing 3 new tables and will eventually deprecate the existing `cost_of_living_index` table. I will need to generate a new D1 migration for these tables.

> [!IMPORTANT]
> The seed scripts in `seed-salary-refactor.ts` will be updated to write to the new `geo_locations` and EAV tables. Should we perform a data migration for existing rows in `cost_of_living_index`, or is it safe to just rely on the updated seed script to populate the new tables from scratch?

## Open Questions

1. **Foreign Key Relations:** Should `roles.metro` and `marketCompanySalaries.metro` be migrated to reference `geo_locations.id` directly as a foreign key, or should we keep the string-based name mapping for now and migrate relations in a later phase?
2. **Value Types in Mappings:** The EAV `value` column will store mixed data types (e.g., floats for COL indices, potentially strings or JSON for others). Does a `TEXT` column (JSON parsing) or a `REAL` column suit your planned metrics better? I propose a `REAL` column for numeric values and `TEXT` for string/JSON if needed, or simply stringified JSON for everything.

## Proposed Changes

### Database Schemas
#### [NEW] [geo-locations.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/geo/geo-locations.ts)
- `id` (PK, UUID)
- `country` (TEXT)
- `region` (TEXT) // e.g., state or province
- `city` (TEXT)
- `zip` (TEXT)
- `metro` (TEXT, unique) // The canonical name, e.g., "San Francisco, CA"
- `lat` (REAL)
- `lng` (REAL)
- `created_at`, `updated_at` (INTEGER timestamps)

#### [NEW] [geo-location-meta-definitions.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/geo/geo-location-meta-definitions.ts)
- `id` (PK, UUID)
- `name` (TEXT, unique) // e.g., "cost_of_living_index"
- `description` (TEXT)
- `created_at`, `updated_at`

#### [NEW] [geo-location-mappings.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/geo/geo-location-mappings.ts)
- `id` (PK, UUID)
- `geo_id` (FK to `geo_locations.id`)
- `meta_id` (FK to `geo_location_meta_definitions.id`)
- `value` (TEXT, stores JSON or stringified numbers)
- `created_at`, `updated_at`

### API Routes
#### [NEW] [geo.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/geo.ts)
Create a new router mapped to `/api/geo` exposing:
- `GET /api/geo/locations` - Lists locations. Supports query params `?country=US&region=CA` and optionally `?includeMetrics=true` (joins EAV to return all data points).
- `GET /api/geo/locations/:id` - Returns a specific location with all associated mappings.

### Seeding & Refactoring
#### [MODIFY] [seed-salary-refactor.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/pipeline/seed-salary-refactor.ts)
Update the `seedColIndex` route. It will now:
1. Upsert the listed metros into `geo_locations`.
2. Upsert the "cost_of_living_index" definition into `geo_location_meta_definitions`.
3. Upsert the `1.34`, `1.29` values into `geo_location_mappings`.

## Verification Plan

### Automated Tests
- Run `pnpm run db:generate` to verify drizzle schema generation works cleanly.
- TypeScript `pnpm run types` check to verify schema exports.

### Manual Verification
- Hit `POST /api/pipeline/seed-salary-refactor/col-index` to seed the new tables.
- Hit `GET /api/geo/locations?includeMetrics=true` to verify that the EAV mappings are correctly joined and returned alongside the location records.
