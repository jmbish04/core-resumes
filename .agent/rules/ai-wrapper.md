# AI Wrapper Standards

## Workers AI Invocation

- **Always** route through AI Gateway: `env.AI.run(model, body, { gateway: { id: env.AI_GATEWAY_ID } })`.
- **Never** construct gateway URLs manually.
- **Model IDs** are resolved from env vars via `getModelRegistry(env)` in `src/backend/ai/models/index.ts`.
- Configured models: `MODEL_CHAT`, `MODEL_EXTRACT`, `MODEL_DRAFT` in `wrangler.jsonc` vars.

## Structured Output

- Use `generateStructuredOutput()` from `src/backend/ai/providers/index.ts`.
- Pass a **Zod schema** — it is converted to `json_schema` response format automatically.
- Temperature 0 for deterministic extraction; 0.3 for chat.

## Streaming

- Use `streamChat()` or direct `env.AI.run()` with `{ stream: true }`.
- `/api/chat` transforms Workers AI SSE (`data: {"response":"token"}`) into AI SDK v6 data stream format (`0:text`, `d:finish`).

## AI Tasks

- One task per file under `src/backend/ai/tasks/`.
- Tasks are invoked by the ColbyAgent or by API routes — never directly by frontend.
- Task types registered in `ColbyTaskType` union in `src/backend/ai/agents/colby.ts`.

## Voice Models

- **TTS:** `@cf/deepgram/aura-2-en` — accepts `{ text, speaker, encoding }`. Returns `ReadableStream`.
- **STT:** `@cf/openai/whisper-large-v3-turbo` — accepts `{ audio: base64 }`. Returns `{ text }`.
- Both go through AI Gateway.
