# Greenhouse Retrofit — Coding Agent Briefing

You are picking up initiative **002_greenhouse**: porting the Python `greenhouse` job-scanning service into this Cloudflare Worker (`core-resumes`). Everything you need to plan against is already on disk in this directory.

## Read these first, in order

1. **`AGENTS.md`** at the project root — non-negotiable conventions for this codebase (modular schemas, AI Gateway routing, deploy flow, dark shadcn UI, no mocked data, etc.). If you violate AGENTS.md, you are wrong by definition.
2. **`docs/002_greenhouse/PRD.md`** — full product requirements with architecture diagrams, every binding, every file path, every phase, the BYOK Gemini path, and the verification plan.
3. **`docs/002_greenhouse/TASKS.json`** — the work breakdown. Tasks are grouped by phase and have explicit `depends_on` arrays. Do not skip ahead of dependencies.
4. **`docs/0001_init/`** — prior initiative. Mostly context for how this codebase was bootstrapped.

## How to work

- **Follow `TASKS.json` in dependency order.** Each task lists its `depends_on`, the files it modifies/creates, the implementation details, and acceptance criteria. Pick the next task whose dependencies are all completed.
- **Update task `status` as you progress** — `pending` → `in_progress` → `completed`. If a task is blocked, set `status: "blocked"` and add a `blocked_reason` field. Read the file fresh each time before editing to avoid stomping concurrent updates.
- **Verify acceptance criteria before marking a task complete.** "Compiles" is not enough — exercise the actual behavior described.
- **One PR-sized commit per task or small group of tightly-coupled tasks.** Use descriptive messages: `[002_greenhouse 6.11] Add /api/jobs/:id/apply route`. Never amend a previous commit unless explicitly asked.
- **Keep the user out of the loop unless something genuinely ambiguous arises.** The PRD is the source of truth. If the PRD and AGENTS.md disagree, AGENTS.md wins — and flag the conflict so the user can resolve it.

## When you get stuck or hit a Cloudflare error

Use the `ask` CLI to query Cloudflare docs, save the answer to `docs/cloudflare-docs/`, and read it back:

```sh
ask --cloudflare-docs "<your specific question>" > docs/cloudflare-docs/<short-name>.md
```

Examples of when to reach for it:

- The exact request body shape for the Browser Rendering REST endpoints (`/markdown`, `/pdf`).
- How `env.AI.gateway(id).getUrl(provider)` resolves the URL — confirming the BYOK auth header pattern.
- Vectorize binding API surface (`upsert`, `query`, `getByIds`) and metadata return modes.
- Durable Objects `WebSocketHibernation`, alarms, scheduled callbacks.
- D1 query plan / parameter limits if a migration produces unexpected SQL.
- Any `wrangler types` regression where the generated `Env` differs from what you expected.

The saved file then lives in version control and the next agent (or you, after compaction) can re-read it instead of re-querying.

**Rule:** never proceed past a fundamental misunderstanding of a Cloudflare primitive. Pause, query the docs, and confirm before writing code that calls into the platform.

## Critical guardrails (from AGENTS.md, repeated for emphasis)

- **`worker-configuration.d.ts` is generated** — never hand-edit. After any `wrangler.jsonc` change run `pnpm run cf-typegen`.
- **Never hand-edit migrations** — always `pnpm run db:generate`. If a generated migration looks wrong, fix the schema source, regenerate, and review again.
- **Never run `wrangler deploy` directly** — always `pnpm run deploy` (it does build → migrate:remote → wrangler deploy in one go).
- **Every Workers AI call routes through AI Gateway** — `env.AI.run(model, body, { gateway: { id: env.AI_GATEWAY_ID, ... } })`. No raw Workers AI calls.
- **No `window.alert/confirm/prompt`** — use shadcn `AlertDialog` or `Dialog`.
- **No mocked or hardcoded data on the frontend** — every component fetches from `/api/*` and renders an empty state when the API returns nothing.
- **All tables sort + filter** — low effort, high UX value, required.
- **Every new module has a `health.ts`** that actually exercises the subsystem (not `return { status: 'ok' }`).
- **Every new file has a `@file` docstring; every export has JSDoc.** Comments explain the _why_, not the _what_.
- **Schemas live under category folders** — never add a flat schema file at the root of `src/backend/db/schemas/`.

## What "done" looks like

- `pnpm run cf-typegen` clean.
- `pnpm run types` clean.
- `pnpm run db:generate` produces no migration (after each task that modifies schema, regenerate; the diff should match what the task intended).
- `pnpm run dev` boots without error.
- `/api/health` reports all 16 modules at green or yellow with reasons.
- Every Phase 13 verification step in PRD passes locally.
- `pnpm run deploy` succeeds and the same verification steps pass against production.

## Useful commands

```sh
pnpm run cf-typegen        # regenerate worker-configuration.d.ts
pnpm run db:generate       # produce migration from schema changes
pnpm run db:studio         # open D1 web UI
pnpm run migrate:local     # apply migrations to local D1
pnpm run migrate:remote    # apply to remote D1 (only run via `pnpm run deploy`)
pnpm run dev               # local Astro+Wrangler
pnpm run deploy            # full prod pipeline
pnpm run types             # tsc --noEmit
```

## Start here

Open `TASKS.json`, find the next `pending` task whose `depends_on` are all `completed` (begin with `1.1`), set its status to `in_progress`, and execute. When a task references "see PRD Phase X", the PRD has the design rationale, full file lists, and code shapes — use it.

Good luck. Ship it small, ship it tested, ship it documented.
