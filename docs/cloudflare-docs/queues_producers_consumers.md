Contacting Cloudflare Docs Agent (Session: docs-1777637790594)...

Cloudflare Docs Agent:

## Cloudflare Queues – How to bind **producers** and **consumers** in `wrangler.jsonc`

Below is a step‑by‑step guide that brings together everything the Cloudflare docs show in the search results.  
All examples are **JSONC** (the default format for a Wrangler configuration file) and the equivalent **TOML** is also shown.

---

### 1. Create the Queue (once)

You can create a queue from the Cloudflare dashboard **or** with the CLI:

```bash
npx wrangler queues create my-queue
```

> The name you give the queue (`my-queue` in the examples) is the value you will reference in the `queue` property of the binding.

---

### 2. Add a **producer** binding (Worker that writes to the queue)

A producer needs a binding so that the Worker can call `env.MY_QUEUE.send(...)`.

#### `wrangler.jsonc` – producer section

```jsonc
{
  // … other top‑level fields like name, main, etc.

  "queues": {
    "producers": [
      {
        "queue": "my-queue", // <-- the queue you created
        "binding": "MY_QUEUE", // <-- JS variable name used in the Worker
        "delivery_delay": 60, // optional – default delay (seconds) for every message
      },
    ],
  },
}
```

#### Equivalent `wrangler.toml`

```toml
[[queues.producers]]
queue = "my-queue"
binding = "MY_QUEUE"
delivery_delay = 60     # optional
```

**What the fields mean**

| Field            | Required? | Description                                                                                       |
| ---------------- | --------- | ------------------------------------------------------------------------------------------------- |
| `queue`          | ✅        | Exact name of the Cloudflare Queue.                                                               |
| `binding`        | ✅        | The identifier you will use inside `env` (must be a valid JavaScript variable name).              |
| `delivery_delay` | ❌        | Seconds to delay _all_ messages sent via this binding (default 0). Can be overridden per‑message. |

#### Producer Worker code (TypeScript)

```ts
export interface Env {
  MY_QUEUE: Queue; // the binding declared above
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Example: forward the request body to the queue as JSON
    const payload = await request.json();

    await env.MY_QUEUE.send(payload); // ← send to the queue

    return new Response("Message queued", { status: 202 });
  },
};
```

> **Pages Functions** use the same binding, but you access it on `context.env`. See the “Queue Producers” snippet in the Pages documentation.

---

### 3. Add a **consumer** binding (Worker that pulls messages from the queue)

A consumer is a Worker that defines an `async queue(batch, env, ctx)` handler.  
Only **one active consumer** may be attached to a given queue (Cloudflare guarantees at‑least‑once delivery).

#### `wrangler.jsonc` – consumer section

```jsonc
{
  // … other top‑level fields

  "queues": {
    "consumers": [
      {
        "queue": "my-queue", // the same queue name as the producer
        "max_batch_size": 100, // optional – max messages per batch
        "max_batch_timeout": 30, // optional – seconds to wait before delivering a batch
      },
    ],
  },
}
```

#### Equivalent `wrangler.toml`

```toml
[[queues.consumers]]
queue = "my-queue"
max_batch_size = 100        # optional
max_batch_timeout = 30      # optional
```

**Consumer‑only options**

| Field                       | Required? | Description                                                                  |
| --------------------------- | --------- | ---------------------------------------------------------------------------- |
| `queue`                     | ✅        | Name of the Cloudflare Queue you want this Worker to consume.                |
| `max_batch_size`            | ❌        | Upper bound on the number of messages in a batch (default 10).               |
| `max_batch_timeout`         | ❌        | Seconds to wait for a batch to fill before invoking the handler (default 5). |
| `max_retries` (CLI only)    | ❌        | Number of automatic retry attempts for failed batches.                       |
| `delivery_delay` (CLI only) | ❌        | Default delay for messages _sent_ from this consumer (rarely used).          |

#### Consumer Worker code (TypeScript)

```ts
export interface Env {
  // You can add other bindings here (KV, R2, D1, etc.)
}

export default {
  // This function is called automatically by Queues
  async queue(batch: QueueBatch<unknown>, env: Env, ctx: ExecutionContext): Promise<void> {
    for (const msg of batch.messages) {
      // `msg.body` contains the payload that the producer sent
      console.log("Received message:", msg.body);

      // Example: write payload to KV, R2, or an external API
      // await env.MY_KV.put(`msg-${msg.id}`, JSON.stringify(msg.body));
    }
  },
} satisfies ExportedHandler<Env>;
```

> **Important:** Because only one consumer can be attached to a queue, you should keep the consumer logic focused on a single responsibility (e.g., store to DB, forward to an API, etc.). You _can_ attach the same consumer to **multiple** queues – just add another entry in the `consumers` array.

---

### 4. Full Example – Both producer and consumer in the same project

If a single Worker project contains **both** a producer (exposed as an HTTP endpoint) **and** a consumer, the `queues` block can hold _both_ arrays:

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "my-queue-app",
  "compatibility_date": "2026-04-16",

  "queues": {
    // ---- PRODUCERS -------------------------------------------------
    "producers": [
      {
        "queue": "my-queue",
        "binding": "MY_QUEUE",
        "delivery_delay": 0,
      },
    ],

    // ---- CONSUMERS -------------------------------------------------
    "consumers": [
      {
        "queue": "my-queue",
        "max_batch_size": 50,
        "max_batch_timeout": 20,
      },
    ],
  },
}
```

The same `wrangler.jsonc` works for the TypeScript files shown above.

---

### 5. Queue‑level settings (optional, CLI only)

You can tweak _queue_ defaults (delivery delay, retention period, etc.) after the queue is created:

```bash
# Example: set a default 60‑second delivery delay and a 4‑day retention period
npx wrangler queues update my-queue \
   --delivery-delay-secs 60 \
   --message-retention-period-secs 345600
```

| Flag                              | Meaning                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `--delivery-delay-secs`           | Seconds to postpone each message before it becomes visible to consumers (0‑86400). |
| `--message-retention-period-secs` | How long Cloudflare keeps a message after it is published (60‑1 209 600 seconds).  |
| `--max-retries`                   | Number of automatic retries for a failed batch (default 5).                        |

These settings are **global** to the queue; the per‑binding `delivery_delay` in `wrangler.jsonc` can further override the default on a per‑producer basis.

---

### 6. Quick reference cheat‑sheet

| What you need                                                    | JSONC snippet                                                                                                      | How you use it in code                                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Producer binding**                                             | `jsonc { "queues": { "producers": [ { "queue": "my-queue", "binding": "MY_QUEUE" } ] } }`                          | `await env.MY_QUEUE.send(payload);`                                                                                             |
| **Consumer binding**                                             | `jsonc { "queues": { "consumers": [ { "queue": "my-queue", "max_batch_size": 100, "max_batch_timeout": 30 } ] } }` | `export default { async queue(batch, env, ctx) { … } }`                                                                         |
| **Delivery delay (default for all messages from this producer)** | `"delivery_delay": 60`                                                                                             | Same as normal `send`, but each message will be held 60 s before being dispatched.                                              |
| **Batch options for the consumer**                               | `"max_batch_size": 100, "max_batch_timeout": 30`                                                                   | The `queue` handler receives up to 100 messages or after 30 s, whichever comes first.                                           |
| **Pages Functions producer**                                     | Same `queues.producers` block; access via `context.env.MY_QUEUE`                                                   | `js export async function onRequest(context) { await context.env.MY_QUEUE.send({foo:"bar"}); return new Response("queued"); } ` |

---

## TL;DR – Minimal `wrangler.jsonc`

```jsonc
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "queues-demo",
  "compatibility_date": "2026-04-16",

  "queues": {
    "producers": [
      {
        "queue": "my-queue",
        "binding": "MY_QUEUE",
      },
    ],
    "consumers": [
      {
        "queue": "my-queue",
        "max_batch_size": 50,
        "max_batch_timeout": 20,
      },
    ],
  },
}
```

_Add the corresponding TypeScript/JavaScript files (producer `fetch` handler and consumer `queue` handler) and deploy with_:

```bash
npx wrangler deploy
```

That’s everything you need to configure **producers**, **consumers**, and their **bindings** for Cloudflare Queues in `wrangler.jsonc`. 🎉

Sources (Top 3):

✅ Response saved to clipboard.
