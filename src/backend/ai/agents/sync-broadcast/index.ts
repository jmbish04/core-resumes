/**
 * @fileoverview SyncBroadcastAgent — dedicated, single-concern Cloudflare
 * Agents SDK Durable Object for real-time Pipeline dashboard broadcasting.
 *
 * ## Purpose
 * This agent has exactly one responsibility: hold WebSocket connections open
 * for the Pipeline dashboard and fan-out sync-progress events received from
 * the GitHub Action webhook via the Hono API.
 *
 * It contains **no business logic, no D1 queries, and no AI calls**. If you
 * find yourself adding those here, they belong in a different agent or service.
 *
 * ## End-to-end data flow
 *
 * ```
 * [GitHub Action: sync-upstream.py]
 *   │
 *   │  POST /api/pipeline/api-companies/sync-progress
 *   │  Body: { status, current?, total?, message? }
 *   ▼
 * [Hono route: api-companies.ts]
 *   │
 *   │  const agent = await getAgentByName(env.SYNC_BROADCAST_AGENT, "global");
 *   │  await agent.reportProgress(body);   // typed Durable Object RPC
 *   ▼
 * [SyncBroadcastAgent.reportProgress(payload)]   ← this file
 *   │
 *   │  this.broadcast(JSON.stringify({ type: "sync_progress", payload }))
 *   ▼
 * [All connected WebSocket clients (PipelineOperations.tsx)]
 *   │
 *   │  onMessage({ type: "sync_progress", payload }) → update progress bar
 * ```
 *
 * ## @callable vs. Durable Object RPC — IMPORTANT DISTINCTION
 *
 * The `@callable()` decorator is **only** for WebSocket-based RPC from
 * **external** clients (browsers, mobile apps, other services outside the
 * Worker). See:
 * https://developers.cloudflare.com/agents/api-reference/callable-methods/
 *
 * When calling an Agent **from the same Worker** (which is this case — a
 * Hono route handler calling this Agent), the correct pattern is:
 *
 * ```ts
 * // ✅ Correct: Worker → Agent via getAgentByName. The wrangler-generated
 * //    namespace generic delivers a typed stub with no cast needed.
 * import { getAgentByName } from "agents";
 *
 * const agent = await getAgentByName(env.SYNC_BROADCAST_AGENT, "global");
 * await agent.reportProgress(body);   // direct DO method call, fully typed
 *
 * // ❌ Wrong: @callable + stub.fetch("/rpc/...") — for browser WebSocket clients only
 * // ❌ Wrong: (stub as any).method()   — silently fails
 * ```
 *
 * ## WebSocket client (frontend)
 *
 * The Pipeline dashboard subscribes using the Agents SDK React hook:
 * ```tsx
 * useAgent({
 *   agent: "SyncBroadcastAgent",   // must match the exported class name
 *   name: "global",               // must match idFromName() on the server
 *   onMessage: (msg) => { ... },
 * });
 * ```
 *
 * `routeAgentRequest` in `src/_worker.ts` automatically upgrades the HTTP
 * request to a WebSocket at `/agents/SyncBroadcastAgent/global` — no custom
 * HTTP handler is needed.
 *
 * ## wrangler.jsonc registration
 *
 * ```jsonc
 * // durable_objects.bindings:
 * { "name": "SYNC_BROADCAST_AGENT", "class_name": "SyncBroadcastAgent" }
 *
 * // migrations:
 * { "tag": "v5", "new_sqlite_classes": ["SyncBroadcastAgent"] }
 * ```
 *
 * Run `pnpm run cf-typegen` after any binding name change.
 *
 * ## Singleton pattern
 *
 * The agent is always instantiated as a singleton using `"global"` as the
 * name. This guarantees a single DO instance per deployment that all
 * dashboard tabs connect to, ensuring every open tab receives every broadcast.
 *
 * @module sync-broadcast
 * @see {@link https://developers.cloudflare.com/agents/} Cloudflare Agents SDK
 * @see {@link https://developers.cloudflare.com/agents/api-reference/callable-methods/} @callable docs
 * @see {@link /AGENTS.md#aggregator-sync--websocket-broadcasting} AGENTS.md section
 */

import { Agent, type Connection } from "agents";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Shape of the progress event emitted by the GitHub Action sync script and
 * relayed to all connected WebSocket clients.
 *
 * Matches the `syncProgressBody` Zod schema in
 * `src/backend/api/routes/pipeline/types.ts`.
 */
export type SyncProgressPayload = {
  /** Lifecycle stage of the sync run, e.g. "running", "completed", "failed". */
  status: string;
  /** Current item index (used to compute % complete on the frontend). */
  current?: number;
  /** Total item count for the current run. */
  total?: number;
  /** Human-readable status message shown in the dashboard progress bar. */
  message?: string;
};

/**
 * Wire envelope wrapping every broadcast message sent over WebSocket.
 * The `type` discriminator lets the frontend route messages correctly even
 * if additional event types are added in the future.
 */
type BroadcastEnvelope = {
  type: "sync_progress";
  payload: SyncProgressPayload;
};

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

/**
 * SyncBroadcastAgent
 *
 * A single-purpose Cloudflare Agents SDK Durable Object whose sole
 * responsibility is to maintain WebSocket connections from the Pipeline
 * dashboard and fan-out sync-progress events via `this.broadcast()`.
 *
 * **State:** Intentionally stateless — `Record<string, never>`.
 * No D1 writes, no AI calls, no business logic.
 *
 * **Instance name:** Always `"global"` (singleton per deployment).
 *
 * **Invocation pattern:** Worker → Agent Durable Object RPC via
 * `getAgentByName(env.SYNC_BROADCAST_AGENT, "global")` from the Agents SDK.
 * No `@callable()` decorator is needed or used here since this method is only
 * called from within the same Worker, never from a browser WebSocket client.
 *
 * @example Called from the Hono route (Worker → Agent DO RPC)
 * ```ts
 * import { getAgentByName } from "agents";
 *
 * const agent = await getAgentByName(env.SYNC_BROADCAST_AGENT, "global");
 * await agent.reportProgress({ status: "running", current: 10, total: 100 });
 * ```
 *
 * @example Frontend WebSocket subscription
 * ```tsx
 * const agent = useAgent({
 *   agent: "SyncBroadcastAgent",
 *   name: "global",
 *   onMessage: (msg) => {
 *     // msg = { type: "sync_progress", payload: { status, current, total, message } }
 *     setSyncProgress(Math.round((msg.payload.current / msg.payload.total) * 100));
 *   },
 * });
 * ```
 */
export class SyncBroadcastAgent extends Agent<Env, Record<string, never>> {
  // -------------------------------------------------------------------------
  // WebSocket lifecycle hooks
  // -------------------------------------------------------------------------

  /**
   * Called by the Agents SDK each time a client opens a WebSocket connection
   * to this agent (i.e., when the Pipeline dashboard tab loads and the
   * `useAgent` hook establishes the socket).
   *
   * @param connection - SDK-managed connection object. `connection.id` is a
   *   unique identifier for this specific WebSocket session.
   */
  onConnect(connection: Connection): void {
    console.log(`[SyncBroadcastAgent] client connected – id=${connection.id}`);
  }

  /**
   * Called by the Agents SDK when a client WebSocket connection is closed,
   * either cleanly (tab closed, navigate away) or due to network error.
   *
   * @param connection - The connection that was closed.
   */
  onClose(connection: Connection): void {
    console.log(`[SyncBroadcastAgent] client disconnected – id=${connection.id}`);
  }

  // -------------------------------------------------------------------------
  // Durable Object RPC methods (called from Worker via getAgentByName)
  // -------------------------------------------------------------------------

  /**
   * Fan-out a sync-progress event to **all** currently connected WebSocket
   * clients (i.e., every open Pipeline dashboard tab).
   *
   * Invoked by the Hono route `POST /api/pipeline/api-companies/sync-progress`
   * via Durable Object RPC through `getAgentByName`. No `@callable()` is
   * needed since this is a Worker-to-Agent call, not a browser-to-agent call.
   *
   * The message is wrapped in a `BroadcastEnvelope` before broadcasting so
   * the frontend can distinguish it from other event types using the `type`
   * discriminator.
   *
   * @param payload - Progress event from the GitHub Action sync script.
   *
   * @example Received by the React dashboard:
   * ```ts
   * onMessage: (msg) => {
   *   // msg = { type: "sync_progress", payload: { status, current, total, message } }
   *   setSyncProgress(Math.round((msg.payload.current / msg.payload.total) * 100));
   * }
   * ```
   */
  async reportProgress(payload: SyncProgressPayload): Promise<void> {
    const envelope: BroadcastEnvelope = { type: "sync_progress", payload };
    this.broadcast(JSON.stringify(envelope));
  }

  // -------------------------------------------------------------------------
  // Static metadata (consumed by /api/agents/docs live documentation route)
  // -------------------------------------------------------------------------

  /**
   * Returns structured metadata consumed by `src/backend/api/routes/docs.ts`
   * to generate the live Agent documentation page at `/docs/agents`.
   *
   * Keep this in sync with any new methods added to this class.
   */
  static docsMetadata() {
    return {
      name: "Sync Broadcast",
      className: "SyncBroadcastAgent",
      description:
        "Single-purpose Agent that holds WebSocket connections from the Pipeline " +
        "dashboard and fans-out sync-progress events from the GitHub Action webhook " +
        "via Durable Object RPC (getAgentByName). Contains no business logic.",
      docsPath: "/docs/agents/sync-broadcast",
      invocationPattern: "Worker → Agent DO RPC via getAgentByName — NOT @callable",
      methods: [
        {
          name: "reportProgress",
          description:
            "Fan-out a sync-progress event to all connected WebSocket clients. " +
            "Called by POST /api/pipeline/api-companies/sync-progress via " +
            "getAgentByName + typed namespace generic. No @callable decorator.",
          params: "payload: SyncProgressPayload",
          returns: "Promise<void>",
        },
      ],
    };
  }
}
