# Agents SDK Repair + Comprehensive Code Review

## Context

User flagged the `getAgentByName<Env, SyncBroadcastAgent>(... as unknown as DurableObjectNamespace<SyncBroadcastAgent>, ...)` pattern in [src/backend/api/routes/pipeline/api-companies.ts:285](src/backend/api/routes/pipeline/api-companies.ts:285) as "completely wrong" and asked for a Cloudflare-Agents-SDK-correct repair, a comprehensive code review, and docs sync. A follow-up package (PRD + TASKS + Stitch + shoogle UX gap pages) is intentionally deferred.

### What the audit actually found

**The semantic pattern is correct** — `getAgentByName(env.SYNC_BROADCAST_AGENT, "global"); await agent.reportProgress(body)` is the canonical Worker-to-Agent Durable Object RPC from the Agents SDK docs (`/agents/api-reference/callable-methods/`, "Why the distinction" table). `reportProgress` correctly omits `@callable()` because it's Worker→Agent, not browser→Agent.

**The friction is purely the type system.** `worker-configuration.d.ts` emits bare `DurableObjectNamespace /* OrchestratorAgent */` (no generic), so callsites need `as unknown as DurableObjectNamespace<SyncBroadcastAgent>` casts to recover typed RPC. This is a root cause that propagates to every callsite.

**Real bugs found while there:**

1. [src/backend/ai/agents/chat/index.ts:145](src/backend/ai/agents/chat/index.ts:145) — `consultNotebook` tool uses `c.env.ORCHESTRATOR_AGENT` but `c` is **not in scope** inside `onChatMessage`. Must be `this.env.ORCHESTRATOR_AGENT`. This tool currently throws `ReferenceError` at runtime. The `scrapeJob` tool at line ~312 has the same bug.
2. Agent method name drift: tools call `stub.consult_notebook(query)` (snake_case) — Orchestrator does expose `consult_notebook` and `scrape_job` (snake_case), so the names match — but other tools likely have stale signatures. Need to grep and verify.
3. `RoleChatAgent.onChatMessage` reads `options?.body?.messages` and `options?.body?.system` — the current `@cloudflare/ai-chat@0.7.0` `OnChatMessageOptions` shape needs verification against `this.messages` (the canonical persisted history) before any of this is trusted.
4. `JobScannerAgent.emitSyncProgress(progress: any)` (line 96) is `@callable` and broadcasts a `sync_progress` event — that's the SyncBroadcastAgent's job. Dead/duplicate code.

**What the comprehensive review covers:** the 9 DO classes, 2 Workflows, all 13 `getAgentByName` callsites, the Hono routes that touch them, `AGENTS.md`, and the docs surface at `/docs/agents/*` and the live `/api/agents/docs` route.

**Out of scope (deferred to follow-up):** UX gap pages, shoogle component research, Stitch mockups, new frontend routes.

---

## The plan

### Phase A — Type-safe Env bindings (root cause)

**Goal:** make every `getAgentByName(env.X, ...)` callsite return a properly typed stub with no casts.

**Approach:** create a hand-maintained type augmentation that re-declares the agent + workflow bindings with generic parameters. Do **not** edit `worker-configuration.d.ts` (auto-generated, will be clobbered by `wrangler types`).

1. Create [src/env.d.ts](src/env.d.ts) with `declare global { interface Env { ... } }` redeclaring only the agent/workflow bindings:

   ```ts
   import type { OrchestratorAgent } from "@/backend/ai/agents/orchestrator";
   import type { JobScannerAgent } from "@/backend/ai/agents/job/scanner";
   // ... etc. for all 9 agents

   declare global {
     interface Env {
       ORCHESTRATOR_AGENT: DurableObjectNamespace<OrchestratorAgent>;
       NOTEBOOKLM_AGENT: DurableObjectNamespace<NotebookLMAgent>;
       NOTEBOOKLM_MCP_AGENT: DurableObjectNamespace<NotebookLMMcpAgent>;
       TRANSCRIPTION_AGENT: DurableObjectNamespace<TranscriptionAgent>;
       JOB_SCANNER_AGENT: DurableObjectNamespace<JobScannerAgent>;
       JOB_ANALYSIS_AGENT: DurableObjectNamespace<JobAnalysisAgent>;
       SYNC_BROADCAST_AGENT: DurableObjectNamespace<SyncBroadcastAgent>;
       ROLE_CHAT_AGENT: DurableObjectNamespace<RoleChatAgent>;
       SANDBOX: DurableObjectNamespace<Sandbox>;
       // Workflows
       ROLE_ASSETS_WORKFLOW: Workflow<RoleAssetsWorkflowParams>;
       ROLE_ANALYSIS_WORKFLOW: Workflow<RoleAnalysisWorkflowParams>;
     }
   }
   export {};
   ```

2. Verify [tsconfig.json](tsconfig.json) `include` already covers `src/**/*.d.ts` (it should — the existing `worker-configuration.d.ts` reference is in `compilerOptions.types` or `include`).
3. Strip every `as unknown as DurableObjectNamespace<X>` cast at all 13 callsites identified by the audit. Replace with the clean form:
   ```ts
   const agent = await getAgentByName(c.env.SYNC_BROADCAST_AGENT, "global");
   await agent.reportProgress(body);
   ```
4. Run `pnpm run types` (which is `cf-typegen && tsc --noEmit`) and confirm zero new errors.

**Critical files:**

- [src/env.d.ts](src/env.d.ts) (new)
- [src/backend/api/routes/pipeline/api-companies.ts:285](src/backend/api/routes/pipeline/api-companies.ts:285)
- [src/backend/api/routes/pipeline/jobs.ts:74](src/backend/api/routes/pipeline/jobs.ts:74)
- [src/backend/api/routes/roles.ts:233](src/backend/api/routes/roles.ts:233), [:289](src/backend/api/routes/roles.ts:289)
- [src/backend/ai/agents/job/scanner/methods/triage-batch.ts:21](src/backend/ai/agents/job/scanner/methods/triage-batch.ts:21)
- [src/backend/ai/agents/orchestrator/health.ts:38](src/backend/ai/agents/orchestrator/health.ts:38)
- [src/backend/ai/agents/notebooklm/health.ts:20](src/backend/ai/agents/notebooklm/health.ts:20)
- [src/backend/ai/agents/transcription/health.ts:57](src/backend/ai/agents/transcription/health.ts:57)
- [src/backend/workflows/role-assets.ts:383](src/backend/workflows/role-assets.ts:383)
- [src/backend/workflows/role-analysis.ts:65](src/backend/workflows/role-analysis.ts:65)
- [src/backend/ai/agents/chat/index.ts](src/backend/ai/agents/chat/index.ts) (lines 144, ~312)
- [src/backend/ai/agents/orchestrator/index.ts:599](src/backend/ai/agents/orchestrator/index.ts:599)

### Phase B — Fix the real RoleChatAgent bugs

**Goal:** `RoleChatAgent`'s tool implementations actually work at runtime.

1. **Scope bug** — [src/backend/ai/agents/chat/index.ts:145](src/backend/ai/agents/chat/index.ts:145): change `c.env.ORCHESTRATOR_AGENT` → `this.env.ORCHESTRATOR_AGENT`. Apply the same fix in `scrapeJob` (~line 312).
2. **Verify tool→method names** — `consult_notebook(query)` and `scrape_job(url)` exist on Orchestrator and accept the right shape. For each of the 5 tools (`consultNotebook`, `searchCareerMemory`, `draftDocument`, `generateMockInterview`, `scrapeJob`), check:
   - Tool input zod schema matches downstream method signature
   - Downstream method exists and is reachable from the agent (callable RPC or Worker→Agent DO RPC — both fine since same Worker)
   - Return shape matches what the LLM expects (the `consultNotebook` tool maps `result.references` → `sources` — confirm `consult_notebook` actually returns `references`)
3. **`OnChatMessageOptions` shape** — Confirm against `@cloudflare/ai-chat@0.7.0` types. The current code reads `options?.body?.messages`, but the canonical pattern in CF docs is `this.messages` (SDK-managed persistence). If `this.messages` is the source of truth, the `incomingMessages` variable is redundant and may drift. Verify and reconcile — prefer `this.messages` for consistency with `useAgentChat`.
4. **Remove `JobScannerAgent.emitSyncProgress`** ([src/backend/ai/agents/job/scanner/index.ts:96-99](src/backend/ai/agents/job/scanner/index.ts:96)) — duplicates SyncBroadcastAgent's job and is dead. Confirm by grep for callsites before deleting.

### Phase C — Idiomatic patterns across all agents (light touch)

**Goal:** find and surface any other Agents-SDK-incorrect patterns without rewriting working code.

For each of the 9 DO classes, validate against `/agents/api-reference/`:

| Agent                | Validation                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OrchestratorAgent`  | Confirm: `Agent<Env, State>`, `@callable` on RPC methods, `this.broadcast()` for fan-out, `this.setState()` for state changes (no direct `this.state = …`).                                            |
| `RoleChatAgent`      | Phase B above. Also confirm `extends AIChatAgent<Env>` and import `from "@cloudflare/ai-chat"` (matches current docs — verified).                                                                      |
| `SyncBroadcastAgent` | Already correct. No changes besides removing the cast at the callsite (Phase A).                                                                                                                       |
| `JobScannerAgent`    | Already RPC-style (`scanBoard(token: string)`). Confirm. Remove `emitSyncProgress` (Phase B step 4).                                                                                                   |
| `JobAnalysisAgent`   | Confirm RPC-style methods.                                                                                                                                                                             |
| `NotebookLMAgent`    | Confirm.                                                                                                                                                                                               |
| `NotebookLMMcpAgent` | `extends McpAgent<Env, any, any>` — verify the third generic arg is intended (`McpAgent<Env, State, Props>`). Confirm `init()` is the right entrypoint and the MCP transport is wired in `_worker.ts`. |
| `TranscriptionAgent` | Confirm state management uses `this.setState` not direct mutation.                                                                                                                                     |
| `Sandbox`            | External `@cloudflare/sandbox` re-export — leave alone.                                                                                                                                                |

Output a one-page **Code Review Report** as a comment in the PR (or written file at [`docs/CODE-REVIEW-2026-05-18.md`](docs/CODE-REVIEW-2026-05-18.md)) listing:

- Pattern violations found and fixed
- Pattern violations found and left alone (with rationale)
- Open questions for the user

### Phase D — Docs sync

**Goal:** the docs the user navigates to are accurate after the repairs.

1. **`AGENTS.md`** ([AGENTS.md](AGENTS.md)) — sync the "Agents and Workflows" section with the actual current state:
   - All 9 DO agent classes + 2 Workflows + their bindings
   - The Worker→Agent vs browser→Agent RPC distinction (with the corrected snippet)
   - The new `src/env.d.ts` augmentation pattern documented as the canonical way to reach an agent
2. **`/docs/agents/*` doc pages** ([src/frontend/pages/docs/](src/frontend/pages/docs/) or wherever they live per [src/pages/docs/[...slug].astro](src/pages/docs/%5B...slug%5D.astro)) — update the SyncBroadcastAgent and RoleChatAgent doc pages to remove the cast example and to reflect any signature changes.
3. **Live `/api/agents/docs` route** — the `static docsMetadata()` blocks on each agent feed this route. Confirm no metadata drift after Phase B/C (e.g., `JobScannerAgent.docsMetadata` should no longer advertise `emitSyncProgress` if removed).
4. **`CLAUDE.md` is owned by `pdfx-cli skills init`** — do not touch.

### Phase E — Verification

1. **Type check:** `pnpm run types` → zero errors.
2. **Lint:** `pnpm run check` (oxlint + oxfmt) → clean.
3. **Local dev smoke:** `pnpm run dev`, then open `/pipeline`, trigger a sync, watch the WebSocket frame for `{ type: "sync_progress", payload: {...} }`. Confirms SyncBroadcastAgent is reachable end-to-end.
4. **Chat agent smoke:** open a role detail page, fire a chat message that uses `consultNotebook` — confirm no `ReferenceError: c is not defined` in the tail logs.
5. **`wrangler tail`** during smoke runs: no DO RPC failures, no cast-related runtime errors.
6. **Docs route smoke:** open `/api/agents/docs` and `/docs/agents/sync-broadcast` — content reflects the post-repair state.

---

## Critical files touched (summary)

| Phase | File                                                                                     | Reason                                                     |
| ----- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| A     | [src/env.d.ts](src/env.d.ts)                                                             | NEW — typed Env augmentation                               |
| A     | All 13 `getAgentByName` callsites                                                        | Strip `as unknown as` casts                                |
| B     | [src/backend/ai/agents/chat/index.ts](src/backend/ai/agents/chat/index.ts)               | Fix `c.env` → `this.env` scope bug, verify tool signatures |
| B     | [src/backend/ai/agents/job/scanner/index.ts](src/backend/ai/agents/job/scanner/index.ts) | Remove dead `emitSyncProgress`                             |
| C     | All 9 agent class files                                                                  | Light-touch pattern audit, surface to report               |
| C     | [docs/CODE-REVIEW-2026-05-18.md](docs/CODE-REVIEW-2026-05-18.md)                         | NEW — code review report                                   |
| D     | [AGENTS.md](AGENTS.md)                                                                   | Sync agents section                                        |
| D     | `src/pages/docs/...` agent doc pages                                                     | Reflect repairs                                            |

## Existing utilities reused

- `getAgentByName` from `"agents"` (Cloudflare Agents SDK 0.11.9) — confirmed via `/agents/api-reference/routing/` docs as `Promise<DurableObjectStub<T>>` with `namespace: DurableObjectNamespace<T>` signature.
- `Agent` and `AIChatAgent` base classes — keep as-is.
- `this.broadcast()`, `this.setState()`, `this.sql` — keep as-is per `/agents/concepts/agent-class/`.
- `static docsMetadata()` pattern — already present on every agent, feeding `/api/agents/docs`. Keep and update in-place.

## Follow-up (deferred, not part of this plan)

Logged for a separate session:

- UX gap audit (15+ capabilities without pages identified by exploration agent)
- `/shoogle-mcp` registry research for richer-than-stock shadcn components (jobs detail, interview playback, podcast library, email thread view, transcription chunk browser, etc.)
- Stitch + DESIGN.md + new page generation via `current-agent` orchestration
- `/product-management:brainstorm` for prioritization
- Full PRD + TASKS + PROMPT planning package

These will live in a new `docs/PRD-ux-gap-fill.md` + `docs/TASKS-ux-gap-fill.json` once kicked off.
