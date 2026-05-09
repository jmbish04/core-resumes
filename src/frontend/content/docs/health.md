# Health Diagnostics

The Career Orchestrator runs a comprehensive suite of health checks to validate all infrastructure bindings, AI services, external integrations, and pipeline integrity. Health screenings are persisted to D1 for historical tracking.

## Trigger Modes

Health checks can be triggered in three ways:

| Mode          | Trigger                                           | NotebookLM Check                          | Use When                          |
| ------------- | ------------------------------------------------- | ----------------------------------------- | --------------------------------- |
| **Scheduled** | Cron (`0 */4 * * *`)                              | Passive (credential check only)           | Automated background monitoring   |
| **Manual**    | `POST /api/health/run` or Health Dashboard button | **Live query** (full SDK connect + query) | Verifying end-to-end connectivity |
| **Agent**     | OrchestratorAgent RPC                             | **Live query**                            | Agent-initiated diagnostics       |

> **Important:** The scheduled cron **never** makes outbound requests to `notebooklm.google.com`. The SDK's `connect()` call fetches the live NotebookLM page from a Cloudflare Worker edge IP, which causes Google to detect the non-browser access pattern and shorten session lifetime from ~30 days to ~1 hour. Only manual and agent triggers perform live queries.

## Health Check Registry

All checks run in parallel with per-check timeout limits. Results are persisted to the `health_runs` and `health_results` D1 tables.

### Database

| Check Name      | Timeout | Description                                                                                            | Source File                                  |
| --------------- | ------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| `d1_roundtrip`  | 30s     | Inserts and reads a test row in D1 to validate database connectivity.                                  | `src/backend/db/health.ts`                   |
| `kv_read`       | 30s     | Writes and reads a test key in KV to validate the namespace binding.                                   | `src/backend/db/health.ts`                   |
| `d1_table_scan` | 30s     | Queries `sqlite_master` to verify all expected Drizzle tables exist in D1. Reports any missing tables. | `src/backend/health/checks/d1-table-scan.ts` |

### AI

| Check Name             | Timeout | Description                                                                                                                                | Source File                          |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| `workers_ai_embedding` | 30s     | Runs a test embedding via `@cf/baai/bge-large-en-v1.5` through AI Gateway to validate the Workers AI binding.                              | `src/backend/ai/workersai/health.ts` |
| `ai_gateway`           | 30s     | Makes a direct REST call to the AI Gateway API endpoint to verify the gateway is reachable and the token is valid.                         | `src/backend/ai/workersai/health.ts` |
| `tts_deepgram`         | 30s     | Sends a short text to `@cf/deepgram/aura-2-en` and validates that audio bytes are returned.                                                | `src/backend/health/checks/tts.ts`   |
| `stt_whisper`          | 30s     | Sends a synthetic silent audio buffer to Whisper (`@cf/openai/whisper-large-v3-turbo`) and validates the transcription response structure. | `src/backend/health/checks/stt.ts`   |

### Google

| Check Name               | Timeout | Description                                                                                                                                                             | Source File                             |
| ------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `google_drive_lifecycle` | 45s     | Full lifecycle test: creates a Google Doc via Service Account, verifies it exists, cleans up previous test docs. Validates the entire Google Drive auth + API pipeline. | `src/backend/ai/tools/google/health.ts` |

### Bindings

| Check Name          | Timeout | Description                                                                                                                                                                                              | Source File                             |
| ------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `platform_bindings` | 30s     | Verifies all expected Cloudflare platform bindings are present: `DB`, `KV`, `AI`, `BROWSER`, `R2_AUDIO_BUCKET`, `R2_FILES_BUCKET`, `VECTORIZE_CAREER_MEMORY`, `ASSETS`, and all Durable Object bindings. | `src/backend/health/checks/bindings.ts` |

### Providers / Credentials

| Check Name               | Timeout | Description                                                                                                                                             | Source File                                           |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `secrets_store`          | 30s     | Reads all Secrets Store bindings (`WORKER_API_KEY`, `GOOGLE_CREDS_SA_*`, `NOTEBOOKLM_AUTH_TOKEN`, etc.) and validates each returns a non-empty value.   | `src/backend/utils/health.ts`                         |
| `env_vars`               | 30s     | Checks that all required environment variables (`CAREER_NOTEBOOKLM_ID`, `AI_GATEWAY_ID`, `MODEL_CHAT`, `MODEL_EXTRACT`, etc.) are set.                  | `src/backend/utils/health.ts`                         |
| `notebooklm_credentials` | 30s     | Validates NotebookLM session cookie presence in KV or Worker Secret, checks `CAREER_NOTEBOOKLM_ID`, and verifies `NOTEBOOKLM_COOKIE_SIGNING_KEY` in KV. | `src/backend/health/checks/notebooklm-credentials.ts` |

### Agents

| Check Name             | Timeout | Description                                                                                                                                                | Source File                                      |
| ---------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `agent_orchestrator`   | 30s     | RPC call to the `OrchestratorAgent` Durable Object via `getAgentByName` + `healthProbe()`. Validates the DO is reachable and responding.                   | `src/backend/ai/agents/orchestrator/health.ts`   |
| `agent_notebooklm`     | 45s     | RPC call to the `NotebookLMAgent` Durable Object via `getAgentByName` + `healthProbe()`. Validates the DO is reachable. Does NOT call `consultNotebook()`. | `src/backend/ai/agents/notebooklm/health.ts`     |
| `agent_notebooklm_mcp` | 30s     | Validates MCP agent bindings (signing key, session presence). Does NOT make live SDK queries to preserve session lifetime.                                 | `src/backend/ai/agents/notebooklm-mcp/health.ts` |
| `agent_transcription`  | 30s     | RPC call to the `TranscriptionAgent` Durable Object via `getAgentByName` + `healthProbe()`. Validates the DO and container bindings.                       | `src/backend/ai/agents/transcription/health.ts`  |

### API / Pipeline

| Check Name            | Timeout | Description                                                                                                                                                                                                                                                                     | Source File                                        |
| --------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `intake_pipeline`     | 30s     | Fetches a known Greenhouse job URL using Browser Rendering, extracts markdown, and validates the extraction contains expected content. Tests the scrape layer of the role intake pipeline.                                                                                      | `src/backend/health/checks/intake-pipeline.ts`     |
| `extraction_fidelity` | 60s     | Multi-tier extraction test: runs Workers AI structured extraction, `/json` endpoint extraction, and HTML sidecar script extraction on a Greenhouse job. Compares bullet accuracy across all three tiers by matching structured bullets against raw `<li>` elements in the HTML. | `src/backend/health/checks/extraction-fidelity.ts` |
| `notebooklm_query`    | 30s/45s | **Dual-mode check.** Scheduled (cron): passive credential validation (cookie presence, structure, age). Manual/Agent: live test query through the full `consultNotebook()` pipeline. See [Trigger Modes](#trigger-modes).                                                       | `src/backend/health/checks/notebooklm-query.ts`    |
| `openroute_commute`   | 90s     | Geocodes a test address via HeiGIT, fetches driving directions (falls back to Google Maps Routes API on timeout), and runs the AI location insight analysis. Validates the full OpenRoute → Google Maps → LLM pipeline.                                                            | `src/backend/health/checks/openroute.ts`           |

## Architecture

### Coordinator

The `HealthCoordinator` class (`src/backend/health/index.ts`) orchestrates all checks:

1. Builds the check registry based on the trigger type
2. Runs all checks in parallel with per-check timeout wrappers
3. Aggregates results into an overall status (`healthy`, `degraded`, `unhealthy`)
4. Persists results to D1 (`health_runs` + `health_results` tables)

### Status Aggregation

| Condition                    | Overall Status |
| ---------------------------- | -------------- |
| All checks pass              | `healthy`      |
| 1-3 failures OR any warnings | `degraded`     |
| 4+ failures                  | `unhealthy`    |

### Timeout Overrides

Some checks have custom timeout limits:

| Check                            | Default | Override |
| -------------------------------- | ------- | -------- |
| `agent_notebooklm`               | 30s     | 45s      |
| `google_drive_lifecycle`         | 30s     | 45s      |
| `extraction_fidelity`            | 30s     | 120s     |
| `openroute_commute`              | 30s     | 90s      |
| `notebooklm_query` (manual only) | 30s     | 45s      |

### Persistence

Every screening creates:

- **`health_runs`** — One row per run with overall status, trigger type, duration, and metadata (check count, skip count, fail count).
- **`health_results`** — One row per check with individual status, duration, error message, structured details, and AI suggestion.

## API Endpoints

| Method | Path                 | Description                                              |
| ------ | -------------------- | -------------------------------------------------------- |
| `POST` | `/api/health/run`    | Trigger a manual health screening. Returns full results. |
| `GET`  | `/api/health/latest` | Retrieve the most recent screening results.              |

## Frontend

The Health Dashboard (`/health`) displays:

- Real-time screening results grouped by category
- Status badges with color coding (green/yellow/red)
- Per-check duration and error details
- AI-generated fix suggestions
- Historical run timeline

## Key Files

- `src/backend/health/index.ts` — `HealthCoordinator` class and check registry
- `src/backend/health/types.ts` — Type definitions for all health-related interfaces
- `src/backend/health/checks/` — Standalone check modules
- `src/backend/db/health.ts` — D1 and KV check modules
- `src/backend/ai/workersai/health.ts` — Workers AI and AI Gateway checks
- `src/backend/ai/tools/google/health.ts` — Google Drive lifecycle check
- `src/backend/ai/agents/*/health.ts` — Agent-level health probes
- `src/backend/utils/health.ts` — Secrets Store and env var checks
- `src/backend/db/schemas/health-runs.ts` — `health_runs` table schema
- `src/backend/db/schemas/health-results.ts` — `health_results` table schema
