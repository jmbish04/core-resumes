# Upwork RapidAPI Integration Update

This plan updates the Upwork freelance scanner in the `core-resumes` Worker to use the new `upwork-scraping-api.p.rapidapi.com` RapidAPI endpoints, replacing the obsolete GET-based API with the new POST-based scraping API.

---

## Proposed Changes

### Configuration Updates

#### [MODIFY] [wrangler.jsonc](file:///Volumes/Projects/workers/core-resumes/wrangler.jsonc)
- Change `"RAPIDAPI_HOST_UPWORK"` variable from `"upwork-jobs-api3.p.rapidapi.com"` to `"upwork-scraping-api.p.rapidapi.com"`.

---

### Service Layer (RapidAPI Client)

#### [MODIFY] [rapidapi-client.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/jobs/freelance/rapidapi-client.ts)

1. **Type Definitions:**
   - Update `UpworkJob` interface to represent the simpler schema returned by the new API:
     ```typescript
     export interface UpworkJob {
       id: string;
       type: "fixed" | "hourly";
       title: string;
       created_at: string;
       time: string;
       info: string;
       description: string;
       skills: string; // Comma-separated string
       url: string;
     }
     ```

2. **Search Method (`searchUpwork`):**
   - Refactor `searchUpwork` to issue a `POST` request to `https://${RAPIDAPI_HOST_UPWORK}/upwork/search-jobs` instead of a `GET` request.
   - Form the JSON request payload matching the user's requirements:
     - `query`: uses `params.q || params.skills` fallback.
     - `type`: uses `params.budget_type || "hourly, fixed"`.
     - `sort`: default to `"recency"`.
     - `difficulty`: uses `params.experience_level || "entry, intermediate, expert"`.
     - `duration`: default `"less_than_1_month, 1_to_3_months, 3_to_6_months, more_than_6_months"`.
     - `hours_per_week`: default `"less_than_30, more_than_30"`.
     - `client_hires`: default `"0, 1-9, 10+"`.
     - `client_location`: default `"United States"` or `params.location`.
     - `min_hourly_rate` / `max_hourly_rate`: populated from budget limits.
     - `min_fixed_budget` / `max_fixed_budget`: populated from fixed budget limits.
   - Update `fetchWithRetry` to accept an optional `method` (defaults to `"GET"`) and `body` payload (JSON serialized).
   - In `fetchWithRetry`'s response parsing, transform the new response schema (`{ response: [...] }`) to the standard `ApiResponse<UpworkJob>` format (`{ data: [...], next_cursor: null, meta: ... }`) so the scanner logic is completely insulated from the response envelope change.

3. **Normalization Method (`normalizeUpwork`):**
   - Update `normalizeUpwork` to extract database values from the new `UpworkJob` structure:
     - `platformJobId` maps from `id`
     - `skillsJson` parses by splitting the comma-separated `skills` string
     - `publishedAt` parses `created_at`
     - Parse `info` (e.g. `"$10,000 (Fixed Price)"` or `"$33.0-$69.0/hr"`) to extract both `budgetMin` and `budgetMax` dynamically using a robust regex.
     - Set remaining unprovided metadata fields (e.g. `clientScore`, `proposalsCount`) to `null`.

---

### Agent Layer (Scanner Health Check)

#### [MODIFY] [health.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/job/freelance-scanner/health.ts)
- Update the connectivity health check for the Upwork scanner to make a lightweight `POST` request to `https://${env.RAPIDAPI_HOST_UPWORK}/upwork/search-jobs` (with header `Content-Type: application/json` and simple test payload `{ query: "test", limit: 1 }`).

---

## Verification Plan

### Automated Tests
- Run `pnpm exec tsc --noEmit` to verify all types and imports align correctly.
- Run `pnpm run build` to verify production compilation.
- Run `pnpm run cf-typegen` to update `worker-configuration.d.ts` after the `wrangler.jsonc` update.

### Manual Verification
- Trigger the freelance scanner health check via Hono or command execution, confirming the connection to the new host is fully verified.
- Run a manual search scan to verify job listings are fetched, parsed, normalized, and inserted successfully into the SQLite D1 database.
