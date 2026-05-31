# Companies & Pipeline Refactor

This refactor will introduce job board definitions, map them to promoted companies, and create a unified human-in-the-loop (HITL) triage UI for jobs scraped from multiple pipelines (GitHub Dataset, Promoted Companies, and Freelance).

## User Review Required

> [!IMPORTANT]
> - **Schema Migrations**: We will need to run a Drizzle migration (`pnpm run db:generate` + `pnpm run db:migrate`) after defining the new tables.
> - **Data Backfill**: Existing `api_company` or `company` rows might need to be migrated to use the mapping tables, but we'll focus on ensuring new creations are fully compliant first.

## Proposed Changes

---

### Backend Schema Updates

#### [MODIFY] [companies.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/applications/companies.ts)
- Add `company_job_board_defs` table (A global dictionary of scrape-able surfaces):
  - `id`: text PK (UUID)
  - `name`: text (e.g. "Greenhouse", "Ashby", "Company Career Page")
  - `description`: text
  - `isApi`: boolean
  - `isRss`: boolean
  - `isActive`: boolean
- Add `company_job_board_mapping` table (Links a promoted company to a scrape strategy):
  - `id`: text PK (UUID)
  - `companyId`: text FK to `companies.id`
  - `boardId`: text FK to `company_job_board_defs.id`
  - `boardIdentifier`: text (This stores the specific endpoint to scrape: either the board token like "stripe", or the specific URL like "https://apple.com/careers")

#### [MODIFY] [jobs-postings.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/pipeline/jobs/jobs-postings.ts)
- Add `isRejected` (boolean, default false)
- Add `rejectReason` (text)
- Add `isWatching` (boolean, default false)
- Add `isDetectedChange` (boolean, default false)
- Add `pipelineSource` (text: enum `['github_dataset', 'promoted_company', 'freelance']`)
- Add `companyId` (text FK to `companies.id` for promoted companies, distinct from `sourceApiCompanyId` which links to `api_companies`)

---

### API Route Updates

#### [MODIFY] [companies.ts routes](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/companies.ts)
- Sort companies alphabetically on the `GET /` endpoint by applying `orderBy(asc(companies.name))`.
- Add sub-routes for fetching, creating, and listing job board mappings for a company.

#### [MODIFY] [promote.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/pipeline/promote.ts)
- When a company is promoted, insert into `company_job_board_defs` and `company_job_board_mapping` using its Greenhouse token, so it immediately possesses a valid job board configuration.

#### [MODIFY] [jobs.ts (or related pipeline api)](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/pipeline/jobs.ts)
- Create endpoints to handle the human-in-the-loop (HITL) actions:
  - `POST /api/pipeline/jobs/:id/reject`
  - `POST /api/pipeline/jobs/:id/watch`
- Expose an endpoint `GET /api/pipeline/jobs/queued` to list jobs filtered by `pipelineSource`, grouped by company, ensuring `isRejected=false` and handling `isWatching` logic.

---

### Frontend UI Updates

#### [MODIFY] [CompaniesPage.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/company/CompaniesPage.tsx)
- Ensure the data mapping logic sorts companies A-Z if not fully handled by the backend.

#### [MODIFY] [PipelinePage UI](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/pipeline/DiscoveryDashboard.tsx)
- Add a new tab structure for pipeline sources:
  1. Github Dataset scrape
  2. Promoted companies
- Adjust UI to show stats or queue status for each.

#### [MODIFY] [RolesPage UI](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/RolesTable.tsx)
- Add Tabs:
  1. **Processed** (current `RolesTable.tsx` behavior)
  2. **Companies scrape** (Grouped by promoted company)
  3. **Github data sync** (Grouped by GitHub dataset company)
- Inside the scrape tabs, implement action buttons:
  - **Promote**: Pre-fills the intake workflow modal with the job URL.
  - **Reject**: Opens a popover to enter a rejection reason -> updates `isRejected`.
  - **Watch**: Marks job as `isWatching`. 
- **Add HITL Modal**: A dedicated help modal explaining the Process/Reject/Watch flow.

---

### Documentation

#### [NEW] [docs/hitl-process.md](file:///Volumes/Projects/workers/core-resumes/src/frontend/content/docs/hitl-process.md)
- Write detailed frontend documentation describing the "Human In The Loop" (HITL) Pipeline flow, breaking down the 3 pipelines (GitHub, Promoted, Freelance), and detailing the roles of Process, Reject, and Watch.

## Verification Plan

### Automated Tests
- Run `pnpm run db:generate` and check for clean migration creation.
- Check TS compilation: `pnpm run cf-typegen` and no-emit.

### Manual Verification
- View `/companies` to ensure they are sorted A-Z.
- Promote a new company from the Discovery tab; check the DB to ensure `company_job_board_defs` and mappings were created.
- Check `/roles` and `/pipeline` tabs rendering properly.
- Open the HITL info modal and verify it clearly explains the mechanics.
- Perform a dummy "Reject" and "Watch" action to verify the database and UI update correctly.
