# NotebookLM Integration Rule

## SDK

- **Package:** `notebooklm-sdk` ([GitHub](https://github.com/agmmnn/notebooklm-sdk)) — unofficial TypeScript SDK.
- **Import:** `import { NotebookLMClient } from "notebooklm-sdk";`
- **Version:** Check `package.json` for pinned version. SDK is unofficial and may break on Google updates.

## Authentication

NotebookLM uses **cookie-based authentication only**. There is no OAuth flow or API key.

### How it works

1. `NotebookLMClient.connect({ cookies })` is the **only** authentication method.
2. The SDK automatically fetches the live NotebookLM page to extract the CSRF token.
3. No separate `NOTEBOOKLM_AUTH_TOKEN` binding is needed — CSRF discovery is built into `connect()`.

### Hot-Swap Session Model

Cookies are retrieved via `getNotebookLMCookies(env)` in **priority order**:

| Priority | Source        | Key                         | Update method                                     |
| -------- | ------------- | --------------------------- | ------------------------------------------------- |
| 1st      | KV            | `ACTIVE_NOTEBOOKLM_SESSION` | `pnpm run session:sync` (instant, no redeploy)    |
| 2nd      | Worker Secret | `NOTEBOOKLM_COOKIES`        | `pnpm dlx wrangler secret put NOTEBOOKLM_COOKIES` |

Additional binding:

| Credential  | Storage | Binding                |
| ----------- | ------- | ---------------------- |
| Notebook ID | Env var | `CAREER_NOTEBOOKLM_ID` |

### Cookie refresh

Preferred (KV hot-swap — no redeploy):

```bash
pnpm run session:sync          # reads ~/.notebooklm/session.json → KV
pnpm run session:sync -- --stdin  # reads from stdin
```

Fallback (Worker Secret — requires next invocation to pick up):

```bash
pnpm dlx wrangler secret put NOTEBOOKLM_COOKIES
```

### How to obtain cookies

1. Open https://notebooklm.google.com in Chrome
2. Sign in with the Google account
3. Open DevTools → Network tab
4. Click any request to `notebooklm.google.com`
5. Copy the entire `Cookie` request header value
6. Paste into `pnpm run session:sync -- --stdin` or `wrangler secret put`

Alternatively, run `npx notebooklm-sdk login` to generate `~/.notebooklm/session.json`, then `pnpm run session:sync`.

## Error Handling

### SessionExpiredError

`consultNotebook()` throws `SessionExpiredError` when the SDK reports an auth failure. The error includes:

- `error.message` — Human-readable description
- `error.recoveryCommand` — The exact CLI command to fix it

The `/api/notebook/chat` route maps this to a **401 Unauthorized** response with:

```json
{
  "error": "SESSION_EXPIRED",
  "message": "SESSION_EXPIRED: NotebookLM session cookies are expired or invalid.",
  "recoveryCommand": "pnpm run session:sync"
}
```

**Always handle `SessionExpiredError`** when calling `consultNotebook()` in new code paths.

## Code architecture

### Single entry point

All NotebookLM access flows through `src/backend/ai/tools/notebooklm.ts`:

```typescript
import { consultNotebook } from "@/backend/ai/tools/notebooklm";
const result = await consultNotebook(env, query);
```

**Do NOT** create separate SDK client instances in routes or agents. Always use `consultNotebook()`.

### Agent rules injection

Every query is wrapped with agent rules from the `global_config` D1 table. This happens automatically in `consultNotebook()`. Do not bypass this by calling the SDK directly.

### Key files

- `src/backend/ai/tools/notebooklm.ts` — Core `consultNotebook()` + `SessionExpiredError`
- `src/backend/utils/secrets.ts` — `getNotebookLMCookies(env)` with KV-first hot-swap logic
- `src/backend/api/routes/notebook.ts` — `/api/notebook/chat` REST endpoint (401 on session expired)
- `src/backend/ai/agents/notebooklm/index.ts` — NotebookLMAgent Durable Object
- `src/backend/ai/agents/notebooklm-mcp/index.ts` — NotebookLMMcpAgent MCP server
- `src/backend/health/checks/notebooklm-credentials.ts` — Binding + KV session presence check
- `src/backend/health/checks/notebooklm-query.ts` — Dual-mode: passive on cron, live query on manual/agent trigger
- `scripts/sync-session.mjs` — Session sync utility

## FastAPI Bridge & VPC Tunnel Integration

For robust, long-term cookie extraction and to bypass Google edge bot detection completely, the project offloads all NotebookLM calls to a local background FastAPI bridge server connected via Cloudflare Tunnel and a private **VPC Service binding**.

### Configuration
* **FastAPI URL & Key**: Controlled via environment variables `NOTEBOOKLM_FASTAPI_URL` (e.g. `http://127.0.0.1:8789`) and `NOTEBOOKLM_FASTAPI_KEY`.
* **VPC Binding**: A VPC Service binding named `VPC_SERVICE` in `wrangler.jsonc` connects the Worker securely to the private host endpoint.
* **Auto-Proxy**: `createNotebookClient()` automatically intercepts all SDK calls and proxies them to the FastAPI server using the transparent `NotebookLMFastAPIProxy` whenever `NOTEBOOKLM_FASTAPI_URL` is defined.

### Health checking & Self-Healing
* **Health Connection Check**: If the FastAPI bridge is configured, the `notebooklm_credentials` health check runs a live connection check to `/health` using the `VPC_SERVICE` binding.
* **Troubleshooting Prompt**: If the connection fails, the health check wraps the error in an actionable troubleshooting prompt inside the `aiSuggestion` output for coding agents to inspect the launchd plist status, `launchd-stderr.log`, and the Cloudflare Tunnel.
* **Self-Healing Cookies**: On auth failure, the FastAPI server automatically triggers `sync-cookies.py` to extract fresh decrypted cookies from Chrome Profile 6, copies them to the pinned `/Users/126colby/.notebooklm/storage_state.json` file, and retries the failed operation instantly.

## ⚠️ Common mistakes

1. **Do NOT** treat `NOTEBOOKLM_COOKIE_SIGNING_KEY` as a NotebookLM credential. It is the Career Orchestrator's own session cookie signing key.
2. **Do NOT** call `NotebookLMClient.connect()` without cookies. The `{ cookies }` parameter is mandatory in server/CI environments.
3. **Do NOT** hardcode cookie values. They expire and must be refreshable via KV or `wrangler secret put`.
4. **Do NOT** create the client at module scope. Create it per-request in `consultNotebook()` to always use fresh cookies.
5. **Do NOT** call the SDK directly without handling `SessionExpiredError`.
6. **ALWAYS** provide a recovery command in error responses for session-related failures.
7. **Favor KV** (`pnpm run session:sync`) over `wrangler secret put` for cookie updates — KV is instant, secrets require the next cold start.
8. **NEVER** call `consultNotebook()`, `createNotebookClient()`, or `NotebookLMClient.connect()` from health checks, cron jobs, or any automated/background path unless `NOTEBOOKLM_FASTAPI_URL` is active. If the FastAPI bridge is active, it runs locally on the host GUI session and bypasses edge IP bans and 1-hour session shortenings completely!
9. The `notebooklm_query` health check is **dual-mode**: passive credential check on `scheduled` trigger, live SDK query only on `manual` or `agent` trigger.
10. **Do NOT** assume the KV-based session is required if `NOTEBOOKLM_FASTAPI_URL` is configured; the FastAPI proxy takes precedence and handles cookies on the host machine.
11. **Do NOT** forget to use `self.fetchFn` or delegate fetch to the bound `env.VPC_SERVICE` when making HTTP calls from the Worker to private local endpoints.
