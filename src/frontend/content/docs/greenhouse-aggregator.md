# Greenhouse Aggregator (Pipeline A)

The **Greenhouse Aggregator (Pipeline A)** is the upstream discovery and synchronization system. Its primary role is to monitor external, massive listings of companies and job boards, ingest them, track their active statuses, and present them in a global directory for Human-in-the-Loop (HITL) promotion into the active scanning queue.

Rather than running expensive and continuous web crawls across arbitrary domains on the serverless edge, Pipeline A offloads bulk raw parsing to a decoupled **GitHub Actions workflow**. It then uses **Durable Object WebSockets** to broadcast real-time sync progress directly to the browser before updating the local SQLite database.

---

## High-Level Architecture

The aggregator follows a hybrid edge-and-CI architecture that splits concerns between edge storage, Edge compute, and heavy runner parsing:

```
┌─────────────────────────────────┐
│     Pipeline Dashboard (UI)     │
│   (WebSocket Connection via)    │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐       Trigger Sync       ┌───────────────────────────────────┐
│       SyncBroadcastAgent        │ ───────────────────────> │          GitHub Actions           │
│   (Durable Object Singleton)    │                          │          (Sync Upstream)          │
└────────────────┬────────────────┘                          └─────────────────┬─────────────────┘
                 ▲                                                             │
                 │ Send Progress Update (POST /sync-progress)                  │
                 └─────────────────────────────────────────────────────────────┼─ Sync Completed
                                                                               ▼  (POST /sync)
                                                             ┌───────────────────────────────────┐
                                                             │      D1 SQLite Database (Drizzle) │
                                                             │     - Updates api_companies table │
                                                             └───────────────────────────────────┘
```

### Flow Lifecycle

1. **Triggering**: The user clicks **Trigger Sync** on the Pipeline Operations dashboard.
2. **Dispatching**: The Hono backend uses a GitHub Personal Access Token to invoke a `repository_dispatch` event on the target repository (`jmbish04/core-resumes` / `GITHUB_DISPATCH_REPO`).
3. **Execution**: A GitHub Action runner spins up and executes the synchronization script (`sync-upstream.py`).
4. **WebSocket Progress Fanning**: As the python script parses upstream assets, it sends HTTPS POST requests back to the Worker (`/api/pipeline/api-companies/sync-progress`). The Worker forwards the payloads to the **Durable Object (`SyncBroadcastAgent`)** which pushes them out over WebSockets to any active dashboard UI clients, showing live progress bars.
5. **Database Syncing**: Once finished, the GitHub Action posts the complete list of discovered board tokens to `/api/pipeline/api-companies/sync`. The database updates records in `api_companies`, recording deactivated, reactivated, and newly discovered tokens, and logging the run history in `api_company_sync_stats`.

---

## Data Model

Pipeline A uses two core tables under the `jobs` domain in D1 to manage upstream metadata and track sync history.

### Core Tables

#### 1. `api_companies`
Tracks all discovered job boards found upstream. Each board represents a company that *could* be promoted to the active Greenhouse boards list.

| Column | Drizzle Property | Type | Nullable | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `INTEGER` | No | Auto-incrementing primary key. |
| `name` | `name` | `TEXT` | Yes | Display name of the company if known. |
| `job_board_token` | `jobBoardToken` | `TEXT` | No | Unique ATS board token (e.g. `cloudflare`, `stripe`). |
| `system` | `system` | `TEXT` | No | The applicant tracking system (e.g., `greenhouse`, `lever`). |
| `source` | `source` | `TEXT` | No | Path to the source JSON file in the upstream aggregator repo. |
| `timestamp_added` | `timestampAdded` | `INTEGER` | No | When this board token was first discovered and indexed. |
| `timestamp_inactive`| `timestampInactive`| `INTEGER` | Yes | When this company was last detected as removed from upstream. |
| `is_active` | `isActive` | `INTEGER` | No | True if the company was present in the last upstream sync. |

#### 2. `api_company_sync_stats`
Tracks the history and metrics of each aggregator sync run.

| Column | Drizzle Property | Type | Nullable | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `id` | `INTEGER` | No | Auto-incrementing primary key. |
| `run_timestamp` | `runTimestamp` | `INTEGER` | No | Timestamp when the sync run completed. |
| `files_processed` | `filesProcessed` | `INTEGER` | No | Count of files parsed from the upstream aggregator repo. |
| `companies_added` | `companiesAdded` | `INTEGER` | No | Total new company boards discovered during this run. |
| `companies_deactivated`| `companiesDeactivated`| `INTEGER`| No | Active boards marked inactive because they left upstream. |
| `companies_reactivated`| `companiesReactivated`| `INTEGER`| No | Inactive boards reactivated because they returned upstream. |
| `status` | `status` | `TEXT` | No | Outcome status (e.g., `success`, `failed`). |
| `error` | `error` | `TEXT` | Yes | Error message if the run failed. |

---

## HITL Promotion Workflow

Discovering thousands of board tokens is only useful if we can curate them. Pipeline A acts as a vetting filter, preventing Pipeline B from bloating with unwanted scans:

1. **Discovery View**: Discovered companies list under the **Config → Promote Companies** tab.
2. **Filtering**: Users can search by keyword or filter by source to find target companies.
3. **Promotion**: Promoting a company transfers its metadata and config from `api_companies` directly into the official `board_tokens` table.
4. **Activation**: Upon promotion, the board token has its `is_active` status set to `true`, instantly making it visible to Pipeline B (Tracker) for scanning on the very next cron cycle.

---

## API Reference

These endpoints compose the aggregator's sub-router under `/api/pipeline`:

### `POST` `/api/pipeline/api-companies/trigger-sync`
Triggers the GitHub repository dispatch to start a new upstream aggregator run.
- **Headers**: Requires a valid session token.
- **Return**: `{ success: true }` or a 500 error if `GITHUB_PERSONAL_ACCESS_TOKEN` is missing.

### `POST` `/api/pipeline/api-companies/sync-progress`
Receives live execution progress from the running GitHub Action script.
- **Body**:
  ```json
  {
    "status": "in_progress",
    "message": "Parsing greenhouse/company-list.json...",
    "current": 4,
    "total": 12
  }
  ```
- **Fanning**: Automatically relays these variables to the `SyncBroadcastAgent` Durable Object to broadcast them over WebSockets.

### `POST` `/api/pipeline/api-companies/sync`
Consumes the complete, completed list of boards from the GitHub action.
- **Logic**: Deduplicates, updates active/inactive listings, inserts new entries into D1, and commits stats to `api_company_sync_stats`.

### `GET` `/api/pipeline/api-companies/sync-stats`
Fetches a list of the 50 most recent sync runs for the execution table.

---

## Key Files & Modules

- **API Sub-Router**: [api-companies.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/pipeline/api-companies.ts) - Composes routes for dispatching syncs, consuming results, and broadcasting progress.
- **Sync Stats Schema**: [api-company-sync-stats.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/jobs/api-company-sync-stats.ts) - D1 table schema mapping.
- **Discovered Boards Schema**: [api-companies.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/jobs/api-companies.ts) - Aggregator results D1 table.
- **Broadcasting Agent**: [sync-broadcast/index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/sync-broadcast/index.ts) - Durable Object managing WebSockets.
- **Dashboard Component**: [PipelineOperations.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/pipeline/PipelineOperations.tsx) - Renders run tables and sync dispatch buttons.
- **Promote Tab UI**: [PromoteCompaniesEditor.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/config/PromoteCompaniesEditor.tsx) - Manages HITL promotion and sorting controls.
