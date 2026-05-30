# Comprehensive Health Diagnostic System for Greenhouse & Freelance Pipelines

This implementation plan outlines the design and integration of a comprehensive, modular health diagnostic system covering both the core Greenhouse job discovery pipeline and the freelance scanning/bidding pipeline. 

It implements structural schema checks, data quality validation, cross-table relational sanity checks, scan run success analytics, and anomaly/skew warning thresholds.

---

## User Review Required

> [!NOTE]
> All newly introduced freelance health checks will execute dynamically as part of the scheduled or manual health screening pipeline.
> They are fully decoupled and designed defensively with `try-catch` wrappers to prevent any database or network failures from crashing the main application flow.

---

## Proposed Changes

### Database Schemas / Types

#### [MODIFY] [types.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/health/types.ts)
- Extend `HealthCategory` type definition to include the `"freelance"` category:
  ```typescript
  export type HealthCategory =
    | "database"
    | "ai"
    | "providers"
    | "agents"
    | "google"
    | "binding"
    | "auth"
    | "api"
    | "greenhouse"
    | "freelance"
    | "custom";
  ```

---

### Freelance Health Check Modules

#### [NEW] [freelance-schema-integrity.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/health/checks/freelance-schema-integrity.ts)
Create a new health step to enforce physical table schemas and reference integrity:
- Define `EXPECTED_TABLES` mapping each of the 5 freelance tables to its expected minimum column count:
  - `freelance_opportunities`: expected 46 columns, minimum 30.
  - `freelance_triage`: expected 15 columns, minimum 10.
  - `freelance_proposals`: expected 15 columns, minimum 10.
  - `freelance_scan_runs`: expected 12 columns, minimum 8.
  - `freelance_profile`: expected 4 columns, minimum 3.
- Query `sqlite_master` to ensure all 5 tables exist.
- Loop and execute `PRAGMA table_info` to verify column counts and catch failed migrations/schema drift.
- Spot-check foreign key and relation constraints:
  - Orphaned triage items mapping to missing opportunities.
  - Orphaned proposals mapping to missing opportunities.
- Spot-check critical indexes (e.g. `freelance_opportunities_platform_active_idx`).

#### [NEW] [freelance-data-quality.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/health/checks/freelance-data-quality.ts)
Create a new health step assessing semantic consistency, freshness, and anomalies:
- Check row counts for all 5 tables to monitor pipeline activity.
- **Triage Completeness**:
  - Calculate `triageCoveragePct`: `%` of opportunities that have a corresponding triage decision in `freelance_triage`.
  - Issue warning if coverage is < 50% and total records > 10 (indicates triage agent latency).
- **Proposals Coverage**:
  - Calculate `proposalDraftRatePct`: `%` of `bid` verdicts that have a corresponding draft in `freelance_proposals`.
- **Scan Run Success Analytics**:
  - Fetch recent runs from `freelance_scan_runs` to compute the scan success rate (completed vs failed).
  - Issue warning if failure rate is > 20% on recent runs.
- **Freshness & Scheduling Sanity**:
  - Check the timestamp of the last successful `freelance_scan_runs` entry.
  - Issue warning if no successful scan runs have completed in the last 24 hours (indicates worker scheduler or crawler blockage).
- **Logical & Mathematical Constraints**:
  - Detect invalid budget bounds (e.g. `budget_min > budget_max` where both exist).
  - Detect out-of-bounds client scores (e.g. `client_score < 0.0` or `client_score > 5.0`).
- **Verdict/Decision Skew Warning**:
  - Track distributions of triage decisions (`bid`, `skip`, `pending`, `manual_review`).
  - Warn if >95% of verdicts are skewed (e.g. 100% skipped on a large sample, which suggests broken AI parsing).

---

### Coordinator Integration

#### [MODIFY] [index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/health/index.ts)
- Import the new `checkFreelanceSchemaIntegrity` and `checkFreelanceDataQuality` modules.
- Register them under the `HealthCoordinator` registry list inside the `"freelance"` category.

---

## Verification Plan

### Automated Tests
- Build verification: Run typescript compile check `pnpm exec tsc --noEmit` with homebrew path configurations.
- Verify server bundle: Build the production bundle successfully.

### Manual Verification
- Trigger health check manually via the health endpoint (`POST /api/health/run`) and verify in the returned JSON response that both `freelance_schema_integrity` and `freelance_data_quality` execute successfully.
- Assert that details are fully populated, latency metrics are measured, and the overall status resolves correctly.
