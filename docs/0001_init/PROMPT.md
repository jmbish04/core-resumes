# Coding-Agent Initializer — `core-resumes` Initial Build

You are the senior Cloudflare engineer responsible for building the **Career Orchestrator Worker** described in [`PRD.md`](./PRD.md). This file is your initialization brief. Read everything below before touching code.

---

## Your Job

Execute the build defined in [`TASKS.json`](./TASKS.json) in dependency order. The PRD is the spec; TASKS.json is the build queue. Treat them as authoritative — if you find yourself wanting to deviate, stop and ask first.

## Inputs You Must Read First

1. **`docs/0001_init/PRD.md`** — full product spec, architecture, schema, route map, verification.
2. **`docs/0001_init/TASKS.json`** — phased task list with dependencies, files to create/edit, and acceptance criteria. **This is your queue.**
3. **`AGENTS.md`** at repo root (you may need to create it during P11) — persistent project briefing for any Jules sessions you spawn.
4. **`wrangler.jsonc`** — current bindings. Run `wrangler types` to materialize them as `worker-configuration.d.ts` so `Env` is correct in your editor.
5. **`package.json`** — current deps. P0 adds new ones.

## Execution Order — Non-Negotiable

```
P0 Foundation cleanup + deps
  ↓
P1 DB modular schema (one file per table)        ← P2 can start in parallel after T0.2
  ↓
P2 AI providers / models / tasks (modular)       ← Depends on T0.2 only
  ↓
P3 Auth + crypto helpers
  ↓
P4 Tools (Browser Rendering, Google Docs, NotebookLM)
  ↓
P5 Colby Agent (Durable Object)
  ↓
P6 Hono routes
  ↓
P7 Email handler + _worker.ts wiring
  ↓
P8 Frontend foundation + dashboard
  ↓
P9 Intake modal + role viewport
  ↓
P10 Config + email association pages
  ↓
P11 .agent/ rules + AGENTS.md
  ↓
P12 Verification + deploy
```

P1 and P2 are independent once P0.2 (`wrangler.jsonc` + `wrangler types`) is done. Run them in parallel if you can. Everything downstream is sequential.

## Modularization — Treat as Load-Bearing

These principles are **why the user accepted the plan** — never collapse them for convenience:

1. **One Drizzle table per file** under `src/backend/db/schemas/{table}.ts`. `db/schema.ts` is a barrel-only re-export. **No inline definitions in the barrel.**
2. **One AI provider per file** under `src/backend/ai/providers/`. Each owns its auth + transport.
3. **One Workers AI model per file** under `src/backend/ai/models/{model-name}.ts`. Each model has its own zod input schema (because Llama messages, Whisper bytes, BGE text-array, Aura text, and Llava image+prompt all differ). Adding a model = one new file + one registry entry. Nothing else.
4. **One AI task per file** under `src/backend/ai/tasks/`. Tasks are model-agnostic, provider-driven. Routes / agents / tools import only from `tasks/`.
5. **Hard-rule lint:** `src/backend/ai/providers/*` and `src/backend/ai/models/*` may not be imported from outside `src/backend/ai/`. Configure this in `.oxlintrc.json` (T2.17). If the rule fires anywhere except `tasks/`, fix the offending import — don't relax the rule.

## Golden Rules (from cloudflare-jedi)

- **`worker-configuration.d.ts` is auto-generated.** Run `wrangler types` after every `wrangler.jsonc` change. Never hand-edit.
- **`Env` is global.** Don't import it. Don't redefine it.
- **All AI calls route through AI Gateway** — never call `env.AI.run(...)` directly outside `src/backend/ai/`.
- **Frontend:** dark shadcn default. `<Navbar />` and `<ErrorLogger />` on every page (via `BaseLayout.astro`). Never `window.alert/confirm/prompt` — use shadcn `Dialog` / `AlertDialog`. **No mock or placeholder data.** Every value comes from a real API call.
- **OpenAPI doc routes** (`/openapi.json`, `/scalar`, `/swagger`) are dynamic — derived from drizzle-zod via `@hono/zod-openapi`. Never hardcode.
- **Migrations:** always `pnpm run db:generate`. Never hand-edit `drizzle/*.sql`.
- **Tables:** every data table gets sort + filter (low effort, high UX value).
- **Deploy:** always `pnpm run deploy`. Never `wrangler deploy` directly.

## Decisions Already Made (do NOT relitigate)

| Decision                                          | Resolution                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Existing scaffold tables conflict with new schema | **Drop & recreate.** Single fresh migration.                                                                                   |
| Workers AI direct vs gateway                      | **Route through AI Gateway** (caching + observability).                                                                        |
| NotebookLM auth                                   | **Add `NOTEBOOKLM_OAUTH_REFRESH_TOKEN` secret** (user-OAuth refresh-token flow; service account does not work for NotebookLM). |
| Email handler                                     | **DNS already set up — wire it.** `email` export in `_worker.ts`, `EMAIL_OUT` outbound binding.                                |
| Multi-user                                        | **Single user.** Cookie-based auth using `WORKER_API_KEY`. No users / sessions tables.                                         |

## What You Must NOT Do

- Don't introduce alternate AI abstractions outside `providers/` / `models/` / `tasks/`.
- Don't import a Workers AI model from anywhere except its registered task.
- Don't add backwards-compat shims for the deleted scaffold (notifications, healthChecks, dashboardMetrics, users, sessions). They're gone.
- Don't bring in `googleapis` — bundle bloat. Use bare `fetch` + JWT minted in worker.
- Don't write migrations by hand — `pnpm run db:generate` only.
- Don't ship mock data. Empty states render real "no data yet" UI from real (empty) API responses.
- Don't add secrets in code. Everything via `secrets_store_secrets` in `wrangler.jsonc` + `env.X.get()`.
- Don't run `wrangler deploy` directly — `pnpm run deploy` chains build + migrate + deploy.

## Communication Style While Working

- Per-task: state which `T*` you're starting, then make the changes. Don't narrate every file.
- Run `pnpm run cf-typegen` and `pnpm run check` after every binding/schema change. Stop on the first error and fix it.
- After a phase completes, run the verification step from `TASKS.json` for that phase. If it fails, fix before proceeding to the next phase.
- When a task's spec is ambiguous, **stop and ask** — do not invent.

## Stitch + Jules Delegation (cloudflare-jedi)

P8–P10 are frontend-heavy. Per cloudflare-jedi conventions:

- **Stitch:** before writing TSX, generate Stitch mockups for the dashboard, intake modal, role viewport, config page, and email-association page. Review them for gaps (missing states, missing mobile views), fill gaps with additional Stitch calls, then present a summary to the user before building.
- **Jules:** the user has `JULES_API_KEY` configured. Frontend tasks (TSX components, Astro pages, table components, form components) are good candidates for parallel Jules sessions. Backend (wrangler.jsonc, migrations, bindings, AI Gateway, deploy pipeline) **stays with you** — never delegate Cloudflare-specific work to Jules. Maintain `/AGENTS.md` (P11.T11.5) so Jules has a persistent briefing.

## Pre-Deploy Checklist (P12.T12.5)

The user must populate these new secrets before first deploy. Stop and tell them if they aren't set:

```
wrangler secrets-store secret create COOKIE_SIGNING_KEY
wrangler secrets-store secret create NOTEBOOKLM_OAUTH_REFRESH_TOKEN
wrangler secrets-store secret create NOTEBOOKLM_OAUTH_CLIENT_ID
wrangler secrets-store secret create NOTEBOOKLM_OAUTH_CLIENT_SECRET
wrangler secrets-store secret create NOTEBOOKLM_NOTEBOOK_ID
```

Also confirm `AI_GATEWAY_ACCOUNT_ID` is populated in `wrangler.jsonc` `vars` (it's a placeholder in the PRD).

## When You're Done

Report:

1. Tasks completed (by `T*` id) and any deferred.
2. Verification commands run + their outcomes.
3. Open questions (if any) that block production deploy.
4. PR title + summary, ready for the user to publish.

Now read [`PRD.md`](./PRD.md) and [`TASKS.json`](./TASKS.json), then start with **T0.1**.
