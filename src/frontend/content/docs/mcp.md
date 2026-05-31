---
title: "MCP Connector"
date_last_updated: "2026-05-31"
---

# MCP Connector

`CoreResumesMcpAgent` exposes the full Career Orchestrator HTTP API as a Model Context Protocol (MCP) server. Connect Claude (Code, Desktop, Chat, iOS), ChatGPT, Cursor, VS Code — anything that speaks MCP — and drive the entire app from chat. ~60 tools cover role intake, role lifecycle, Google Docs revisions, pipeline ops, companies, freelance gig discovery & bidding, salary intelligence, NotebookLM, career memory, config, and health.

## Endpoints

Two transports, both backed by the same `CORE_RESUMES_MCP_AGENT` Durable Object. Two auth schemes, both accepted on either transport.

| Concern | Value |
| --- | --- |
| Streamable HTTP endpoint | `https://core-resumes.hacolby.workers.dev/mcp` |
| Legacy SSE endpoint | `https://core-resumes.hacolby.workers.dev/sse` |
| OAuth metadata | `https://core-resumes.hacolby.workers.dev/.well-known/oauth-authorization-server` |
| Protected-resource metadata | `https://core-resumes.hacolby.workers.dev/.well-known/oauth-protected-resource` |
| Authorize endpoint | `https://core-resumes.hacolby.workers.dev/oauth/authorize` |
| Token endpoint | `https://core-resumes.hacolby.workers.dev/oauth/token` |
| Dynamic registration | `https://core-resumes.hacolby.workers.dev/oauth/register` |
| Pre-shared bearer header | `Authorization: Bearer $WORKER_API_KEY` |

Use Streamable HTTP for modern clients (Claude Code recent, Claude Desktop, Cursor, ChatGPT Connectors). Use SSE for older Claude CLI (≤ v0.2.x). Use OAuth for Claude Chat web / iOS / mobile (they don't accept pre-shared bearers). Use the pre-shared key for CLI scripts and the MCP Inspector.

## Claude connector compliance

This server meets every hard requirement Anthropic publishes for remote MCP custom connectors. It works as a Claude custom connector on Free / Pro / Max / Team / Enterprise plans across **web, desktop, AND the iOS app** — iOS works because Claude connects from Anthropic's cloud (not from your phone), so as long as the URL is publicly reachable, the connector follows you everywhere.

| Requirement | Status |
| --- | --- |
| Public HTTPS endpoint reachable from Anthropic egress `160.79.104.0/21` | ✅ Cloudflare Workers default |
| Streamable HTTP transport at `/mcp` | ✅ `McpAgent.serve()` |
| Legacy SSE transport at `/sse` for older clients | ✅ `McpAgent.serveSSE()` |
| Auth via OAuth 2.1 Dynamic Client Registration (RFC 7591) | ✅ `@cloudflare/workers-oauth-provider` |
| Accepts Claude's hosted redirect URI `https://claude.ai/api/mcp/auth_callback` | ✅ via DCR registration |
| Port-agnostic loopback redirects per RFC 8252 (Claude Code ephemeral ports) | ✅ `localhost`, `127.0.0.0/8`, `::1` all matched ignoring port |
| RFC 6749 `invalid_grant` on expired/revoked refresh tokens | ✅ provider standard |
| MCP auth spec compatibility (2025-03-26, 2025-06-18, 2025-11-25) | ✅ all three (handled by SDK) |
| ≤ 150,000 char tool-result cap with truncation marker | ✅ trimmed to 140k in `toolText()` |
| ≤ 300-second tool execution timeout | ⚠️ most tools <5s; long-running ops return job ids — poll separately |
| Pre-shared bearer tokens (NOT supported by Claude hosted clients) | ⚠️ only for Claude Code CLI & scripts |

If you front this worker with Cloudflare WAF or Cloudflare Access, allowlist `160.79.104.0/21` in any rule that gates `/mcp`, `/sse`, `/oauth/*`, and `/.well-known/oauth-*`.

## Install in Claude iOS / mobile

iOS, Android, web (claude.ai), and Desktop share a single connector store — add it once on any device and it follows you across all of them.

1. Open the Claude app → **Settings → Customize → Connectors**.
2. Tap **"+"** → **Add custom connector**.
3. Paste the URL: `https://core-resumes.hacolby.workers.dev/mcp`
4. Leave OAuth Client ID / Secret blank — DCR handles it.
5. Tap **Add**, then **Connect**. The Claude in-app browser opens `/oauth/authorize`. Sign in to the worker if prompted, then tap **Approve**.
6. In any chat, tap **+** → **Connectors** → toggle *Core Resumes* on.

Free plan users are limited to one custom connector at a time; paid plans can add multiple. Either way the connector is authorized against your Claude account, not a single device.

## Install in Claude Chat (web)

Same flow as iOS, on `claude.ai`:

1. Settings → Connectors → **Add custom connector**
2. Name: `Core Resumes`
3. Remote MCP server URL: `https://core-resumes.hacolby.workers.dev/mcp`
4. Authentication: **OAuth** (Claude auto-discovers `/.well-known/oauth-authorization-server`)
5. Claude registers dynamically and redirects you to the consent screen — click **Approve**

You must be signed into the worker (have a valid `cr_session` cookie) before clicking Approve. If you're not, the consent page bounces you to `/login` first.

## Install in Claude Desktop

Settings → Connectors → **Add custom connector** supports both auth schemes:

- **Name:** Core Resumes
- **Remote MCP server URL:** `https://core-resumes.hacolby.workers.dev/mcp`
- **Authentication:** either **OAuth** (recommended — Claude handles the dance) or **Custom header** with `Authorization: Bearer YOUR_WORKER_API_KEY`.

For older Claude Desktop versions without the Connectors UI, edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows) and add the same `mcpServers` block shown in the Claude Code section below.

## Install in Claude Code (CLI)

### Recent Claude Code (HTTP transport)

```bash
claude mcp add core-resumes \
  --transport http \
  --url "https://core-resumes.hacolby.workers.dev/mcp" \
  --header "Authorization: Bearer $WORKER_API_KEY"
```

### Older Claude CLI (≤ v0.2.x — SSE transport)

Older versions only support stdio and SSE. Point them at the SSE endpoint instead:

```bash
claude mcp add core-resumes \
  --transport sse \
  --url "https://core-resumes.hacolby.workers.dev/sse" \
  --header "Authorization: Bearer $WORKER_API_KEY"
```

Or upgrade with `npm i -g @anthropic-ai/claude-code@latest` to get HTTP transport support.

### OAuth instead of pre-shared key

```bash
claude mcp add core-resumes --transport http \
  --url "https://core-resumes.hacolby.workers.dev/mcp"
# Omit --header; the CLI will open a browser to /oauth/authorize, you approve, and the token is stored locally.
```

### Manual config

Add to `.mcp.json` (project) or `~/.claude.json` (global):

```json
{
  "mcpServers": {
    "core-resumes": {
      "type": "http",
      "url": "https://core-resumes.hacolby.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_WORKER_API_KEY"
      }
    }
  }
}
```

Verify with `claude mcp list` — `core-resumes` should show as connected with the full tool catalog.

## Install in Cursor, VS Code, or Windsurf

All three use the same `mcpServers` JSON shape. File locations:

- **Cursor:** `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global)
- **VS Code:** `.vscode/mcp.json` (project)
- **Windsurf:** `~/.codeium/windsurf/mcp_config.json`

```json
{
  "mcpServers": {
    "core-resumes": {
      "url": "https://core-resumes.hacolby.workers.dev/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer ${env:WORKER_API_KEY}"
      }
    }
  }
}
```

Set `WORKER_API_KEY` in your shell or editor env so the placeholder resolves on launch.

## Install in ChatGPT

### Option A — ChatGPT Connectors (Business / Enterprise / Pro)

1. Settings → **Connectors → Create connector** → **Remote MCP server**
2. **Name:** Core Resumes
3. **URL:** `https://core-resumes.hacolby.workers.dev/mcp`
4. **Authentication:** Custom header → `Authorization` = `Bearer YOUR_WORKER_API_KEY`
5. Save, then enable inside any chat / Project to make the tools callable.

### Option B — OpenAI Responses API (programmatic)

```ts
import OpenAI from "openai";
const client = new OpenAI();

const response = await client.responses.create({
  model: "gpt-5",
  input: "Review the Anthropic role in my pipeline and suggest resume tweaks.",
  tools: [
    {
      type: "mcp",
      server_label: "core-resumes",
      server_url: "https://core-resumes.hacolby.workers.dev/mcp",
      headers: {
        Authorization: `Bearer ${process.env.WORKER_API_KEY}`,
      },
      require_approval: "never",
    },
  ],
});
```

### Option C — Custom GPT (consumer ChatGPT)

Consumer Custom GPTs don't speak MCP directly. Either point a Custom GPT's **Actions** at the worker's OpenAPI spec at `/openapi.json` (the REST surface is the same data the MCP tools wrap), or run an MCP-to-OpenAPI proxy locally. Option A above is strongly preferred where available.

## Other MCP clients

- **OpenAI Codex CLI:** add to `~/.codex/config.toml` under `[mcp_servers.core-resumes]` with the same URL + Authorization header.
- **Cline (VS Code):** Settings → MCP Servers → Add Remote.
- **Continue.dev:** add to `~/.continue/config.json` under `mcpServers`.
- **Generic SDK clients:** any client supporting MCP Streamable HTTP transport works — point it at `https://core-resumes.hacolby.workers.dev/mcp` with the Bearer header.

## OAuth 2.1 reference

Implemented by `@cloudflare/workers-oauth-provider`, backed by the worker's `OAUTH_KV` namespace binding. Supports RFC 7591 dynamic client registration so MCP clients can connect without out-of-band setup.

| | |
| --- | --- |
| Authorization endpoint | `/oauth/authorize` |
| Token endpoint | `/oauth/token` |
| Dynamic registration endpoint | `/oauth/register` |
| Metadata (RFC 8414) | `/.well-known/oauth-authorization-server` |
| Protected-resource metadata | `/.well-known/oauth-protected-resource` |
| Supported scopes | `mcp` |
| Access token TTL | 1 hour |
| Refresh token TTL | 30 days |

### End-to-end OAuth flow

1. Client hits `/mcp` → gets 401 with `WWW-Authenticate` pointing at the metadata URL.
2. Client fetches metadata, POSTs to `/oauth/register` to mint a `client_id`.
3. Client opens `/oauth/authorize?...` in your browser. You sign in (if needed) and click **Approve**.
4. Browser is 302'd back to the client's `redirect_uri` with a code.
5. Client POSTs to `/oauth/token` with the code, gets an access + refresh token.
6. Client retries `/mcp` with the access token — handshake succeeds.

## Known limits

| Limit | Value | Notes |
| --- | --- | --- |
| Tool result size | ≤ 150,000 chars | Defensively trimmed to ~140k in `toolText()` with a truncation marker so the model knows to paginate. |
| Tool execution time | ≤ 300 seconds | Long-running ops (`scan_freelance`, `analyze_salary_trends`) return job/session ids — poll with the dedicated read-side tools. |
| Protocol features | tools + resources + prompts | Resource subscriptions and sampling are NOT supported by Claude hosted clients — this server does not expose those. |

## What you can do from chat

- **Submit role URLs** — Browser-Render scrape, preview before commit, edit fields in chat.
- **Manage roles** — list, fix scraped fields, transition status, view analysis reports.
- **Google Docs** — list role docs with content, edit a resume, save as a new revision in the same Drive folder.
- **Pipeline ops** — trigger scans, view stats, manage board tokens, sync upstream aggregator.
- **Freelance** — list gigs, AI-triage, generate proposals, override decisions, track wins.
- **Salary intelligence** — market snapshots, role-specific comp scorecards, on-the-fly Sandbox analysis.
- **NotebookLM** — query the career knowledge base inline.
- **Career memory** — semantic search via Vectorize, CRUD over revisions.
- **Config** — list / set / seed all hot-swap config keys.
- **Health & docs** — run health checks, surface doc metadata, schema viewer.

## Example chat flows

### Submit a role from a URL

```
You: Add this Anthropic job to my pipeline — <greenhouse url>
Claude: [calls submit_role_url]
        Scraped. Here's what I extracted: …
        Salary range: $150k–$220k. 12 responsibilities. Confirm or edit?
You: Yes, but salary max should be $230k.
Claude: [calls confirm_role_intake with salaryMax: 230000]
        Created role id 8f3a…. Background extraction queued.
```

### Review and revise a resume

```
You: Pull the resume for that role and tighten the Cloudflare bullet.
Claude: [calls list_role_documents(includeContent=true), revise_role_document]
        New revision in your Drive folder: "Resume — Anthropic (revision 2)".
```

### Hunt freelance gigs

```
You: Show me upwork gigs in the queue and recommend one to bid on.
Claude: [calls list_freelance_opportunities + get_freelance_triage]
        These three have a 'bid' triage. Want me to draft a proposal?
You: Yes.
Claude: [calls generate_freelance_proposal]
        Draft ready — $4,200 fixed bid, here's the cover letter…
```

## Inspect & debug

Use the official MCP Inspector to enumerate the tool catalog, walk through the OAuth flow, and invoke tools manually **before** adding the server to a Claude client — this is the single best way to catch wiring issues without resetting the connector in Claude repeatedly.

```bash
npx @modelcontextprotocol/inspector@latest
```

- Transport: **Streamable HTTP**
- URL: `https://core-resumes.hacolby.workers.dev/mcp`
- Header: `Authorization: Bearer YOUR_WORKER_API_KEY` (or use the OAuth flow)
- Click **Connect** — the full tool catalog enumerates with Zod input schemas.

### Quick sanity-check curls

```bash
# 1. unauthenticated — should 401 with WWW-Authenticate pointing at OAuth metadata
curl -i "https://core-resumes.hacolby.workers.dev/mcp" -H "Accept: text/event-stream"

# 2. authenticated initialize over Streamable HTTP — should return a session
curl -i -X POST "https://core-resumes.hacolby.workers.dev/mcp" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

# 3. same call against the SSE transport
curl -N "https://core-resumes.hacolby.workers.dev/sse" \
  -H "Authorization: Bearer $WORKER_API_KEY" \
  -H "Accept: text/event-stream"

# 4. OAuth metadata discovery
curl -s "https://core-resumes.hacolby.workers.dev/.well-known/oauth-authorization-server" | jq .
```

## Full tool catalog

See [CoreResumesMcpAgent](/docs/agents/core-resumes-mcp) for the live tool list with input schemas and per-tool descriptions.

## Troubleshooting

**401 Unauthorized** — The `Authorization` header didn't match `Bearer $WORKER_API_KEY`. Confirm the secret with `wrangler secrets-store list` and refresh it in your client config.

**Client reports "no tools available" / can't connect** — Two common causes:
1. The client only speaks SSE but you pointed it at `/mcp`. Use `/sse` with `"transport": "sse"`.
2. The client speaks Streamable HTTP but you set `"transport": "sse"`. Use `"transport": "http"` or omit the field.

**Claude CLI says: "only supports stdio and sse transports"** — Your CLI version is older than the Streamable HTTP rollout (≤ v0.2.x). Either upgrade with `npm i -g @anthropic-ai/claude-code@latest`, or use the SSE endpoint as shown above.

**OAuth flow fails / consent page errors** — You must be signed into the app (`cr_session` cookie) before approving. Visit `/login` first, then retry the connector setup.

**Claude says "Failed to connect" (especially on iOS)** — iOS routes through Anthropic's cloud, not your phone, so the URL must be reachable from `160.79.104.0/21`. Curl the worker from a non-Cloudflare network to confirm it responds. If you have Cloudflare WAF / Access in front, allowlist that CIDR for `/mcp`, `/sse`, `/oauth/*`, and `/.well-known/oauth-*`.

**OAuth loop — Claude keeps re-authorizing** — Usually one of two things:
1. Registered redirect URI doesn't match what Claude sends (must be exactly `https://claude.ai/api/mcp/auth_callback`).
2. `OAUTH_KV` isn't bound — tokens can't persist between requests so Claude is forced to re-register every time. Run `wrangler kv namespace list` and confirm the binding exists.

**Tool result truncated mid-response** — You'll see `[result truncated — exceeded the 150,000-character tool-output limit…]` at the end. Re-run with tighter filters (`status`, `limit`, `offset`, `q`), request a single id, or set `includeContent=false` on bundle endpoints.

**Drive/Docs tools fail** — The service-account credentials may be misconfigured. Check the Google secrets (`GOOGLE_CREDS_SA_*`) and run `run_health_checks` to see which probe is failing.

**Metadata endpoint returns 404 Astro HTML** — The OAuth code isn't deployed. Run `pnpm exec wrangler deploy` and recheck `https://core-resumes.hacolby.workers.dev/.well-known/oauth-authorization-server`.
