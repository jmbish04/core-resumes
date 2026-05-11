# Coding-Agent Initializer — `core-resumes` Comprehensive Health Service (Phase 0004)

You are the senior Cloudflare engineer responsible for rebuilding the health service in the `core-resumes` Worker per the spec in [`PRD.md`](./PRD.md). This file is your initialization brief. **Read everything below before touching code.**

---

## Your Job

Execute the build defined in [`TASKS.json`](./TASKS.json) in dependency order. The PRD is the spec; TASKS.json is the build queue. Treat them as authoritative — if you find yourself wanting to deviate, stop and ask first.

## Inputs You Must Read First

1. **`docs/0004_health/PRD.md`** — full architecture, schema, per-check specs, verification.
2. **`docs/0004_health/TASKS.json`** — phased task list with dependencies, files, actions, and acceptance criteria. **This is your queue.**
3. **`docs/cloudflare-docs/agents-llm-full.md`** — authoritative source for `@callable()`, `getAgentByName()`, and Agents SDK patterns. Specifically:
   - Lines **6556–6814** — `@callable()` decorator semantics, definition syntax, and the "When to use" decision matrix at 6658–6667.
   - Lines **8016+** and **30389+** — `getAgentByName()` usage and routing.
4. **`tsconfig.json`** — confirms path aliases (`@/*` → src/{frontend,backend}/_; `@db/_`, `@ai/_`, `@logging/_`, `@modules/\*`). **Use these aliases everywhere.** Never import via `../../foo`.
5. **`wrangler.jsonc`** — current bindings. After T2.1 adds `RESUME_TEMPLATE_DOC_ID`, run `pnpm run cf-typegen` so the Env interface picks it up.
6. **`worker-configuration.d.ts`** — auto-generated. Never hand-edit.

## Execution Order — Non-Negotiable

```
P1 Shared types + new schema (health_runs, health_results, health_test_definitions)
  ↓
P2 wrangler.jsonc env var (RESUME_TEMPLATE_DOC_ID) + cf-typegen
  ↓
P3 Modular health.ts files (one per subsystem, 11 tasks — many can run in parallel)
  ↓
P4 Coordinator + Hono routes + _worker.ts scheduled handler
  ↓
P5 Frontend updates (HealthDashboard, HealthBadge)
  ↓
P6 Cleanup (delete services/health.ts, drop health_screenings table)
  ↓
P7 End-to-end verification (PRD §14 — all 15 steps)
```

**P3 tasks are mostly independent** once P1 + P2 are done — run them in parallel when their `depends_on` allows. P3.5 and P3.6 must run sequentially (rename method first, then update callers).

## Modularization — Treat as Load-Bearing

These principles are **why the user accepted the plan** — never collapse them for convenience:

1. **Every modular `health.ts` exports `checkHealth(env: Env): Promise<HealthStepResult>`** — identical signature, no exceptions. Co-located with the module it tests.
2. **`src/health/coordinator.ts` is the only file that imports from `*/health.ts`** — modular files never import the coordinator.
3. **Use tsconfig path aliases** — `@/db/health`, `@ai/health`, `@ai/agents/orchestrator/health`, never `../../../db/health`.
4. **One file per modular check.** No "shared health utils" file beyond `safeRun` (which is small enough to copy-paste into each check).
5. **Adding a new check = one new file + one line in the coordinator's CHECKS array.** Nothing else should change.

## Golden Rules (from cloudflare-jedi)

- **`worker-configuration.d.ts` is auto-generated.** Run `pnpm run cf-typegen` (or `wrangler types`) after every `wrangler.jsonc` change. Never hand-edit.
- **`Env` is global.** Don't import it. Don't redefine it.
- **Health checks must actually exercise the subsystem.** A `return { status: 'ok' }` is a bug, not a check.
- **Validate response SHAPE, not just HTTP 200.** A 200 with the wrong Content-Type is a failure.
- **`safeRun` wraps every sub-check.** A single sub-check crash must not kill the suite.
- **Run sub-checks in parallel** with `Promise.all` when independent.
- **Migrations:** always `pnpm run db:generate`. Never hand-edit `drizzle/*.sql`.
- **Deploy:** always `pnpm run deploy`. Never `wrangler deploy` directly.
- **Frontend:** dark shadcn default. Never `window.alert/confirm/prompt`. No mock data — every value comes from a real API call.
- **OpenAPI doc routes** (`/openapi.json`, `/scalar`, `/swagger`) are dynamic — derived from drizzle-zod via `@hono/zod-openapi`. Never hardcode.

## Decisions Already Made (do NOT relitigate)

| Decision             | Resolution                                                                                                                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File layout          | Migrate to `src/health/` per cloudflare-jedi. Use tsconfig aliases throughout.                                                                                                                                                                                               |
| Schema               | Split into `health_runs` + `health_results` + `health_test_definitions`. Drop `health_screenings` in P6.                                                                                                                                                                     |
| Agent RPC            | Add `@callable()` to **all four** agents incl. `NotebookLMMcpAgent`. Rename method to `healthProbe`. Coordinator uses `getAgentByName(env.X, 'health-probe').healthProbe()`. Instance name `'health-probe'` is a stable convention so probe state is consistent across runs. |
| Drive lifecycle      | **Retain the most recent prior run's docs.** Delete only docs older than the most recent. The frontend exposes `createdDocUrls` and `folderUrls` as clickable links so the user can manually verify styling — automated checks can't catch "doc rendered but styled wrong".  |
| New subsystem checks | Bindings sweep (BROWSER / R2 / EMAIL_OUT / SESSIONS KV / SANDBOX standalone), API route shape validation (loopback fetch), D1 table scan (warning-level), Auth round-trip (with/without WORKER_API_KEY).                                                                     |

## Agent `@callable()` Pattern — Read This Carefully

Per [`docs/cloudflare-docs/agents-llm-full.md`](../cloudflare-docs/agents-llm-full.md) lines 6658–6667:

> | Worker calling agent (same codebase) | Durable Object RPC (no decorator needed) |
> | Agent calling another agent | Durable Object RPC via getAgentByName() |

`@callable()` is **strictly required** only for browser/external WebSocket RPC. It is **harmless** when also called via DO RPC from a Worker. Per the user's decision, add `@callable()` to all four agents — this catches the case where the health page calls the probe directly via `useAgent`'s `agent.stub.healthProbe()` over WebSocket from the browser, AND lets the coordinator call it via DO RPC `getAgentByName(...).healthProbe()` server-side.

Each agent class in its `index.ts`:

```typescript
import { Agent, callable } from "agents";
import { healthProbe } from "./health";

export class OrchestratorAgent extends Agent<Env, OrchestratorState> {
  // ... existing methods ...

  @callable()
  async healthProbe(): Promise<HealthStepResult> {
    return healthProbe(this, this.env);
  }
}
```

**`NotebookLMMcpAgent` is currently missing `@callable()` — add it during T3.6.** It extends `McpAgent`; `@callable()` works on McpAgent subclasses.

The coordinator-side bridge in each agent's `health.ts`:

```typescript
export async function checkHealth(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  if (!env.ORCHESTRATOR_AGENT) {
    return {
      name: "OrchestratorAgent",
      status: "failure",
      message: "binding missing",
      durationMs: 0,
    };
  }
  try {
    const stub = await getAgentByName<Env, OrchestratorAgent>(
      env.ORCHESTRATOR_AGENT,
      "health-probe",
    );
    if (!stub) throw new Error("getAgentByName returned null");
    const probeStart = Date.now();
    const report = await stub.healthProbe();
    if (typeof report?.status !== "string") throw new Error("malformed healthProbe response");
    return {
      ...report,
      name: "OrchestratorAgent",
      durationMs: Date.now() - start,
      details: { ...report.details, probeMs: Date.now() - probeStart },
    };
  } catch (e: any) {
    return {
      name: "OrchestratorAgent",
      status: "failure",
      message: e.message,
      durationMs: Date.now() - start,
      details: { errorName: e.name },
    };
  }
}
```

`details.probeMs` is used during verification (PRD §14 step 13) to confirm the coordinator actually opened a stub and called `healthProbe`, rather than returning a stale fallback.

## Health Check Quality Bar — Every Check Must Clear All 6

1. Actually call the binding/endpoint — never fake.
2. Measure latency with `Date.now()` before/after each sub-check.
3. Run sub-checks in parallel (`Promise.all`) when independent.
4. Validate response shape, not just HTTP 200.
5. Wrap every sub-check in `safeRun`.
6. Surface enough `details` for a developer to diagnose without re-running.

| ❌ Lazy (never acceptable)     | ✅ Comprehensive (required)                                   |
| ------------------------------ | ------------------------------------------------------------- |
| `return { status: 'success' }` | Actually call the binding/endpoint                            |
| HTTP 200 = healthy             | Validate response shape matches what the frontend expects     |
| No latency measurement         | `Date.now()` before/after each sub-check                      |
| Crash = unknown                | `safeRun` wraps every sub-check; crash = failure with details |
| Single check per module        | Sub-checks per capability                                     |
| No details                     | Enough details to diagnose without re-running                 |

## What You Must NOT Do

- Don't introduce relative imports — use the tsconfig aliases.
- Don't write health checks that just check binding presence — the check must invoke the subsystem and validate the response shape.
- Don't delete `services/health.ts` until P6 — the migration is staged so the dev server keeps working in between phases.
- Don't hand-edit `drizzle/*.sql` migrations — `pnpm run db:generate` only.
- Don't hand-edit `worker-configuration.d.ts` — `pnpm run cf-typegen` only.
- Don't add backward-compat shims for `{ screening: { resultsJson } }` — frontend migrates in P5 in lockstep with the route refactor in P4.
- Don't run `wrangler deploy` directly — `pnpm run deploy` chains build + db:generate + migrate:remote + wrangler deploy.
- Don't send actual email from `EMAIL_OUT` health check — only construct + serialize a MIMEMessage.
- Don't write the BROWSER probe such that it leaks browser instances — always close in a `finally` block.
- Don't bypass `safeRun` for "simple" sub-checks — uniform error handling matters more than 5 saved lines.

## Communication Style While Working

- Per-task: state which `T*` you're starting, then make the changes. Don't narrate every file.
- Run `pnpm run cf-typegen` and `pnpm exec tsc --noEmit` after every binding/schema change. Stop on the first error and fix it.
- After a phase completes, run the verification step from `TASKS.json` for that phase. If it fails, fix before proceeding to the next phase.
- When a task's spec is ambiguous, **stop and ask** — do not invent.
- Capture the exact `health_results.details` payload of any failure during P7 verification — that's the artifact the user reviews.

## Pre-Deploy Checklist

The user must populate `RESUME_TEMPLATE_DOC_ID` in `wrangler.jsonc` before deploy. Stop and tell them if it's still the placeholder.

## When You're Done

Report:

1. Tasks completed (by `T*` id) and any deferred.
2. Verification commands run + their outcomes (PRD §14 steps 1–15).
3. Open questions (if any) that block production deploy.
4. PR title + summary, ready for the user to publish.

Now read [`PRD.md`](./PRD.md) and [`TASKS.json`](./TASKS.json), then start with **T1.1**.
