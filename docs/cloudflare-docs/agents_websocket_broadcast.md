Contacting Cloudflare Docs Agent (Session: docs-1779100856597)...

Cloudflare Docs Agent:

## Building a **SyncBroadcastAgent** – a single‑purpose Cloudflare Agents SDK agent that

- keeps a WebSocket connection alive for the Pipeline dashboard, and
- fans‑out “sync‑progress” events to every connected client.

The answer is built from the official Cloudflare documentation that you provided:

| Piece of the puzzle                                                                                       | Where it lives in the docs      |
| --------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **WebSocket enablement** – you must turn on the `WebSockets` toggle for your zone (or use the API).       | _WebSockets_ page               |
| **Agents SDK core features** – persistent state, real‑time sync, automatic WebSocket handling.            | _Building agents on Cloudflare_ |
| **Broadcasting to clients** – the SDK method `this.broadcastToClients(...)` (shown in workflow examples). | _AgentWorkflow_ code samples    |

Below is a step‑by‑step guide that ties those pieces together.

---

## 1. Implement the **SyncBroadcastAgent**

The SDK gives you two built‑in hooks that are perfect for a “keep‑alive & fan‑out” agent:

| Hook                          | What it does                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| `onClientConnect(client)`     | Called each time a dashboard (or any other consumer) opens a WebSocket to the agent’s **/sync** endpoint. |
| `broadcastToClients(payload)` | Sends a JSON message to **all** currently‑connected WebSocket clients.                                    |

Below is a minimal, production‑ready implementation.

```ts
// src/agent.ts
import { Agent } from "agents";

export class SyncBroadcastAgent extends Agent {
  /* -------------------------------------------------------------
   *  Lifecycle hooks – useful for logging / metrics
   * ------------------------------------------------------------ */
  async onClientConnect(client) {
    console.log(`[SyncBroadcast] client connected – id=${client.id}`);
  }

  async onClientDisconnect(client) {
    console.log(`[SyncBroadcast] client disconnected – id=${client.id}`);
  }

  /* -------------------------------------------------------------
   *  Public method that your Pipeline code calls whenever there
   *  is new progress to report.
   * ------------------------------------------------------------ */
  /**
   * Publish a progress event to every dashboard that is listening.
   *
   * @param taskId   Unique identifier for the pipeline run
   * @param percent  Number between 0‑100
   * @param message  Human‑readable description (optional)
   */
  async publishProgress(taskId: string, percent: number, message?: string): Promise<void> {
    // The SDK automatically serialises the object to JSON and pushes it
    // over the open WebSocket connections.
    await this.broadcastToClients({
      type: "progress",
      taskId,
      percent,
      message,
    });
  }

  /* -------------------------------------------------------------
   *  (Optional) Persist progress in the built‑in SQLite DB.
   *  This lets a newly‑connected client instantly receive the latest
   *  state without waiting for the next broadcast.
   * ------------------------------------------------------------ */
  async getLastProgress(taskId: string) {
    const row = await this.db
      .prepare("SELECT percent, message FROM progress WHERE task_id = ? ORDER BY ts DESC LIMIT 1")
      .get(taskId);
    return row ?? null;
  }

  async storeProgress(taskId: string, percent: number, message?: string) {
    await this.db
      .prepare(
        "INSERT INTO progress (task_id, percent, message, ts) VALUES (?, ?, ?, CURRENT_TIMESTAMP)",
      )
      .run(taskId, percent, message ?? null);
  }

  /**
   * Convenience wrapper that both stores the state and fans it out.
   */
  async reportAndPersist(taskId: string, percent: number, message?: string) {
    await this.storeProgress(taskId, percent, message);
    await this.publishProgress(taskId, percent, message);
  }
}

/* -------------------------------------------------------------
 *  Register the agent with the runtime (required by the SDK)
 * ------------------------------------------------------------ */
export default new SyncBroadcastAgent();
```

### What the code does

| Section                                                 | Explanation                                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`onClientConnect` / `onClientDisconnect`**            | Simple logging – you can enrich it with Prometheus metrics or a connection counter.                                                                                                                                                                           |
| **`publishProgress`**                                   | Core fan‑out logic. `this.broadcastToClients()` is the SDK‑provided shortcut that pushes the JSON payload over every open `/sync` WebSocket.                                                                                                                  |
| **SQLite helpers (`storeProgress`, `getLastProgress`)** | The Agents SDK gives each agent an **SQLite database** automatically. Storing the latest progress means a dashboard that connects _after_ the pipeline started can request the last known state (e.g., via an HTTP endpoint you add) and instantly render it. |
| **`reportAndPersist`**                                  | A convenience wrapper your pipeline code can call in one line.                                                                                                                                                                                                |

---

## 2. Wire the agent into your pipeline

Your pipeline code (it could be a separate Cloudflare Worker, a serverless function, or any back‑end that can call the Agent’s RPC interface) only needs to import the agent’s RPC client and call `reportAndPersist`.

```ts
// Example: src/pipeline.ts (runs inside the same worker process)
import agent from "./agent"; // the RPC client proxy is automatically generated

export async function runPipeline(taskId: string) {
  for (let step = 0; step <= 100; step += 10) {
    // Simulate work …
    await new Promise((r) => setTimeout(r, 500));

    // Push progress to the SyncBroadcastAgent
    await agent.reportAndPersist(taskId, step, `Step ${step / 10} of 10 completed`);
  }
}
```

If your pipeline lives in a _different_ service, you can call the agent via the **Agents API**:

```bash
curl -X POST "https://<ACCOUNT_ID>.workers.dev/sync-broadcast-agent/rpc/reportAndPersist" \
     -H "Authorization: Bearer <AGENT_TOKEN>" \
     -H "Content-Type: application/json" \
     --data '{"taskId":"1234","percent":30,"message":"30% done"}'
```

> **Tip:** Create an **Agent‑specific API token** with the `Agent:Invoke` permission so that only trusted services can invoke the RPC methods.

---

## 3. Dashboard side – connecting to the WebSocket

The Cloudflare Agents SDK automatically exposes a **`/sync`** endpoint that upgrades HTTP to a WebSocket and streams all `broadcastToClients` messages.

```js
// Front‑end (React/Vue/Plain JS)
const ws = new WebSocket("wss://<ACCOUNT>.workers.dev/sync-broadcast-agent/sync");

ws.addEventListener("open", () => console.log("🔗 Sync socket open"));
ws.addEventListener("message", (e) => {
  const data = JSON.parse(e.data);
  if (data.type === "progress") {
    // Update UI with newest percent / message
    console.log(`Task ${data.taskId}: ${data.percent}% – ${data.message}`);
  }
});

ws.addEventListener("close", () => console.log("❌ Sync socket closed"));
ws.addEventListener("error", (err) => console.error("WebSocket error", err));
```

Because the SDK handles **heartbeat / reconnection** for you, the dashboard will stay connected even if the worker instance hibernates and wakes later.

---

## 3. Deploy the agent

```bash
# Make sure you’re logged in to your Cloudflare account
npx wrangler login

# Publish the agent to your account/zone
npx wrangler publish
```

The deployment creates:

- A **worker** that runs the `SyncBroadcastAgent` at `https://core-resumes.hacolby.workers.dev/sync-broadcast-agent/*`
- The `/sync` WebSocket endpoint: `wss://core-resumes.hacolby.workers.dev/sync-broadcast-agent/sync`

---

## 4. Recap of the “single‑concern” design

| Concern                                          | Where it lives                                             |
| ------------------------------------------------ | ---------------------------------------------------------- |
| **WebSocket lifecycle** – open, close, heartbeat | Handled automatically by the SDK (`/sync`).                |
| **Fan‑out of progress events**                   | `publishProgress()` → `this.broadcastToClients()`          |
| **State persistence (optional)**                 | Built‑in SQLite (`storeProgress`, `getLastProgress`).      |
| **Dashboard consumption**                        | Simple client‑side WebSocket code, no extra server needed. |

By keeping **only** the responsibilities above inside `SyncBroadcastAgent`, you achieve the “one‑concern” pattern described in the request.

---

## 5. Where the information came from

- **WebSocket enablement** – Cloudflare Network > WebSockets page.
- **Agents SDK capabilities** – “Building agents on Cloudflare” section (persistent state, real‑time sync via WebSockets).
- **Broadcasting to clients** – `this.broadcastToClients` usage shown in multiple `AgentWorkflow` examples.

If you need deeper integration (e.g., authentication of dashboard clients, throttling, or custom message schemas), those can be added on top of this foundation while still preserving the single‑concern nature of the agent.

---

**Happy building!** Let me know if you need help wiring the pipeline, generating the Agent token, or adding metrics around connection counts.

Sources (Top 3):

✅ Response saved to clipboard.
