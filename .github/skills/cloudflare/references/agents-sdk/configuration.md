# Configuration

## Wrangler Setup

```jsonc
{
  "name": "my-agents-app",
  "durable_objects": {
    "bindings": [
      { "name": "MY_AGENT", "class_name": "MyAgent" }
    ]
  },
  // new_sqlite_classes — required for Agents SDK (SQLite-backed DO)
  "migrations": [
    { "tag": "v1", "new_sqlite_classes": ["MyAgent"] }
  ],
  "ai": {
    "binding": "AI"
  }
}
```

After every `wrangler.jsonc` binding change, regenerate types:
```bash
pnpm run cf-typegen
# or: npx wrangler types
```

## Environment Bindings

The generated `worker-configuration.d.ts` does **not** carry DO generic parameters.
When using `getAgentByName`, cast explicitly:

```typescript
// Generated type (no generic):
// MY_AGENT: DurableObjectNamespace;   ← from worker-configuration.d.ts

// Correct cast for getAgentByName:
// Signature: getAgentByName<Env, AgentClass>(namespace, name)
const agent = await getAgentByName<Env, MyAgent>(
  env.MY_AGENT as unknown as DurableObjectNamespace<MyAgent>,
  "instance-name",
);

// ❌ Wrong — as any hides real type errors:
const agent = await getAgentByName<Env, MyAgent>(env.MY_AGENT as any, "instance-name");
```

## Agent Routing (Worker entrypoint)

Use `routeAgentRequest` (not `routeAgent`) to handle both HTTP and WebSocket upgrades:

```typescript
import { routeAgentRequest } from "agents";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    // routeAgentRequest intercepts /agents/<ClassName>/<name> paths
    // and upgrades WebSocket connections automatically.
    return (
      (await routeAgentRequest(request, env, ctx)) ??
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
```

## @callable vs. Durable Object RPC — CRITICAL DISTINCTION

> Source: https://developers.cloudflare.com/agents/api-reference/callable-methods/

| Caller                              | Correct pattern                          | Use `@callable`? |
|-------------------------------------|------------------------------------------|-----------------|
| Browser / mobile / external service | WebSocket RPC via `agent.stub.method()`  | ✅ Yes           |
| Same Worker (Hono route, fetch)     | `getAgentByName` + direct method call    | ❌ No            |
| Agent calling another agent         | `getAgentByName` + direct method call    | ❌ No            |

### Worker-to-Agent (DO RPC) — the pattern used in this repo

```typescript
import { getAgentByName } from "agents";
import type { MyAgent } from "@/backend/ai/agents/my-agent";

// In a Hono route handler:
const agent = await getAgentByName<MyAgent>(
  c.env.MY_AGENT as unknown as DurableObjectNamespace<MyAgent>,
  "instance-name",
);

// Call methods directly — no @callable decorator needed on the Agent
const result = await agent.doWork(data);
```

The method on the Agent class is just a plain `async` method:

```typescript
export class MyAgent extends Agent<Env, MyState> {
  // No @callable() — this is called via DO RPC from the Worker
  async doWork(data: WorkData): Promise<WorkResult> {
    // ...
  }
}
```

### Browser-to-Agent (@callable) — for frontend WebSocket clients

```typescript
// Agent (server):
import { Agent, callable } from "agents";

export class MyAgent extends Agent<Env, MyState> {
  @callable()
  async greet(name: string): Promise<string> {
    return `Hello, ${name}!`;
  }
}

// Frontend (browser):
import { useAgent } from "agents/react";
import type { MyAgent } from "./server";

const agent = useAgent<MyAgent>({ agent: "MyAgent", name: "default" });
const result = await agent.stub.greet("World");
```

### ⚠️ Anti-patterns to avoid

```typescript
// ❌ Wrong: raw DO stub fetch to /rpc/ path — not the Agents SDK RPC protocol
const id = env.MY_AGENT.idFromName("instance");
const stub = env.MY_AGENT.get(id);
await stub.fetch(new Request("https://agent/rpc/methodName", { method: "POST" }));

// ❌ Wrong: as any cast hides real type errors
const agent = await getAgentByName<Env, MyAgent>(env.MY_AGENT as any, "name");

// ❌ Wrong: (stub as any).method() — silently fails at runtime
(stub as any).doWork(data);
```

## Email Routing

```typescript
import { routeAgentRequest, routeAgentEmail } from "agents";

export default {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) =>
    routeAgentRequest(req, env, ctx),
  email: (message: ForwardableEmailMessage, env: Env) =>
    routeAgentEmail(message, env),
} satisfies ExportedHandler<Env>;
```

Handle in the agent:

```typescript
export class EmailAgent extends Agent<Env> {
  async onEmail(email: AgentEmail) {
    const text = await email.text();
    // Process email...
  }
}
```

## AI Gateway

All Workers AI calls must go through AI Gateway in this repo:

```typescript
const response = await this.env.AI.run(
  "@cf/meta/llama-3.1-8b-instruct",
  { prompt },
  {
    gateway: {
      id: env.AI_GATEWAY_ID,  // from wrangler.jsonc vars
      skipCache: false,
      cacheTtl: 3600,
    },
  },
);
```

Do **not** construct AI Gateway URLs manually.

## MCP Configuration

For exposing tools via Model Context Protocol:

```jsonc
// wrangler.jsonc
{
  "vars": {
    "MCP_SERVER_URL": "https://mcp.example.com"
  }
}
```

Set secrets via CLI:
```bash
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
```
