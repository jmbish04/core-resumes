# UI Component Standards

## Shadcn Components

- **Install policy:** Never force-install with `-y` or `-o`. Run `shadcn add --diff` first, review changes, then apply manually.
- **Modification policy:** Do NOT edit files in `src/frontend/components/ui/` directly. Create wrapper components or use CSS overrides instead.
- All UI components live in `src/frontend/components/ui/`.

## assistant-ui Integration

- **SDK-first:** Always use native `@assistant-ui/react` primitives before building custom React components.
- **Thread:** Use `ThreadPrimitive.Root`, `ThreadPrimitive.Viewport`, `ThreadPrimitive.Messages`, `ThreadPrimitive.Empty`, `ThreadPrimitive.Suggestion`.
- **Messages:** Use `MessagePrimitive.Root`, `MessagePrimitive.Content` with custom `Text` component for rendering.
- **Composer:** Use `ComposerPrimitive.Root`, `ComposerPrimitive.Input`, `ComposerPrimitive.Send`. For voice: `ComposerPrimitive.Dictate` and `ComposerPrimitive.StopDictation`.
- **Actions:** Use `ActionBarPrimitive.Copy`, `ActionBarPrimitive.Speak`, `ActionBarPrimitive.StopSpeaking`, `ActionBarPrimitive.Reload`.
- **Tool UIs:** Register with `makeAssistantToolUI` in `src/frontend/components/assistant-ui/tool-ui.tsx`.
- **Adapters:**
  - TTS: Extend `SpeechSynthesisAdapter` — see `src/frontend/lib/custom-tts-adapter.ts`.
  - STT: Extend `DictationAdapter` — see `src/frontend/lib/cloudflare-whisper-adapter.ts`.
- **Provider:** `RoleChatProvider` in `src/frontend/components/role/RoleChatProvider.tsx` wraps `AssistantRuntimeProvider` + `useChatRuntime` + adapters.

## Chart Components

- Use `ChartContainer`, `ChartTooltip`, `ChartTooltipContent` from `src/frontend/components/ui/chart.tsx`.
- Use recharts primitives (`RadialBarChart`, `PolarGrid`, etc.) inside `ChartContainer`.
- All chart colors use CSS variables: `var(--chart-1)` through `var(--chart-5)`.
