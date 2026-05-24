# PRD: AIChatAgent Migration

## Goal

Migrate the existing Hono-based AI chat backend (`src/backend/api/routes/chat.ts`) to the native Cloudflare Agents SDK `AIChatAgent` architecture, unlocking stateful message persistence, WebSocket streaming, and client-side tool compatibility.

## Scope

1.  **Backend (`AIChatAgent`):**
    - Create `src/backend/ai/agents/chat/index.ts`.
    - Implement the `RoleChatAgent` extending `AIChatAgent` from `@cloudflare/ai-chat`.
    - Override `onChatMessage(onFinish, options)` to run `streamText` using `workers-ai-provider`.
    - Port existing system prompt generation (role context, active bullets, job metadata) into the agent using `options.body` or by overriding initialization.
    - Port the 5 existing tools (`consultNotebook`, `searchCareerMemory`, `draftDocument`, `generateMockInterview`, `scrapeJob`) to use the server-side tool pattern natively within `streamText`.
2.  **Infrastructure:**
    - Add `ROLE_CHAT_AGENT` binding to `wrangler.jsonc` (`durable_objects.bindings` and `migrations`).
    - Export `RoleChatAgent` in `src/_worker.ts` and add it to the `createExports` return object.
3.  **Frontend (`assistant-ui`):**
    - Update the frontend provider (e.g. `src/frontend/components/assistant-ui/RoleChatProvider.tsx`) to use `useAgentChat({ agent: "RoleChatAgent", name: roleId })` from `"agents/react"` instead of `useChatRuntime` pointing to `/api/chat`.
    - Ensure UI properly parses tools using the unified v6 streaming tool protocol.
4.  **Cleanup:**
    - Remove `chatRouter` from `src/backend/api/routes/chat.ts`.
    - Unbind from `src/backend/api/index.ts`.

## Out of Scope

- Modifying the underlying AI model logic or existing tools' business logic (e.g., `consultNotebook` stub still calls Orchestrator).
- Rebuilding the `assistant-ui` chat components visually.

## Dependencies

- Cloudflare Agents SDK (`agents` & `@cloudflare/ai-chat`).
- AI SDK v6 (`ai` package).
- `worker-configuration.d.ts` must be re-generated.
