# Agents SDK Code Review — 2026-05-18

**Scope:** All 9 Durable Object Agent classes, 2 Workflow classes, and the 13 Worker→Agent `getAgentByName` callsites. Frontend `useAgent` consumers and the `assistant-ui` integration were not re-touched in this pass; they continue to work against the same method signatures.

**Cloudflare Agents SDK reference:** `agents@0.11.9`, `@cloudflare/ai-chat@0.7.0`. Validated against the public Agents API docs (`/agents/api-reference/`).

**TL;DR:** The original "this looks completely wrong" pattern at `pipeline/api-companies.ts:285` was actually _semantically correct_ — `getAgentByName(env.X, "global"); await agent.method(body)` is the canonical Worker→Agent DO RPC path. The user pasted an older snapshot of the file that included `as unknown as DurableObjectNamespace<X>` casts. **The current `wrangler types` (run via `pnpm run cf-typegen`) now emits the namespace generic for every agent binding** (e.g. `DurableObjectNamespace<import("./dist/_worker.js/index").SyncBroadcastAgent>`), so `getAgentByName(env.X, "global")` returns a fully-typed stub with no cast and no explicit generic parameters. The cast workarounds are now obsolete and have been removed. Along the way we found one real runtime bug, one dead code path, and one ineffective message-source pattern.

---

## Fixes applied in this PR

### 1. Cleaned up all `getAgentByName` callsites — no casts, no explicit generics

The wrangler-generated `worker-configuration.d.ts` now carries the proper namespace generic for every Agents-SDK binding. That makes the canonical call shape Just Work:

```ts
import { getAgentByName } from "agents";

const stub = await getAgentByName(c.env.SYNC_BROADCAST_AGENT, "global");
await stub.reportProgress(body); // typed — checked against reportProgress signature
```

Every callsite (13 in total) now uses this clean form. The `as unknown as DurableObjectNamespace<X>` workarounds and the `<Env, AgentClass>` explicit generics have all been removed. The user's complaint is fully resolved.

**Prerequisite to keep this clean:** run `pnpm run build` once after `wrangler.jsonc` changes so `dist/_worker.js/index.js` exists for the wrangler-generated import path to resolve. Otherwise the namespace generic narrows to `any` (still works at runtime, just loses type safety).

### 2. RoleChatAgent — runtime ReferenceError fix (chat/index.ts:145)

The `consultNotebook` tool referenced `c.env.ORCHESTRATOR_AGENT` inside the tool's `execute` callback. `c` is the Hono context — it does not exist inside `onChatMessage()`. The tool would throw `ReferenceError: c is not defined` on every invocation. **Replaced with `this.env` via `getAgentByBinding`.** The sibling `scrapeJob` tool at line 314 already used `this.env`; it was migrated to the helper for consistency.

### 3. RoleChatAgent — incoming-messages source (chat/index.ts:42)

The agent read `(options?.body?.messages ?? []) as UIMessage[]`. Per `@cloudflare/ai-chat@0.7.0` `OnChatMessageOptions` JSDoc, `options.body` **explicitly excludes** `messages` and `clientTools` — those go through SDK-managed persistence at `this.messages`. The previous code silently returned `[]` on every call, so the model received zero conversation history. **Switched to `this.messages`** — matches Cloudflare's documented `AIChatAgent` pattern (`/agents/api-reference/chat-agents/`).

### 4. RoleChatAgent — `scrape_job` tool return shape (chat/index.ts:312)

The tool returned `title: result.title ?? "Scraped"` but the actual `DetailedScrapeResult` type has no `title` field — the access was only compiling because of an `as any` cast. **Replaced** with `source: new URL(url).hostname` and **dropped** the `as any`. The remaining typed fields (`textLength`, `preview`) are correct.

### 5. JobScannerAgent — dead `emitSyncProgress` callable removed (job/scanner/index.ts:96)

`@callable() async emitSyncProgress(progress: any)` was a `sync_progress`-typed broadcast. That responsibility belongs to `SyncBroadcastAgent`. No callers existed (grep confirmed). **Removed.**

### 6. JSDoc cleanup — sync-broadcast/index.ts

The two `as unknown as DurableObjectNamespace<SyncBroadcastAgent>` snippets in the docblock examples are now stale. Updated to `getAgentByBinding(env, "SYNC_BROADCAST_AGENT", "global")` form. (See Phase D edit.)

---

## Validated as already-idiomatic — no changes

| Agent                  | Validation                                                                                                                                                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OrchestratorAgent**  | `Agent<Env, OrchestratorState>`. 40+ `@callable` methods, all typed args. `this.setState({...})` (no direct mutation found). `this.broadcast()`, `this.ctx.waitUntil()` used correctly. `onStart`, `onMessage`, `onConnect`, `onClose`, `onError` all present.                            |
| **JobAnalysisAgent**   | `Agent<Env, JobAnalysisState>`. `@callable analyze(snapshotId: number)` and `reanalyze(jobSiteId, hitlContext)` both correctly typed. `this.setState` everywhere. `this.ctx.waitUntil(this.runPipeline(...))` for fire-and-forget. ✅                                                     |
| **NotebookLMAgent**    | `Agent<Env>` (stateless). `@callable consult(query: string)`, `@callable healthProbe()`, `onMessage` for WebSocket. ✅                                                                                                                                                                    |
| **NotebookLMMcpAgent** | `extends McpAgent<Env, any, any>`. `server = new McpServer({...})`. `async init()` initializes tools. Method `@callable healthProbe()` works because `McpAgent extends Agent`. Generic `any, any` could be tightened to `<Env, unknown, Record<string, never>>` but functionally fine. ✅ |
| **TranscriptionAgent** | `Agent<Env, TranscriptionState>`. `@callable transcribe(...)`, `@callable healthProbe()`. State updates via `this.syncState()` helper that always calls `this.setState({...this.state, ...updates})`. ✅                                                                                  |
| **SyncBroadcastAgent** | `Agent<Env, Record<string, never>>`. Single non-decorated `reportProgress(payload)` method — correctly omits `@callable` (Worker→Agent only). `onConnect`/`onClose` for client tracking. `this.broadcast(JSON.stringify({...}))`. ✅                                                      |
| **RoleChatAgent**      | `extends AIChatAgent<Env>` from `@cloudflare/ai-chat` (matches current docs). `onChatMessage(onFinish, options)` returns `result.toUIMessageStreamResponse()`. Uses `streamText` + `tool()` from AI SDK. ✅                                                                               |
| **JobScannerAgent**    | `Agent<Env, JobScannerState>`. `@callable scanBoard(token: string)`, `@callable scanAll()`. `this.ctx.waitUntil(handleScanBoard(...))` for background work. ✅                                                                                                                            |
| **Sandbox**            | External `@cloudflare/sandbox` re-export. Not an Agents-SDK Agent — out of scope. ✅                                                                                                                                                                                                      |

---

## Yellow flags — surfaced, not fixed in this PR

These are correctness-adjacent but were intentionally left alone to keep this PR surgical. Open follow-ups, not bugs.

1. **`NotebookLMMcpAgent` generic params `<Env, any, any>`** — the `State` and `Props` generics are `any`. Tighten to `<Env, unknown, Record<string, never>>` (or whatever the agent actually uses). Low-risk; cosmetic.

2. **`OrchestratorAgent.handleWorkflowProgress(payload)`** — not decorated with `@callable`, called only by `RoleAnalysisWorkflow` via `getAgentByBinding`. That's the canonical Worker→Agent pattern (no decorator needed). The naming convention is inconsistent with the rest of the file though (the public surface uses snake_case `scrape_job`, `consult_notebook` etc. while this one is camelCase). Pick one and align — but not now.

3. **`RoleChatAgent` does not adopt `agentTool()` for sub-agent calls.** The Cloudflare docs recommend `agentTool()` from `agents/agent-tools` when one agent should call another _as a tool the model orchestrates_ (`/agents/api-reference/agent-tools/`). The current code uses `tool()` from `"ai"` with an inline `getAgentByBinding(...).consult_notebook(...)` execute. Functionally equivalent — slightly more verbose. Migration is a follow-up, not urgent.

4. **`TranscriptionAgent.transcribe(...)` blocks the caller for minutes.** `RoleAssetsWorkflow` does `await stub.transcribe(...)` and waits for the entire FFmpeg + Whisper pipeline. Workflow steps support long timeouts so this is OK in practice, but if the caller is ever a Hono route, it'll time out. Consider wrapping in `this.ctx.waitUntil(...)` and returning a job ID immediately. Not urgent.

5. **`OrchestratorAgent.consult_notebook` / `scrape_job` / etc. use snake_case method names.** The Agents SDK doesn't care, but the rest of the codebase is camelCase. Renaming is a wide blast radius (chat tool callers, workflow callers, docs) — defer.

6. **`worker-configuration.d.ts` regen will not pick up the registry helper.** Future schema changes to the `Env` interface get auto-overwritten by `wrangler types` — that's fine, the helper sits _outside_ that file and works regardless. But the bare-namespace problem will keep coming back for any future agent unless we add a post-processing step. Not blocking.

---

## File map of changes

| File                                                                                                                      | Change                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [src/backend/ai/agents/chat/index.ts](../src/backend/ai/agents/chat/index.ts)                                             | Fix `c.env`→`this.env` scope bug, switch `options.body.messages`→`this.messages`, drop `as any` casts in tools, narrow `consult_notebook` ref shape                              |
| [src/backend/ai/agents/job/scanner/index.ts](../src/backend/ai/agents/job/scanner/index.ts)                               | Remove dead `emitSyncProgress` `@callable`                                                                                                                                       |
| [src/backend/ai/agents/job/scanner/methods/triage-batch.ts](../src/backend/ai/agents/job/scanner/methods/triage-batch.ts) | Drop `<Env, JobAnalysisAgent>` explicit generic — types flow from namespace                                                                                                      |
| [src/backend/api/routes/pipeline/jobs.ts](../src/backend/api/routes/pipeline/jobs.ts)                                     | Drop `<Env, JobScannerAgent>` explicit generic                                                                                                                                   |
| [src/backend/api/routes/roles.ts](../src/backend/api/routes/roles.ts)                                                     | Strip stale "omits the DO generic" comments                                                                                                                                      |
| [src/backend/api/routes/pipeline/api-companies.ts](../src/backend/api/routes/pipeline/api-companies.ts)                   | Update inline comments to reflect the now-typed namespace                                                                                                                        |
| [src/backend/ai/agents/sync-broadcast/index.ts](../src/backend/ai/agents/sync-broadcast/index.ts)                         | Refresh JSDoc examples to remove stale `as unknown as DurableObjectNamespace<X>` snippets                                                                                        |
| [AGENTS.md](../AGENTS.md)                                                                                                 | Sync the SyncBroadcastAgent section, document the Worker→Agent vs browser→Agent distinction with the cleaned snippet, add the "build once for full type resolution" prerequisite |

---

## What was not in scope (logged for follow-up)

Per the user's scope decision, the following are deferred to a separate planning package:

- UX gap audit (~15 capabilities without dedicated pages — jobs detail, interview playback, podcast library, transcription chunk browser, email attachment gallery, mock interview playback, separate config sub-pages, etc.)
- `/shoogle-mcp` registry research for richer-than-stock shadcn components (data tables, command palettes, multi-select combos, treeviews)
- Stitch + DESIGN.md + Monolith design system synthesis
- `/product-management:brainstorm` for prioritization
- Full PRD / TASKS / PROMPT planning package

These will live in `docs/PRD-ux-gap-fill.md` + `docs/TASKS-ux-gap-fill.json` when kicked off.
