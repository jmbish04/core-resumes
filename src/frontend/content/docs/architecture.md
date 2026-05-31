---
title: "Architecture"
date_last_updated: "2026-05-31"
---

# Architecture

The Career Orchestrator runs as a **single Cloudflare Worker** that handles API requests, serves the frontend, processes inbound email, and runs AI agents — all from one deployment.

## Request Routing

The Worker entry point (`src/_worker.ts`) routes requests through a priority chain:

1. **MCP endpoint** — Requests to `/mcp/notebooklm` are authenticated via Bearer token and routed to the `NotebookLMMcpAgent` Durable Object.
2. **Agent routing** — The Agents SDK `routeAgentRequest()` handles WebSocket connections to Durable Object agents (`OrchestratorAgent`, `NotebookLMAgent`).
3. **Hono API** — Paths starting with `/api/`, plus `/openapi.json`, `/scalar`, and `/swagger`, are handled by the Hono backend.
4. **Astro SSR** — Everything else falls through to Astro for server-side rendered pages.

## Backend Stack

- **Hono** with `@hono/zod-openapi` — Type-safe API routes with automatic OpenAPI spec generation.
- **Drizzle ORM** on **Cloudflare D1** (SQLite) — One table per file under `src/backend/db/schemas/`. The barrel export is `src/backend/db/schema.ts`.
- **Workers AI** via **AI Gateway** — All AI calls use `env.AI.run(model, body, { gateway: { id: env.AI_GATEWAY_ID } })` for centralized observability.
- **Durable Objects** — Three agent classes (`OrchestratorAgent`, `NotebookLMAgent`, `NotebookLMMcpAgent`) run as persistent stateful actors.
- **Email handling** — The Worker `email()` handler delegates to `src/backend/email/handler.ts` for inbound recruiting email processing.
- **KV** — Used for session storage and runtime-mutable configuration values.

## Frontend Stack

- **Astro** — Server-side rendered pages with `output: "server"` mode.
- **React** — Interactive components hydrated via `client:load`.
- **shadcn/ui** — Dark-themed component library built on Radix UI primitives.
- **Tailwind CSS v4** — Utility-first styling via the Vite plugin.

## AI Architecture

The AI layer follows a strict modular pattern:

- **Models** — One file per model under `src/backend/ai/models/`. Each exports a `ModelDescriptor` with the model ID and capabilities.
- **Providers** — Provider abstraction under `src/backend/ai/providers/`. Currently `WorkersAIProvider` wraps `env.AI.run()`.
- **Tasks** — One file per AI task under `src/backend/ai/tasks/`. Tasks like `draft()` and `extract()` compose a provider + model to execute a specific function.
- **Tools** — External integrations under `src/backend/ai/tools/`: Browser Rendering, Google Docs, and NotebookLM.

## Deployment

The app deploys via `pnpm run deploy` which:

1. Builds the Astro frontend (`astro build`)
2. Copies `.assetsignore` to exclude `_worker.js` from static assets
3. Runs remote D1 migrations via `drizzle-kit`
4. Deploys to Cloudflare via `wrangler deploy`
