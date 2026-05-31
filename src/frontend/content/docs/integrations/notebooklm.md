---
title: "NotebookLM"
date_last_updated: "2026-05-31"
---

# NotebookLM

**Date Last Updated:** 2026-05-03

**NotebookLM** is the career knowledge base at the heart of the Career Orchestrator's AI intelligence layer. It stores your complete career profile — experience, skills, project history, and professional context — and is queried by agents whenever they need personalized career knowledge.

This integration is powered by the open-source [notebooklm-sdk](https://github.com/agmmnn/notebooklm-sdk) — an unofficial TypeScript/Node.js SDK that reverse-engineers the NotebookLM internal API.

## Notebook Details

The live notebook configuration is loaded below from the API:

## SDK Overview

The [notebooklm-sdk](https://github.com/agmmnn/notebooklm-sdk) provides a programmatic interface to Google NotebookLM. It supports:

- **Notebook management** — Create, list, and delete notebooks
- **Source management** — Add URLs, files, and text sources
- **Chat** — Ask questions against notebook sources with citation references
- **Artifact generation** — Generate podcasts, reports, slide decks, and more
- **Web research** — Run research queries and import results as sources

The SDK is unofficial and reverse-engineers the NotebookLM internal API. It may break when Google updates their service.

## Authentication

### How It Works

NotebookLM authentication uses **Google session cookies** — the same cookies your browser sends when you visit [notebooklm.google.com](https://notebooklm.google.com). The system uses these cookies to:

1. **Authenticate** the session with Google
2. **Discover the CSRF token** via Browser Rendering `/content` with a Chrome User-Agent
3. **Make API calls** using the authenticated session via the notebooklm-sdk

There is no OAuth flow or API key — authentication is cookie-based only.

### KV-Only Session Model

Session cookies are managed exclusively through Cloudflare KV by `getNotebookLMCookies()`:

| Key                         | Purpose          | Update Method                                              |
| --------------------------- | ---------------- | ---------------------------------------------------------- |
| `ACTIVE_NOTEBOOKLM_SESSION` | Session cookies  | Config → NotebookLM Session UI, or `pnpm run session:sync` |
| `NOTEBOOKLM_CSRF_CACHE`     | Cached CSRF auth | Auto-managed with sliding-window TTL (30 min idle expiry)  |

KV updates take effect immediately on the next request — no Worker redeployment needed.

### Additional Bindings

| Credential  | Storage | Binding                | Purpose                            |
| ----------- | ------- | ---------------------- | ---------------------------------- |
| Notebook ID | Env var | `CAREER_NOTEBOOKLM_ID` | Identifies which notebook to query |

### CSRF Token Discovery

The CSRF token (`SNlM0e`) and session ID (`FdrFJe`) are extracted from the NotebookLM page HTML using **Browser Rendering** `/content` endpoint with a real Chrome User-Agent string. This avoids the SDK's built-in bare `fetch()` which was detected by Google as non-browser traffic, causing session lifetime to drop from ~30 days to ~1 hour.

The extracted auth object is cached in KV (`NOTEBOOKLM_CSRF_CACHE`) with an **activity-based sliding window**: each active use refreshes the 30-minute TTL, while idle periods let it expire naturally so the next call re-fetches fresh.

### How Authentication Flows

```
1. Worker receives a chat/consult request
2. getNotebookLMCookies(env) reads KV ACTIVE_NOTEBOOKLM_SESSION
3. getOrFetchAuth() checks KV NOTEBOOKLM_CSRF_CACHE for cached auth
4. If cached and cookies match → use cached auth, refresh TTL (sliding window)
5. If cache miss → Browser Rendering /content fetches notebooklm.google.com:
   a. Cookies injected as browser cookies (not just headers)
   b. Chrome User-Agent string spoofed to avoid bot detection
   c. CSRF token and session ID extracted from rendered HTML
   d. Auth cached in KV with 30-minute TTL
6. NotebookLMClient constructed directly with pre-built auth (bypasses SDK connect())
7. client.chat.ask(notebookId, query) sends the query
8. If auth fails → CSRF cache invalidated → SessionExpiredError → 401
9. If successful → NotebookLM returns an answer with source references
```

## Obtaining Cookies

### Option A: Chrome Profile Sync (Recommended)

Use the local Chrome profile that is already signed into NotebookLM:

```
pnpm run session:sync
```

The sync script reads Chrome Profile 6 (`jmbish04`) directly from `~/Library/Application Support/Google/Chrome/Profile 6/Cookies`, decrypts the Google session cookies through macOS Keychain (`Chrome Safe Storage`), writes a `notebooklm-py` storage state to `~/.notebooklm/profiles/jmbish04/storage_state.json`, validates it with `notebooklm auth check --test`, and then pushes the Cookie header to KV.

The script does **not** relaunch Chrome and does **not** use Chrome DevTools Protocol. It reads the SQLite cookie database in read-only mode, so it can run while Chrome is open.

Useful flags:

```
pnpm run session:sync -- --validate-only
pnpm run session:sync -- --force-refresh
pnpm run session:sync -- --daemon --interval-min 60
pnpm run session:sync -- --profile-dir "Profile 6" --nlm-profile jmbish04
```

`--validate-only` is the safest smoke test: it decrypts cookies, writes `storage_state.json`, and runs the local NotebookLM auth check without touching the Worker.

### Option B: Chrome DevTools (Manual)

1. Open [notebooklm.google.com](https://notebooklm.google.com) in Chrome
2. Sign in with your Google account
3. Open **DevTools** (F12 or Cmd+Opt+I)
4. Go to the **Network** tab
5. Click on any request to `notebooklm.google.com`
6. In the request headers, find the **Cookie** header
7. Copy the **entire** Cookie header value

The cookie string will look something like:

```
SID=g.a000...; __Secure-1PSID=g.a000...; __Secure-3PSID=g.a000...; HSID=...; SSID=...; APISID=...; SAPISID=...; __Secure-1PAPISID=...; __Secure-3PAPISID=...; NID=...
```

**Important:** Copy the entire cookie string, including all individual cookie name=value pairs separated by semicolons.

## Updating Cookies

Session cookies expire periodically (typically every 30 days). When they expire, the Worker throws a `SessionExpiredError` and returns 401 responses with recovery instructions.

> **Important:** Browser Rendering CSRF fetch only occurs during explicit user actions (chat, resume drafts, etc.). Health checks and cron jobs use passive credential checks only. The sliding-window CSRF cache ensures that during active sessions, zero Browser Rendering overhead occurs.

### Preferred: KV Hot-Swap (Instant, No Redeploy)

**From Chrome Profile 6 (`jmbish04`):**

```
pnpm run session:sync
```

This first polls `POST /api/notebook/session/check` with the local `WORKER_API_KEY`. If the Worker session is healthy, the script exits without rewriting KV. If the active query check fails, or if you pass `--force-refresh`, it decrypts fresh cookies from Chrome, validates them locally with `notebooklm-py`, writes them to KV, and runs the active check again.

For long-running local supervision:

```
pnpm run session:sync -- --daemon --interval-min 60
```

Each daemon interval triggers a live NotebookLM check, so keep the interval conservative. Cron-style one-shot runs are preferred unless you specifically need a resident process.

### Frontend Config (Alternative)

Navigate to **Config → NotebookLM Session** in the dashboard and paste the full cookie string directly. This writes to KV instantly.

### When To Refresh

You'll know cookies need refreshing when:

- The **Health Dashboard** shows `notebooklm_query` as **fail** with a message like "Session cookies are expired"
- The **Notebook Chat** page returns a **401** with `error: "SESSION_EXPIRED"`
- The health check `notebooklm_credentials` shows `sessionSource: "none"`

### Health Checks

Two health checks monitor NotebookLM:

1. **notebooklm_credentials** — Verifies that session cookies exist in KV, that `CAREER_NOTEBOOKLM_ID` is set, and reports CSRF cache presence. Reports session source as `kv` or `none`.

2. **notebooklm_query** — Dual-mode check that adapts based on trigger:
   - **Scheduled (cron):** Passive credential validation — checks cookie presence, structure (essential Google session cookies like `SID`, `__Secure-1PSID`, `NID`), session age, and CSRF cache status. No outbound requests.
   - **Manual / Agent:** Full live query through the `consultNotebook()` pipeline to validate end-to-end connectivity. If this fails, cookies are likely expired.

> **Note:** The cron mode is intentionally passive to avoid triggering Browser Rendering CSRF fetches outside of user-initiated actions. To test live connectivity, use the Health Dashboard's manual run button.

## External API Management

For automated setups (like local Python services), two API endpoints allow headless management of the session. Both require the `x-api-key` header matching the `WORKER_API_KEY` secret.

### Active Health Check

`POST /api/notebook/session/check`

Triggers an active query to NotebookLM to verify if the cookies are still valid.

**Response:**

```json
{
  "ok": true, // false if auth is failing
  "status": "ok", // "fail" or "warn"
  "error": "NotebookLM returned an empty answer...", // present if ok is false
  "latencyMs": 1234
}
```

### Sync Session

`POST /api/notebook/session/sync`

Updates the session cookies in KV.

**Request Body:**

```json
{
  "cookies": "SID=...; __Secure-1PSID=..."
}
```

The local sync script uses both endpoints: `/session/check` decides whether refresh is needed, and `/session/sync` hot-swaps the decrypted Cookie header into KV only after local `notebooklm-py` validation passes.

## Local FastAPI Bridge

`scripts/notebooklm_fastapi_server.py` exposes `notebooklm-py` over HTTP for local services, Worker VPC callers, or a future Cloudflare Tunnel deployment.

Start it locally:

```
scripts/.venv/bin/python3 scripts/notebooklm_fastapi_server.py
```

By default it binds to `127.0.0.1:8770`. Configure with:

| Variable                        | Purpose                                                          | Default     |
| ------------------------------- | ---------------------------------------------------------------- | ----------- |
| `NOTEBOOKLM_FASTAPI_HOST`       | Bind host                                                        | `127.0.0.1` |
| `NOTEBOOKLM_FASTAPI_PORT`       | Bind port                                                        | `8770`      |
| `NOTEBOOKLM_FASTAPI_KEY`        | Optional API key for `x-api-key` or `Authorization: Bearer` auth | unset       |
| `NOTEBOOKLM_PROFILE`            | `notebooklm-py` profile / storage path name                      | `jmbish04`  |
| `NOTEBOOKLM_CHROME_PROFILE_DIR` | Chrome profile directory used for cookie refresh                 | `Profile 6` |

The bridge uses `~/.notebooklm/profiles/jmbish04/storage_state.json`. If it is missing, or if a NotebookLM call fails with an auth/session/cookie/CSRF-style error, the server decrypts fresh cookies from Chrome Profile 6 through `scripts/sync-cookies.py`, writes a new storage state, and retries the operation once.

Core endpoints:

| Endpoint                                                       | Purpose                                                                                                    |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `GET /health`                                                  | Local readiness, no outbound NotebookLM call                                                               |
| `POST /auth/refresh`                                           | Force Chrome Profile 6 cookie decrypt into `notebooklm-py` storage                                         |
| `POST /auth/check`                                             | Run `notebooklm auth check --test --json`                                                                  |
| `POST /cli`                                                    | Run the `notebooklm` CLI with bridge storage injected                                                      |
| `POST /rpc/{namespace}/{method}`                               | Generic notebooklm-py API method bridge                                                                    |
| `GET /notebooks`                                               | List notebooks                                                                                             |
| `POST /notebooks/{id}/chat/ask`                                | Ask a notebook question                                                                                    |
| `POST /notebooks/{id}/sources/url` / `text` / `drive` / `file` | Add sources                                                                                                |
| `POST /notebooks/{id}/artifacts/generate/{kind}`               | Generate audio, video, reports, quizzes, flashcards, slide decks, infographics, data tables, and mind maps |
| `POST /notebooks/{id}/research/start`                          | Start NotebookLM research                                                                                  |

The generic RPC route maps directly to installed notebooklm-py namespaces: `notebooks`, `sources`, `artifacts`, `chat`, `research`, `notes`, `settings`, and `sharing`.

Example:

```bash
curl -s http://127.0.0.1:8770/notebooks

curl -s http://127.0.0.1:8770/notebooks/NOTEBOOK_ID/chat/ask \
  -H 'content-type: application/json' \
  -d '{"question":"What is this notebook about?"}'

curl -s http://127.0.0.1:8770/rpc/artifacts/suggest_reports \
  -H 'content-type: application/json' \
  -d '{"args":["NOTEBOOK_ID"]}'
```

## How Chat Works

The [Notebook Chat](/notebook) page provides a direct conversational interface to the NotebookLM knowledge base. When you send a message:

1. Your query is sent to `POST /api/notebook/chat` (session-cookie authenticated).
2. The backend reads **agent rules** from the `global_config` D1 table and prepends them to your query as behavioral guardrails.
3. The system fetches the CSRF token via Browser Rendering (or uses the cached value) and constructs the SDK client.
4. The guarded query is sent to `client.chat.ask(notebookId, query)`.
5. NotebookLM returns an answer with source **references** citing the documents in the notebook.
6. The answer and references are displayed in the chat — you can expand the reference panel to see which sources were cited.

If the session has expired, the API returns a **401** with the exact `recoveryCommand` to run.

Messages are **not persisted** — the chat is a stateless session for quick career Q&A.

## How Agents Use NotebookLM

### OrchestratorAgent — Resume Generation & Job Analysis

When [OrchestratorAgent](/docs/agents/orchestrator) processes a job application, it consults NotebookLM to retrieve full career context. Specifically:

- **Resume tailoring** — When generating a resume for a role, Colby calls `consult_notebook()` to ask NotebookLM questions like "What relevant experience do I have for a [role title] position?" and uses the answers to tailor bullet points.
- **Cover letter drafting** — Similar context lookups help Colby write cover letters that reference specific projects and achievements from your career history.
- **User edit requests** — When you ask Colby to revise a resume section, Colby re-consults the knowledge base to fill in accurate details rather than hallucinating.

See the [OrchestratorAgent documentation](/docs/agents/orchestrator) for full technical details on how the agent orchestrates these lookups.

### NotebookLMAgent — Direct Access

The [NotebookLMAgent](/docs/agents/notebooklm) Durable Object provides two access patterns:

- **Callable RPC** (`consult(query)`) — Used by server-side code and other agents. OrchestratorAgent delegates knowledge lookups through this interface.
- **WebSocket** (`onMessage()`) — Real-time access for frontend clients that connect via the Agents SDK.

Both paths flow through the shared `consultNotebook()` function in `src/backend/ai/tools/notebooklm.ts`, which handles authentication, agent-rule injection, and the SDK call.

See the [NotebookLMAgent documentation](/docs/agents/notebooklm) for method signatures and WebSocket protocol.

### NotebookLMMcpAgent — External AI Tools

The [NotebookLMMcpAgent](/docs/agents/notebooklm-mcp) exposes the knowledge base as a **remote MCP server** at `/mcp/notebooklm`. External AI tools like Claude Desktop, Cursor, and custom agents can connect using the Model Context Protocol to query your career knowledge.

See the [NotebookLMMcpAgent documentation](/docs/agents/notebooklm-mcp) for endpoint details, authentication, and MCP tool schema.

## Code Architecture

### Key Files

- `src/backend/ai/tools/notebooklm.ts` — Core `consultNotebook()` function + `SessionExpiredError`. All NotebookLM access flows through here.
- `src/backend/utils/secrets.ts` — `getNotebookLMCookies(env)` with KV-only session lookup.
- `src/backend/api/routes/notebook.ts` — `/api/notebook/chat` REST endpoint with 401 on session expired.
- `src/backend/ai/agents/notebooklm/index.ts` — NotebookLMAgent Durable Object.
- `src/backend/ai/agents/notebooklm-mcp/index.ts` — NotebookLMMcpAgent MCP server.
- `src/backend/health/checks/notebooklm-credentials.ts` — KV session presence + CSRF cache status health check.
- `src/backend/health/checks/notebooklm-query.ts` — Passive session credential validation (cookie structure, age, CSRF cache) — no outbound requests to Google.
- `scripts/sync-cookies.py` — Keychain-backed Chrome Profile 6 cookie decryptor, local `notebooklm-py` validator, and KV hot-swap utility.
- `scripts/notebooklm_fastapi_server.py` — Local FastAPI bridge exposing notebooklm-py APIs and CLI commands with automatic Chrome Profile 6 cookie refresh.

### SDK Usage Pattern

The system bypasses `NotebookLMClient.connect()` to avoid bare `fetch()` calls to Google. Instead:

```
// 1. CSRF token fetched via Browser Rendering /content (cached in KV)
// 2. NotebookLMClient constructed directly with pre-built auth
// 3. SDK used normally for RPC calls

import { consultNotebook } from "@/backend/ai/tools/notebooklm";

const result = await consultNotebook(env, "What experience do I have with...");
// result.answer — The answer text
// result.conversationId — For multi-turn tracking
// result.turnNumber — Sequential turn number
// result.references — Source citations
```

## Troubleshooting

### Empty responses or "SESSION_EXPIRED" errors

**Cause:** NotebookLM session cookies have expired.

**Fix:** Run `pnpm run session:sync -- --force-refresh` to decrypt fresh cookies from Chrome Profile 6, validate them locally, and push them to KV. You can also paste cookies in Config → NotebookLM Session.

### Health check passes for credentials but fails for query

**Cause:** A session exists in KV but the cookies inside are expired or invalid.

**Fix:** Refresh with `pnpm run session:sync -- --force-refresh`. If local validation fails, confirm Chrome Profile 6 (`jmbish04`) can open NotebookLM in the browser, then rerun `pnpm run session:sync -- --validate-only`.

### CSRF token discovery fails

**Cause:** Browser Rendering could not extract the CSRF token from the NotebookLM page, usually because the cookies are invalid or Google redirected to a sign-in page.

**Fix:** Refresh cookies with `pnpm run session:sync -- --force-refresh`. If decryption fails, macOS may need you to approve Keychain access for Python to read `Chrome Safe Storage`.

### API returns 401 with SESSION_EXPIRED

**Cause:** The `consultNotebook()` function detected an auth failure and the route returned the structured error.

**Fix:** The response body contains the exact `recoveryCommand` — run it.

## Related Documentation

- [notebooklm-sdk on GitHub](https://github.com/agmmnn/notebooklm-sdk) — SDK source code and API reference
- [OrchestratorAgent](/docs/agents/orchestrator) — Primary orchestrator that delegates career lookups to NotebookLM
- [NotebookLMAgent](/docs/agents/notebooklm) — Durable Object wrapper for direct knowledge base access
- [NotebookLMMcpAgent](/docs/agents/notebooklm-mcp) — MCP server for external AI tool integration
- [Configuration](/docs/configuration) — Secrets and credential management
- [Notebook Chat](/notebook) — Interactive chat interface
