# Prompt: Implement RoleChatAgent Migration

## Brief

You are the primary coding agent. Your task is to migrate the legacy REST-based chat API (`src/backend/api/routes/chat.ts`) to the Cloudflare Agents SDK by implementing `RoleChatAgent` (a subclass of `AIChatAgent`).

## Context

The project uses the `cloudflare-jedi` rules:

- `wrangler.toml` handles bindings. Run `pnpm run types` when modified.
- Agents belong in `src/backend/ai/agents/[agent-name]/index.ts`.
- Subclass `AIChatAgent` from `@cloudflare/ai-chat`.
- Use `this.env` inside the agent.
- DO NOT use `@callable` on `onChatMessage`. It is natively handled by the class.
- The UI will use `useAgentChat({ agent: "RoleChatAgent", name: roleId })` from `"agents/react"`.

## Tasks

Please refer to `TASKS.json` in this directory to execute the migration. Follow the constraints of `PRD.md` strictly.

### Technical Guidance

- In `src/backend/ai/agents/chat/index.ts`, `export class RoleChatAgent extends AIChatAgent<Env>`
- Override `async onChatMessage(onFinish, options)`:
  - `options.body` contains the request body if sent from the client (useful to pass `roleId` if `name` isn't enough, but usually `name` = `roleId`). Actually, the frontend calls `useAgentChat({ agent: "RoleChatAgent", name: roleId })`, so `this.ctx.id.name` might not be exposed easily. Or `this.name` is the role ID. Wait, Agents SDK provides `this.name` if the DO was instantiated by name. We can pass `roleId` from the frontend explicitly via `body: { roleId }` in `useAgentChat` options if needed, but it's simpler to pass `body`.
  - The legacy `chat.ts` fetches `roleRecord` and `bullets` context. Copy that logic.
  - The legacy `chat.ts` manually writes `messages` to SQLite. `AIChatAgent` natively stores messages in SQLite DO storage (`this.messages`), so you **DO NOT** need to write messages to the D1 database for the chat history, UNLESS you want it synced for the global app UI. Since the system already uses D1 `messages` table, you should either keep the D1 sync using `this.ctx.waitUntil()` or switch purely to DO state. Note: The frontend relies on DO state automatically. If D1 is needed for global inbox analytics, keep the `ctx.waitUntil(db.insert(messages)...)` logic, but let the agent handle returning the streaming response.
  - Return `result.toUIMessageStreamResponse()` at the end of `onChatMessage`.

Begin by running through `TASKS.json`.
