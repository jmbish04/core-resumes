# CoreResumesMcpAgent

**CoreResumesMcpAgent** exposes the **full Core Resumes / Career Orchestrator HTTP API** as a remote MCP (Model Context Protocol) server. Once connected, any MCP-compatible AI client — Claude Code, Claude Desktop, Cursor — can drive the entire app through chat: submit job postings by URL, review scraped extractions, manage roles end-to-end, run and troubleshoot pipelines, hunt freelance gigs, generate AI proposals, query salary intelligence, search career memory, manage config, and check health.

This is the **chat-first companion** to the web UI. Anything the user can do in the app, they can ask Claude to do.

## Endpoints

Two transports, both backed by the same `CoreResumesMcpAgent`:

| Path | Transport | Use case |
| --- | --- | --- |
| `/mcp` | Streamable HTTP | Modern Claude Code, Claude Desktop, Cursor, ChatGPT Connectors |
| `/sse` | Server-Sent Events | Older Claude CLI (≤ v0.2.x) and any client that only speaks SSE |

Two auth schemes, both accepted on either transport:

| Scheme | Header | Use case |
| --- | --- | --- |
| Pre-shared key | `Authorization: Bearer $WORKER_API_KEY` | Programmatic clients, scripts, Claude Code with a configured header |
| OAuth 2.1 | `Authorization: Bearer <issued-token>` | Claude Chat web (which requires OAuth), Claude Desktop OAuth flow, any client supporting dynamic client registration |

The OAuth metadata document lives at `/.well-known/oauth-authorization-server`.
The authorize / token / register endpoints are at `/oauth/authorize`, `/oauth/token`, `/oauth/register`. See [`/docs/mcp`](/docs/mcp) for an end-to-end install guide.

## Architecture

`CoreResumesMcpAgent` is a Durable Object that extends `McpAgent` from the Cloudflare Agents SDK. On `init()` it registers ~60 MCP tools, grouped by domain:

| Domain | Example tools |
| --- | --- |
| **Role intake** | `submit_role_url`, `confirm_role_intake`, `batch_role_intake` |
| **Role lifecycle** | `list_roles`, `get_role`, `update_role`, `transition_role_status`, `reprocess_role`, `generate_role_asset` |
| **Role analysis** | `get_role_analysis`, `get_role_analysis_history`, `request_role_analysis`, `get_role_market_compensation` |
| **Role documents (Drive/Docs)** | `list_role_documents`, `get_role_document`, `get_role_document_content`, `sync_role_documents`, `revise_role_document`, `create_role_document_from_text`, `delete_role_document` |
| **Pipeline ops** | `scan_pipeline_jobs`, `get_pipeline_stats`, `list_board_tokens`, `sync_api_companies`, `trigger_api_companies_sync` |
| **Companies** | `list_companies`, `get_company`, `update_company`, `get_company_analytics` |
| **Freelance** | `list_freelance_opportunities`, `scan_freelance`, `analyze_freelance_opportunity`, `generate_freelance_proposal`, `update_freelance_proposal` |
| **Salary** | `get_latest_salary_snapshot`, `analyze_salary_trends`, `analyze_role_compensation` |
| **NotebookLM** | `notebook_query` |
| **Career memory** | `list_memories`, `search_memories`, `update_memory` |
| **Config** | `list_config`, `set_config`, `seed_default_config` |
| **Health & docs** | `run_health_checks`, `list_docs`, `get_doc_meta` |

Every tool dispatches through the existing Hono router via an `internalFetch()` helper that injects the Bearer token automatically. This preserves all zod-openapi request validation, the auth middleware, and the route's side-effect behavior (orchestrator enqueues, D1 inserts, Drive folder creation). The MCP layer is a thin adapter — no business logic is duplicated.

## Example chat flows

**Submit and confirm a new role from a URL**

```
You: Add this job to my roles — https://boards.greenhouse.io/anthropic/jobs/4123
Claude: [calls submit_role_url]
        I scraped it. Here's what I extracted: …
        Salary range: $150k–$220k. 12 responsibilities. Should I confirm?
You: Yes, but the salary max should be $230k.
Claude: [calls confirm_role_intake with salaryMax: 230000]
        Created role id 8f3a…. Background extraction and analysis are queued.
```

**Find a freelance gig and bid on it**

```
You: Show me Upwork gigs in the queue and recommend one to bid on.
Claude: [calls list_freelance_opportunities, get_freelance_triage for top hits]
        These three have a "bid" triage. The Cloudflare Workers consulting gig has
        the highest win probability. Want me to draft a proposal?
You: Yes.
Claude: [calls generate_freelance_proposal]
        Draft ready — $4,200 fixed bid, here's the cover letter…
```

**Review a role analysis**

```
You: Pull the analysis for the Stripe Senior PM role.
Claude: [list_roles → finds id → get_role_analysis]
        Alignment score 78%. Strong on payments domain, gap on
        regulatory compliance. Three suggested resume emphases…
```

**Query salary intelligence**

```
You: What's market rate for a Staff PM in NYC right now?
Claude: [calls get_latest_salary_snapshot, optionally analyze_salary_trends]
        Latest snapshot: P50 $240k, P75 $285k base; total comp roughly +35% from RSUs.
```

**Review and revise a resume (Drive/Docs integration)**

```
You: Pull the resume for the Anthropic role and let me know what to tighten up.
Claude: [calls list_role_documents(roleId, includeContent=true)]
        Reading "Resume — Anthropic v1" (id: doc-abc…). I see three areas to tighten…
You: Yes — and reframe the Cloudflare bullet around throughput numbers.
Claude: [calls revise_role_document(id=doc-abc, mode='find_replace', findReplace=[...])]
        Created revision 2 → "Resume — Anthropic v1 (revision 2)" in the same Drive
        folder. It's saved to the role's documents list — open in Drive:
        https://docs.google.com/document/d/…/edit
```

Each revision is a real Google Doc copy in the same role folder, so the user
can keep editing in Drive, share it, or download a PDF — and you can pull the
new revision back into chat via `list_role_documents` or via your Drive/Docs
connector using the returned `gdocId`.

## Connecting from Claude Code

```bash
claude mcp add core-resumes \
  --transport sse \
  --url "https://<your-worker>.workers.dev/mcp" \
  --header "Authorization: Bearer $WORKER_API_KEY"
```

Or in `.mcp.json`:

```json
{
  "mcpServers": {
    "core-resumes": {
      "url": "https://<your-worker>.workers.dev/mcp",
      "transport": "sse",
      "headers": { "Authorization": "Bearer ${WORKER_API_KEY}" }
    }
  }
}
```

Inspect locally with the official MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
# Enter URL: http://localhost:8787/mcp
# Add header: Authorization: Bearer $(wrangler secret list ... )
```

## Live Agent Metadata

See `docsMetadata()` on the agent class for the canonical tool list and metadata.
