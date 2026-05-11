# NotebookLMAgent

**NotebookLMAgent** is a specialized knowledge-retrieval agent that provides access to the career knowledge base powered by Google NotebookLM.

## Overview

This agent wraps the [notebooklm-sdk](https://github.com/agmmnn/notebooklm-sdk) to provide a clean interface for querying your career knowledge base. It supports both **callable RPC** (for server-side code) and **WebSocket** connections (for real-time frontend chat).

## How It Works

### Authentication

NotebookLM authentication is cookie-based. The agent reads session cookies from KV (`ACTIVE_NOTEBOOKLM_SESSION`) and discovers the CSRF token via Browser Rendering `/content` with a Chrome User-Agent. The CSRF token is cached in KV with a sliding-window TTL.

| Credential      | Storage                          | Access                              |
| --------------- | -------------------------------- | ----------------------------------- |
| Session cookies | KV (`ACTIVE_NOTEBOOKLM_SESSION`) | `await env.KV.get(...)`             |
| CSRF auth cache | KV (`NOTEBOOKLM_CSRF_CACHE`)     | Auto-managed, sliding 30 min TTL    |
| Notebook ID     | Env var (`CAREER_NOTEBOOKLM_ID`) | `env.CAREER_NOTEBOOKLM_ID` (string) |

When cookies expire, refresh them via **Config → NotebookLM Session** in the dashboard, or run:

```
pnpm run session:sync
```

See the [NotebookLM integration docs](/docs/integrations/notebooklm) for full authentication details, including how to obtain cookies from Chrome DevTools.

### Agent Rules

Before every query, the agent reads `agent_rules` from the `global_config` D1 table and prepends them to the query. This ensures all responses follow your configured behavioral constraints (e.g., "Use precise, truthful language and avoid exposing internal project names.").

### Callable RPC

Other agents and backend code can call `consult(query)` directly via the Durable Object RPC interface. This is how OrchestratorAgent delegates knowledge lookups.

### WebSocket

Frontend clients connect via WebSocket to send queries and receive streaming results. Messages can be sent as raw strings or as `{ query: string }` JSON objects.

## Live Agent Metadata

The following is fetched live from the agent's `docsMetadata()` method:
