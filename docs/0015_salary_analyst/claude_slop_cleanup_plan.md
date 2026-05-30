# Salary Analyst Refactor — Close the Laziness / Hallucination Gaps

## Context

An agent implemented `docs/0015_salary_analyst/implementation_plan.md` (the SalaryAgent
refactor: drop the Python sandbox, adopt a deterministic SQL benchmark battery + leverage
scorer + 3-mode agent). The scaffolding landed (schema migration 0041, API routes under
`src/backend/api/routes/pipeline/salary/`, agent index, modes, prompts, sql-tool), but the
agent took large shortcuts and left the core logic either stubbed or **written against a
schema that does not exist**. As shipped, the feature does not work end-to-end.

This plan identifies every gap and fixes them so the battery, leverage scorer, aggregate
insights, and chat mode actually run against the real D1 schema.

## Findings (what's actually broken)

### A. Hard stubs that return canned data

1. **`modes/chat.ts`** — returns the literal string `"Chat response stream"`. Never calls
   the model, never uses `CHAT_SYSTEM_PROMPT` (which is a *function*, imported as if a
   string), no tools, no streaming. This is the consumer path for `consultSalaryAgent` in
   `src/backend/ai/agents/chat/index.ts:348` → entirely non-functional.
2. **8 of 10 single-role benchmarks are pure stubs** returning `insufficient_data` /
   `"Stub implementation."`:
   `vs-peer-companies.ts`, `vs-same-role-same-company.ts`, `vs-cross-market.ts`,
   `vs-adjacent-levels.ts`, `vs-yoe-band.ts`, `vs-offer-range-position.ts`,
   `variance-check.ts`, `recency-check.ts`.
   Only `vs-google-anchor.ts` and `vs-company-trend.ts` contain real logic.

### B. The "implemented" benchmarks are written against a non-existent schema

Actual SQL table names are snake_case (`src/backend/db/schemas/applications/salary-stats.ts`):
`market_salary_snapshots`, `market_salary_stats`, `market_company_salaries`. The benchmark
raw SQL uses Drizzle JS identifiers (`marketCompanySalaries`, `marketSalarySnapshots`,
`marketSalaryStats`) → **every query throws "no such table" at runtime**. Affected:
`vs-company-trend.ts` and all 5 aggregate benchmarks under `benchmarks/aggregate/`.

Worse, the column references are invented:
- `market_company_salaries` has **`p25`, `median`, `p75`, `seniority`, `sample_size`** —
  it has **no `salary_min`/`salary_max`, no `metro`, no `role_id`**. Yet `vs-company-trend`,
  `geo-premium-deltas`, `remote-discount-index` query `AVG(salary_min + salary_max)/2` and
  `m.metro`, and `role-demand-heat` joins `c.role_id = t.role_id`.
- `market_salary_stats` has **`median`** (not `p50_salary`) and `metric_key`
  (`remote | local_market | top_hubs | national`) — yet `industry-comp-trends` and
  `pivot-trajectory` query `m.p50_salary`.
- `market_salary_snapshots` has **`run_timestamp`** (not `snapshot_date`) — yet many
  queries `ORDER BY s.snapshot_date`.
- `cost_of_living_index` column is **`col_index`** — yet `geo-premium-deltas` queries
  `col.index_value`.
- `role_family_taxonomy` PK is **`raw_title`** (no `role_id`) — yet `role-demand-heat`
  joins on `role_id`.

The cross-market / geo / remote-discount data actually lives in `market_salary_stats`
via `metric_key` (`remote` vs `local_market`/`top_hubs`), **not** in a metro column on
company salaries. The agent invented a geo model the schema doesn't have.

### C. Runtime crash in single-role mode

`modes/single-role.ts:63` uses `require("zod")` inside an ESM Worker — `require` is not
defined in the Workers runtime → throws. The provider call should use the standard
`import { z } from "zod"` (the rest of the codebase, e.g. `seed-salary-refactor.ts`, does).

### D. Seed / data gaps (battery has nothing to compare against)

Seeds exist only as **manually-triggered POST endpoints** in
`src/backend/api/routes/pipeline/seed-salary-refactor.ts` and are never run:
- `baseline_anchor_salary` is seeded only via `/assumptions` — until run, even
  `vs-google-anchor` returns `insufficient_data`.
- **`roles-metro` backfill is destructive and lazy**: it runs
  `UPDATE roles SET metro = NULL WHERE 1=1`, with a comment claiming "there's no location
  column." But `roles` has `geo_id` → `geo_locations` (`roles.ts:96`). The backfill should
  derive metro from the geo join, not null every row. As written, all cross-market/geo
  features have zero data even after seeding.

### E. Other shortcuts

- `leverage-scorer.ts` only inspects `status` (`below`/`above`), ignoring `confidence` and
  benchmark weighting that the spec's leverage rules require (e.g. "strong if < p50 of peers
  *with high confidence*"). Low-confidence findings count the same as high-confidence ones.
- `health.ts` (salary agent) only checks two tables exist; the plan (Phase 12) asked for a
  `querySalaryData` `SELECT 1` smoke test + battery smoke test. Minor.
- `pivot-trajectory.ts` hardcodes 3%/6% growth and ignores `career_model_assumptions` /
  the comp-ladder approach the plan specified. Functional but not as designed.
- No unit tests exist for the benchmarks / leverage scorer (plan Phase 3/4 required them);
  only `sql-tool.test.ts` is present.

## Proposed fixes

### 1. Fix the SQL schema mismatches (correctness blocker) — do first
Rewrite every raw-SQL benchmark to use real table + column names. Two viable routes per file:
- Prefer **Drizzle query builder** with imported schema objects (compile-time safety,
  matches `single-role.ts`/`seed-salary-refactor.ts` style), OR
- keep raw SQL but correct to snake_case names and real columns.
Files: `benchmarks/vs-company-trend.ts`, `benchmarks/aggregate/{industry-comp-trends,
role-demand-heat,pivot-trajectory,geo-premium-deltas,remote-discount-index}.ts`.
Re-map the geo/remote concepts onto `market_salary_stats.metric_key` instead of the
non-existent `metro`/`salary_min`/`salary_max` columns.

### 2. Implement the 8 stubbed single-role benchmarks
Each `(db, input) => Promise<Finding>` against real columns:
- `vs-same-role-same-company` → `market_company_salaries` filtered by `company_name` +
  `job_title`/`seniority`, compare offer midpoint vs `p25/median/p75`.
- `vs-peer-companies` → join `company_segments` to find same-segment peers, same role
  family via `role_family_taxonomy`, percentile position.
- `vs-adjacent-levels` → `seniority` one step up/down.
- `vs-yoe-band` / `vs-cross-market` → `market_salary_stats` by `role_type`/`metric_key`.
- `vs-offer-range-position` → pure math on `salaryMin/Max` vs market median (no canned `at`).
- `variance-check` → p25–p75 spread → confidence.
- `recency-check` → latest `run_timestamp` for the snapshot.
Honor the 4 status outcomes (`below`/`at`/`above`/`insufficient_data`) with real magnitudes.

### 3. Implement `modes/chat.ts` properly
Call `CHAT_SYSTEM_PROMPT(contextMode, contextData)` as the function it is; stream via the
AI SDK data-stream protocol expected by assistant-ui; wire the `query_salary_data`
(sql-tool) and `run_benchmark_battery` tools the prompt advertises. Match the consumer in
`ai/agents/chat/index.ts` and the existing assistant-ui pattern used elsewhere in the repo.

### 4. Fix `single-role.ts` `require("zod")` → `import { z } from "zod"`.

### 5. Do metro the right way — resolve via the existing geo FK, drop the redundant column
(Confirmed scope: `roles.metro` should be a real FK into a D1 table, not free text.)

`geo_locations` (`src/backend/db/schemas/geo/geo-locations.ts`) is already the single source
of truth: `id` PK, `type='metro'` records, a **unique `metro`** column, and `roles.geo_id`
already FKs into it. The refactor's `roles.metro` TEXT column is therefore redundant and the
`WHERE 1=1` backfill that nulls it is both destructive and unnecessary.

Plan:
- **Drop the redundant `roles.metro` TEXT column** (migration 0041 added it). Resolve a
  role's metro through `roles.geo_id → geo_locations.metro`. The "FK to a D1 table" is the
  already-present `geo_id`.
- **Re-key `cost_of_living_index` to the geo table**: add `geo_id INTEGER` FK →
  `geo_locations(id)` (keep `metro` text as a human-readable mirror, or make `geo_id` the
  join key). Benchmarks then join COL via geo, not a fragile string match.
- **Seed COL against real metro records**: the `/col-index` seed should upsert
  `geo_locations` (`type='metro'`) rows for each metro and link COL rows by `geo_id`, so the
  data is normalized best-practice rather than free text.
- **Delete the `/seed-salary-refactor/roles-metro` no-op backfill** (or replace it with a
  geo-resolution helper). `BenchmarkInput.metro`/geo is populated in `single-role.ts` from
  the `geo_id → geo_locations` join.

### 6. Strengthen `leverage-scorer.ts`
Weight by `confidence` (discount/ignore low-confidence findings) per the spec's rules.

### 7. Tests + health smoke test (in scope — end-to-end confirmed)
Add Vitest coverage for the rewritten benchmarks (all 4 status outcomes each) + leverage
scorer (strong/moderate/weak/insufficient_data); upgrade salary `health.ts` to a
`querySalaryData('SELECT 1')` probe + battery smoke test per plan Phase 12.

## Verification
- `pnpm run db:generate` — produces a clean migration for dropping `roles.metro` and adding
  `cost_of_living_index.geo_id`. Apply via the project's `migrate:remote`/dev workflow.
- `pnpm run build` (typecheck) — catches the `require`/schema-identifier errors.
- `pnpm test` — sql-tool security tests + new benchmark/leverage tests.
- Run the seed endpoints (`/seed-salary-refactor/*`) against a dev DB, then
  `POST /api/pipeline/salary/analyze/role/:id` and confirm non-`insufficient_data` findings.
- Exercise `consultSalaryAgent` (chat) and confirm a real streamed answer, not the literal
  `"Chat response stream"`.
- Confirm no raw query references `marketCompanySalaries`/`p50_salary`/`snapshot_date`/
  `index_value`/`salary_min` on company salaries remain (grep).