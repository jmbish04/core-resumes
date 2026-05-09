<system_context>
You are an elite Senior Systems Architect and Cloudflare Ecosystem Expert. Your primary function is to output authoritative, production-ready code for a stack comprising Cloudflare Workers, Hono (Routing), Astro (Frontend SSR), React, Drizzle ORM (D1), and shadcn/ui (Default Dark Theme). You must adhere to the latest `assistant-ui` patterns for rich chat interfaces.

All AI calls must route through Cloudflare AI Gateway.
</system_context>

**Task: Implement a Role-Specific Assistant-UI Chat Interface and Comprehensive Health Service**

Please implement a highly advanced, threaded chat interface on the "View Role" page, alongside a robust agent health testing service.

### 1. Assistant-UI Sidebar & Thread Management

- **Sidebar Integration:** Wrap the main content and chat interface using the `AssistantSidebar` component (`ResizablePanelGroup` with `Thread` on the right).
- **Thread List & Navigation:** Implement a custom thread list sidebar that is triggered by an icon button. The list must fetch and display chat threads from the D1 `threads` table where `role_id` matches the current role.
- **Auto-Hide Behavior:** The thread selection sidebar must automatically close/disappear when the user selects a thread to start chatting, or when they manually click a close button.
- **New Threads:** Provide a "Create New Thread" button within the thread list that initializes a new conversation tied to the current `role.id`.

### 2. Multimodal AI & Streaming Support

- **Streaming:** Ensure the chat utilizes resumable streaming via the Cloudflare Agents SDK (`AIChatAgent`) or Vercel AI SDK integration, routed through AI Gateway.
- **Speech-to-Text (STT):** Implement voice dictation support using Cloudflare Workers AI Whisper (`@cf/openai/whisper`).
- **Text-to-Speech (TTS):** Integrate the `SpeechSynthesisAdapter` (or a custom Workers AI TTS adapter) so the assistant can read messages aloud. Add the `<ActionBarPrimitive.Speak>` and `<StopSpeaking>` buttons to the message action bar.

### 3. Advanced Assistant-UI Message Primitives

Extend `MessagePrimitive.Parts` to include the following advanced capabilities:

- **Reasoning & Chain of Thought:** Use `<Reasoning>` and `<ReasoningGroup>` to wrap consecutive reasoning tokens in a collapsible UI. Also, implement `<ChainOfThoughtPrimitive>` to group reasoning steps and tool calls behind a "Thinking" accordion.
- **Generative UI (Tool Rendering):** Use `makeAssistantToolUI` to render interactive, component-based UIs for tool calls rather than plain text.
- **Sources:** Implement the `<Sources>` component to display references. Specifically, the agent must cite sources from NotebookLM and the original Job Posting when providing analysis.
- **Suggestions:** Use `<ThreadPrimitive.Suggestions>` on the welcome screen or empty thread state to provide actionable quick replies for the user.

### 4. Custom Context Display (Hireability Ranking)

- **Context Metric Visualization:** Utilize the `<ContextDisplay>` component (e.g., `ContextDisplay.Ring` or `ContextDisplay.Bar`).
- **Custom Logic:** Instead of standard token limits, bind this display to show the AI's calculated "likelihood to be hired" ranking. This score should be derived from the agent consulting NotebookLM to compare the user's profile against the specific role posting requirements.

### 5. Agent Health Service

- **Backend Diagnostic Service:** Create a specialized health service endpoint that tests all aspects of the AI agents, including their ability to establish WebSocket connections, persist state to SQLite/D1, and execute tool calls.
- **Frontend Health Component:** Build a frontend React component dashboard that connects to this health service. It must specifically verify that the agent is returning streaming content in the exact format required by `assistant-ui` (e.g., verifying `part-start`, `text-delta`, and `tool-call` streaming chunks).

### Execution Rules:

1. ALWAYS RESPOND WITH FULL END-TO-END CODE. No shortcuts like `// ... rest of code`.
2. Output every file from start to finish.
3. Ensure all UI components match the official Shadcn registry in the default dark theme.
4. Provide the D1 database migrations for any new `threads` or `messages` table schema updates in `./drizzle` using Drizzle ORM.
5. Generate an "Antigravity Implementation Plan" at the end of your response detailing the workflow execution (`.agent/workflows/implement-feature.md`) and any necessary rule updates (`.agent/rules/`).
6. Refer to `docs/assistant-ui/technical_docs.md` for assistant-ui technical documentation to inform your implementation.
