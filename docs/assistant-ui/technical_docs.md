# AssistantSidebar

URL: /docs/ui/assistant-sidebar

Side panel chat for co-pilot experiences and inline assistance.

A resizable side panel layout with your main content on the left and a Thread chat interface on the right. Ideal for co-pilot experiences and inline assistance.

<AssistantSidebarSample />

## Getting Started \[#getting-started]

<Steps>
  <Step>
    ### Add `assistant-sidebar` \[#add-assistant-sidebar]

    <InstallCommand shadcn="[&#x22;assistant-sidebar&#x22;]" />

    This adds `/components/assistant-ui/assistant-sidebar.tsx` to your project, which you can adjust as needed.

  </Step>

  <Step>
    ### Use in your application \[#use-in-your-application]

    ```tsx title="/app/page.tsx" {1,6}
    import { AssistantSidebar } from "@/components/assistant-ui/assistant-sidebar";

    export default function Home() {
      return (
        <div className="h-full">
          <AssistantSidebar>{/* your app */}</AssistantSidebar>
        </div>
      );
    }
    ```

  </Step>
</Steps>

## API Reference \[#api-reference]

### AssistantSidebar \[#assistantsidebar]

A layout component that creates a resizable two-panel interface.

<ParametersTable
  type="AssistantSidebarProps"
  parameters="[
{
name: &#x22;children&#x22;,
type: &#x22;ReactNode&#x22;,
description: &#x22;Content to display in the left panel (your main application).&#x22;,
},
]"
/>

The component uses `ResizablePanelGroup` from shadcn/ui internally, creating:

- **Left panel**: Your application content (passed as `children`)
- **Right panel**: The Thread chat interface (rendered automatically)
- **Resize handle**: Draggable divider between panels

## Customization \[#customization]

Since this component is copied to your project at `/components/assistant-ui/assistant-sidebar.tsx`, you can customize:

- Panel default sizes and min/max constraints
- Resize handle styling
- Thread component configuration

```tsx title="/components/assistant-ui/assistant-sidebar.tsx"
<ResizablePanelGroup direction="horizontal">
  <ResizablePanel defaultSize={60} minSize={30}>
    {children}
  </ResizablePanel>
  <ResizableHandle withHandle />
  <ResizablePanel defaultSize={40} minSize={20}>
    <Thread />
  </ResizablePanel>
</ResizablePanelGroup>
```

## Related Components \[#related-components]

- [Thread](/docs/ui/thread) - The chat interface displayed in the sidebar
- [AssistantModal](/docs/ui/assistant-modal) - Alternative floating modal layout

# Reasoning

URL: /docs/ui/reasoning

Collapsible UI for displaying AI reasoning and thinking messages.

<ReasoningSample />

## Getting Started \[#getting-started]

<Steps>
  <Step>
    ### Add `reasoning` \[#add-reasoning]

    <InstallCommand shadcn="[&#x22;reasoning&#x22;]" />

    This adds a `/components/assistant-ui/reasoning.tsx` file to your project.

  </Step>

  <Step>
    ### Use in your application \[#use-in-your-application]

    Pass the `Reasoning` and `ReasoningGroup` components to `MessagePrimitive.Parts` via the `components` prop. Using them together is the recommended default — `ReasoningGroup` wraps consecutive reasoning parts in a collapsible container for a smooth out-of-the-box UI.

    ```tsx title="/app/components/assistant-ui/thread.tsx"
    import { MessagePrimitive } from "@assistant-ui/react";
    import { MarkdownText } from "@/components/assistant-ui/markdown-text";
    import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
    import { Reasoning, ReasoningGroup } from "@/components/assistant-ui/reasoning"; // [!code ++]

    const AssistantMessage: FC = () => {
      return (
        <MessagePrimitive.Root className="...">
          <div className="...">
            <MessagePrimitive.Parts
              components={{
                Text: MarkdownText,
                Reasoning, // [!code ++]
                ReasoningGroup, // [!code ++]
                tools: { Fallback: ToolFallback },
              }}
            />
          </div>
          <AssistantActionBar />
          <BranchPicker className="..." />
        </MessagePrimitive.Root>
      );
    };
    ```

  </Step>
</Steps>

## How It Works \[#how-it-works]

The component consists of two parts:

1. `Reasoning`: Renders individual reasoning message part content (with markdown support)
2. `ReasoningGroup`: Wraps consecutive reasoning parts in a collapsible container

Consecutive reasoning parts are automatically grouped together by `ReasoningGroup`. We recommend using both together as the default — you can drop `ReasoningGroup` or build your own layout with the composable API below if you need more flexibility.

> When using the composable API, `Reasoning.Text` is a plain container. Add `<MarkdownText />` for markdown rendering.

## Variants \[#variants]

Use the `variant` prop on `Reasoning.Root` to change the visual style:

```tsx
<Reasoning.Root variant="outline">...</Reasoning.Root>
<Reasoning.Root variant="ghost">...</Reasoning.Root>
<Reasoning.Root variant="muted">...</Reasoning.Root>
```

| Variant   | Description              |
| --------- | ------------------------ |
| `outline` | Rounded border (default) |
| `ghost`   | No additional styling    |
| `muted`   | Muted background         |

## ReasoningGroup \[#reasoninggroup]

`ReasoningGroup` wraps consecutive reasoning parts in a collapsible container. It auto-expands during streaming.

<ReasoningGroupSample />

```tsx
import { ReasoningGroup } from "@/components/assistant-ui/reasoning";

const ReasoningGroupImpl: ReasoningGroupComponent = ({ children, startIndex, endIndex }) => {
  const isReasoningStreaming = useAuiState((s) => {
    if (s.message.status?.type !== "running") return false;
    const lastIndex = s.message.parts.length - 1;
    if (lastIndex < 0) return false;
    const lastType = s.message.parts[lastIndex]?.type;
    if (lastType !== "reasoning") return false;
    return lastIndex >= startIndex && lastIndex <= endIndex;
  });

  return (
    <ReasoningRoot defaultOpen={isReasoningStreaming}>
      <ReasoningTrigger active={isReasoningStreaming} />
      <ReasoningContent aria-busy={isReasoningStreaming}>
        <ReasoningText>{children}</ReasoningText>
      </ReasoningContent>
    </ReasoningRoot>
  );
};
```

## API Reference \[#api-reference]

### Composable API \[#composable-api]

All sub-components are exported for custom layouts:

| Component           | Description                            |
| ------------------- | -------------------------------------- |
| `Reasoning.Root`    | Collapsible container with scroll lock |
| `Reasoning.Trigger` | Button with icon, label, and shimmer   |
| `Reasoning.Content` | Animated collapsible content wrapper   |
| `Reasoning.Text`    | Text wrapper with slide/fade animation |
| `Reasoning.Fade`    | Gradient fade overlay at bottom        |

```tsx
import {
  Reasoning,
  ReasoningRoot,
  ReasoningTrigger,
  ReasoningContent,
  ReasoningText,
  ReasoningFade,
} from "@/components/assistant-ui/reasoning";

// Compound component syntax
<Reasoning.Root variant="muted">
  <Reasoning.Trigger active={isStreaming} />
  <Reasoning.Content>
    <Reasoning.Text>{children}</Reasoning.Text>
  </Reasoning.Content>
</Reasoning.Root>;
```

## Related Components \[#related-components]

- [ToolGroup](/docs/ui/tool-group) - Similar grouping pattern for tool calls
- [PartGrouping](/docs/ui/part-grouping) - Experimental API for grouping message parts

# Sources

URL: /docs/ui/sources

Display URL sources with favicon, title, and external link.

<SourcesSample />

## Getting Started \[#getting-started]

<Steps>
  <Step>
    ### Add `sources` \[#add-sources]

    <InstallCommand shadcn="[&#x22;sources&#x22;]" />

  </Step>

  <Step>
    ### Use in your application \[#use-in-your-application]

    Pass `Sources` to `MessagePrimitive.Parts`:

    ```tsx title="/components/assistant-ui/thread.tsx" {1,8}
    import { Sources } from "@/components/assistant-ui/sources";

    const AssistantMessage: FC = () => {
      return (
        <MessagePrimitive.Root className="...">
          <MessagePrimitive.Parts>
            {({ part }) => {
              if (part.type === "source") return <Sources {...part} />;
              return null;
            }}
          </MessagePrimitive.Parts>
        </MessagePrimitive.Root>
      );
    };
    ```

  </Step>
</Steps>

## Variants \[#variants]

Use the `variant` prop to change the visual style. The default is `outline`.

```tsx
<Source variant="outline" />     // Border (default)
<Source variant="ghost" />       // No background
<Source variant="muted" />       // Solid muted background
<Source variant="secondary" />   // Secondary background
<Source variant="info" />        // Blue
<Source variant="warning" />     // Amber
<Source variant="success" />     // Emerald
<Source variant="destructive" /> // Red
```

## Sizes \[#sizes]

Use the `size` prop to change the size.

```tsx
<Source size="sm" />      // Small
<Source size="default" /> // Default
<Source size="lg" />      // Large
```

## API Reference \[#api-reference]

### `Sources` \[#sources]

The default export used as a `SourceMessagePartComponent`. Renders a single source part when `sourceType === "url"`. Also exposes compound sub-components for custom layouts.

| Prop         | Type                  | Default | Description                                        |
| ------------ | --------------------- | ------- | -------------------------------------------------- |
| `url`        | `string`              | —       | The URL of the source (provided by the runtime)    |
| `title`      | `string \| undefined` | —       | Display title; falls back to the domain if omitted |
| `sourceType` | `string`              | —       | Must be `"url"` to render; other types are ignored |

#### Compound sub-components \[#compound-sub-components]

```tsx
import { Sources } from "@/components/assistant-ui/sources";

<Sources.Root href="https://example.com">
  <Sources.Icon url="https://example.com" />
  <Sources.Title>Example</Sources.Title>
</Sources.Root>;
```

| Sub-component   | Equivalent named export | Description                          |
| --------------- | ----------------------- | ------------------------------------ |
| `Sources.Root`  | `Source`                | Root anchor element                  |
| `Sources.Icon`  | `SourceIcon`            | Favicon with domain initial fallback |
| `Sources.Title` | `SourceTitle`           | Truncated title text                 |

### `Source` \[#source]

Root container rendered as an `<a>` tag. Accepts all `<a>` props plus `variant` and `size`.

| Prop        | Type                                                                                                  | Default                 | Description                                |
| ----------- | ----------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------ |
| `href`      | `string`                                                                                              | —                       | URL the link points to                     |
| `variant`   | `"outline" \| "ghost" \| "muted" \| "secondary" \| "info" \| "warning" \| "success" \| "destructive"` | `"outline"`             | Visual style                               |
| `size`      | `"sm" \| "default" \| "lg"`                                                                           | `"default"`             | Size of the badge                          |
| `target`    | `string`                                                                                              | `"_blank"`              | Link target                                |
| `rel`       | `string`                                                                                              | `"noopener noreferrer"` | Link rel attribute                         |
| `asChild`   | `boolean`                                                                                             | `false`                 | Render as a child element using Radix Slot |
| `className` | `string`                                                                                              | —                       | Additional CSS classes                     |

### `SourceIcon` \[#sourceicon]

Displays the favicon for the given URL. Falls back to the domain initial inside a muted box when the favicon fails to load.

| Prop        | Type     | Default | Description                                                        |
| ----------- | -------- | ------- | ------------------------------------------------------------------ |
| `url`       | `string` | —       | URL used to derive the favicon and fallback initial                |
| `className` | `string` | —       | Additional CSS classes applied to the `<img>` or fallback `<span>` |

### `SourceTitle` \[#sourcetitle]

Truncated title text rendered as a `<span>`.

| Prop        | Type        | Default | Description                                             |
| ----------- | ----------- | ------- | ------------------------------------------------------- |
| `children`  | `ReactNode` | —       | Title content to display                                |
| `className` | `string`    | —       | Additional CSS classes (default max-width is `37.5rem`) |

### `sourceVariants` \[#sourcevariants]

The underlying CVA variant function used to generate badge class names. Use this when building custom source-like components that need to match the built-in styling.

```tsx
import { sourceVariants } from "@/components/assistant-ui/sources";

<span className={sourceVariants({ variant: "info", size: "sm" })}>Custom badge</span>;
```

## Composable API \[#composable-api]

Use the named exports to build fully custom source layouts:

```tsx
import { Source, SourceIcon, SourceTitle } from "@/components/assistant-ui/sources";

<Source href="https://example.com" variant="muted" className="gap-2">
  <SourceIcon url="https://example.com" className="size-4" />
  <SourceTitle className="max-w-none font-medium">Example</SourceTitle>
</Source>;
```

## Related Components \[#related-components]

- [PartGrouping](/docs/ui/part-grouping) - Group sources by parentId

# Suggestion

URL: /docs/primitives/suggestion

Suggested prompts that users can click to quickly send or populate the composer.

The Suggestion primitive renders suggested prompts as clickable pills that send a message or populate the composer. Use it for welcome screen suggestions, follow-up prompts, or quick actions. You provide the layout and styling.

<Tabs items="[&#x22;Preview&#x22;, &#x22;Code&#x22;]">
  <Tab>
    <SuggestionPrimitiveSample />
  </Tab>

  <Tab>
    ```tsx
    import {
      ThreadPrimitive,
      SuggestionPrimitive,
    } from "@assistant-ui/react";

    function SuggestionList() {
      return (
        <div className="grid grid-cols-2 gap-2">
          <ThreadPrimitive.Suggestions>
            {() => <SuggestionItem />}
          </ThreadPrimitive.Suggestions>
        </div>
      );
    }

    function SuggestionItem() {
      return (
        <SuggestionPrimitive.Trigger
          send
          className="flex flex-col items-start gap-1 rounded-2xl border px-4 py-3 text-left text-sm hover:bg-muted"
        >
          <span className="font-medium">
            <SuggestionPrimitive.Title />
          </span>
          <span className="text-muted-foreground">
            <SuggestionPrimitive.Description />
          </span>
        </SuggestionPrimitive.Trigger>
      );
    }
    ```

  </Tab>
</Tabs>

## Quick Start \[#quick-start]

A suggestion list using the iterator pattern:

```tsx
import { ThreadPrimitive, SuggestionPrimitive } from "@assistant-ui/react";

<ThreadPrimitive.Suggestions>{() => <MySuggestionItem />}</ThreadPrimitive.Suggestions>;

function MySuggestionItem() {
  return (
    <SuggestionPrimitive.Trigger className="rounded-lg border px-3 py-2 hover:bg-muted">
      <SuggestionPrimitive.Title />
    </SuggestionPrimitive.Trigger>
  );
}
```

`ThreadPrimitive.Suggestions` iterates over available suggestions and renders your component for each one. Inside the component, `SuggestionPrimitive` parts read from the suggestion context automatically.

<Callout type="info">
  Runtime setup: primitives require runtime context. Wrap your UI in `AssistantRuntimeProvider` with a runtime (for example `useLocalRuntime(...)`). See [Pick a Runtime](/docs/runtimes/pick-a-runtime).
</Callout>

## Core Concepts \[#core-concepts]

### Context-Based Rendering \[#context-based-rendering]

SuggestionPrimitive parts read from a suggestion context. Use `ThreadPrimitive.Suggestions` to provide this context. It iterates over the thread's suggestions and renders your component for each one:

```tsx
<ThreadPrimitive.Suggestions>{() => <MySuggestion />}</ThreadPrimitive.Suggestions>
```

You can also use `ThreadPrimitive.SuggestionByIndex` to render a specific suggestion by index if you need more layout control.

### Title and Description \[#title-and-description]

Suggestions support two text parts for structured display:

- **`Title`**: the primary text (e.g., "Write a blog post")
- **`Description`**: secondary text — renders the `label` field from the suggestion config (e.g., `{ prompt: "...", label: "About React Server Components" }`)

Both render a `<span>` and accept `children` to override the value from state:

```tsx
<SuggestionPrimitive.Title>Custom title</SuggestionPrimitive.Title>
```

### Send vs Populate \[#send-vs-populate]

`Trigger`'s `send` prop controls what happens on click:

- **`send={true}`**: immediately sends the suggestion as a new message. When the thread is running, it falls back to populating the composer instead.
- **`send={false}`** (default): populates the composer text so the user can edit before sending

```tsx
// Send immediately
<SuggestionPrimitive.Trigger send>
  <SuggestionPrimitive.Title />
</SuggestionPrimitive.Trigger>

// Populate composer for editing
<SuggestionPrimitive.Trigger>
  <SuggestionPrimitive.Title />
</SuggestionPrimitive.Trigger>
```

### clearComposer \[#clearcomposer]

When `send={false}`, the `clearComposer` prop controls whether the suggestion replaces or appends to existing composer text:

- **`clearComposer={true}`** (default): replaces the current composer text
- **`clearComposer={false}`**: appends the suggestion to the existing text

### ThreadPrimitive.Suggestion (Legacy) \[#threadprimitivesuggestion-legacy]

`ThreadPrimitive.Suggestion` is a self-contained button that takes a `prompt` prop directly. The newer pattern (`ThreadPrimitive.Suggestions` + `SuggestionPrimitive` parts) is preferred for structured suggestions with title and description:

```tsx
// Legacy: still works, but limited
<ThreadPrimitive.Suggestion prompt="Write a blog post" />

// Preferred: structured with title/description
<ThreadPrimitive.Suggestions>
  {() => <MySuggestionItem />}
</ThreadPrimitive.Suggestions>
```

`ThreadPrimitive.Suggestion` also supports deprecated `autoSend` and `method` props for backwards compatibility. Prefer `send` and `clearComposer`.

## Parts \[#parts]

### Title \[#title]

Renders the suggestion title. Renders a `<span>` element unless `asChild` is set.

```tsx
<SuggestionPrimitive.Title />
```

### Description \[#description]

Renders the secondary suggestion description text. Renders a `<span>` element unless `asChild` is set.

```tsx
<SuggestionPrimitive.Description />
```

### Trigger \[#trigger]

Clickable button that sends or populates the suggestion. Renders a `<button>` element unless `asChild` is set.

```tsx
<SuggestionPrimitive.Trigger send className="rounded-lg border px-3 py-2 hover:bg-muted">
  <SuggestionPrimitive.Title />
</SuggestionPrimitive.Trigger>
```

<PrimitivesTypeTable type="SuggestionPrimitiveTriggerProps" parameters="SuggestionPrimitiveDocs.Trigger.props.filter(p => p.name !== &#x22;asChild&#x22;)" />

## Patterns \[#patterns]

### Welcome Screen Grid \[#welcome-screen-grid]

```tsx
function WelcomeSuggestions() {
  return (
    <AuiIf condition={(s) => s.thread.isEmpty}>
      <div className="text-center">
        <h2 className="text-lg font-semibold">How can I help you?</h2>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <ThreadPrimitive.Suggestions>{() => <SuggestionCard />}</ThreadPrimitive.Suggestions>
        </div>
      </div>
    </AuiIf>
  );
}

function SuggestionCard() {
  return (
    <SuggestionPrimitive.Trigger
      send
      className="flex flex-col gap-1 rounded-2xl border px-4 py-3 text-left hover:bg-muted"
    >
      <span className="font-medium">
        <SuggestionPrimitive.Title />
      </span>
      <span className="text-sm text-muted-foreground">
        <SuggestionPrimitive.Description />
      </span>
    </SuggestionPrimitive.Trigger>
  );
}
```

### Send-On-Click Suggestions \[#send-on-click-suggestions]

```tsx
<SuggestionPrimitive.Trigger send className="rounded-full border px-4 py-2 hover:bg-muted">
  <SuggestionPrimitive.Title />
</SuggestionPrimitive.Trigger>
```

### Populate-Only Suggestions \[#populate-only-suggestions]

```tsx
<SuggestionPrimitive.Trigger
  send={false}
  clearComposer={false}
  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted"
>
  <SuggestionPrimitive.Title />
</SuggestionPrimitive.Trigger>
```

## Relationship to Components \[#relationship-to-components]

The shadcn [Thread](/docs/ui/thread) component includes suggestions in its welcome screen using `ThreadPrimitive.Suggestions` with `SuggestionPrimitive` parts in a responsive grid. Start there for a prebuilt welcome experience.

## API Reference \[#api-reference]

For full prop details on every part, see the [SuggestionPrimitive API Reference](/docs/api-reference/primitives/suggestion).

Related:

- [ThreadPrimitive API Reference](/docs/api-reference/primitives/thread)

# ChainOfThought

URL: /docs/primitives/chain-of-thought

Collapsible accordion for grouping reasoning steps and tool calls.

The ChainOfThought primitive groups consecutive reasoning and tool-call parts into a collapsible accordion. Reasoning models emit reasoning tokens and tool calls before producing a final answer. This primitive lets you collapse those intermediate steps behind a "Thinking" toggle.

<Callout type="info">
  Grouped Chain of Thought currently plugs into `MessagePrimitive.Parts` via `components.ChainOfThought`. If you're wiring grouped CoT, use that API.
</Callout>

<Tabs items="[&#x22;Preview&#x22;, &#x22;Code&#x22;]">
  <Tab>
    <ChainOfThoughtPrimitiveSample />
  </Tab>

  <Tab>
    ```tsx
    import {
      AuiIf,
      ChainOfThoughtPrimitive,
      MessagePrimitive,
    } from "@assistant-ui/react";

    function AssistantMessage() {
      return (
        <MessagePrimitive.Root>
          <MessagePrimitive.Parts>
            {({ part }) => {
              if (part.type === "text") return <MyText />;
              return null;
            }}
          </MessagePrimitive.Parts>
          <ChainOfThought />
        </MessagePrimitive.Root>
      );
    }

    function ChainOfThought() {
      return (
        <ChainOfThoughtPrimitive.Root className="my-2 rounded-lg border">
          <ChainOfThoughtPrimitive.AccordionTrigger className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 font-medium text-sm hover:bg-muted/50">
            Thinking
          </ChainOfThoughtPrimitive.AccordionTrigger>
          <AuiIf condition={(s) => !s.chainOfThought.collapsed}>
            <ChainOfThoughtPrimitive.Parts
              components={{
                Reasoning: ({ text }) => (
                  <p className="whitespace-pre-wrap px-4 py-2 text-muted-foreground text-sm italic">
                    {text}
                  </p>
                ),
                tools: {
                  Fallback: ({ toolName, status }) => (
                    <div className="flex items-center gap-2 px-4 py-2 text-sm">
                      <span className="font-medium">{toolName}</span>
                      <span className="text-muted-foreground">
                        {status.type === "running" ? "running..." : "done"}
                      </span>
                    </div>
                  ),
                },
              }}
            />
          </AuiIf>
        </ChainOfThoughtPrimitive.Root>
      );
    }
    ```

  </Tab>
</Tabs>

## Quick Start \[#quick-start]

Render your normal message parts with `MessagePrimitive.Parts`, then place a `ChainOfThought` component alongside them inside the same `MessagePrimitive.Root`:

```tsx
import { ChainOfThoughtPrimitive, MessagePrimitive } from "@assistant-ui/react";

<MessagePrimitive.Root>
  <MessagePrimitive.Parts>
    {({ part }) => {
      if (part.type === "text") return <MyText />;
      return null;
    }}
  </MessagePrimitive.Parts>
  <MyChainOfThought />
</MessagePrimitive.Root>;

function MyChainOfThought() {
  return (
    <ChainOfThoughtPrimitive.Root>
      <ChainOfThoughtPrimitive.AccordionTrigger>Thinking</ChainOfThoughtPrimitive.AccordionTrigger>
      <ChainOfThoughtPrimitive.Parts />
    </ChainOfThoughtPrimitive.Root>
  );
}
```

`Root` renders a `<div>`, `AccordionTrigger` renders a `<button>` that toggles the collapsed state, and `Parts` renders the grouped reasoning and tool-call parts.

<Callout type="info">
  Runtime setup: primitives require runtime context. Wrap your UI in `AssistantRuntimeProvider` with a runtime (for example `useLocalRuntime(...)`). See [Pick a Runtime](/docs/runtimes/pick-a-runtime).
</Callout>

## Core Concepts \[#core-concepts]

### How Grouping Works \[#how-grouping-works]

`ChainOfThoughtPrimitive.Parts` reads the current message's grouped reasoning and tool-call context. In practice, render your normal text/image/data parts with `MessagePrimitive.Parts`, and render `ChainOfThoughtPrimitive` separately where you want the collapsible reasoning block to appear.

### Collapsed State \[#collapsed-state]

The accordion starts collapsed by default. `AccordionTrigger` toggles between collapsed and expanded. Use `AuiIf` to conditionally render parts based on the collapsed state:

```tsx
import { AuiIf, ChainOfThoughtPrimitive } from "@assistant-ui/react";

<ChainOfThoughtPrimitive.Root>
  <ChainOfThoughtPrimitive.AccordionTrigger>Thinking</ChainOfThoughtPrimitive.AccordionTrigger>
  <AuiIf condition={(s) => !s.chainOfThought.collapsed}>
    <ChainOfThoughtPrimitive.Parts components={{ Reasoning }} />
  </AuiIf>
</ChainOfThoughtPrimitive.Root>;
```

### Chevron Indicators \[#chevron-indicators]

Use `AuiIf` to show directional icons that reflect the current state:

```tsx
import { AuiIf, ChainOfThoughtPrimitive } from "@assistant-ui/react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";

<ChainOfThoughtPrimitive.AccordionTrigger className="flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-sm">
  <AuiIf condition={(s) => s.chainOfThought.collapsed}>
    <ChevronRightIcon className="size-4" />
  </AuiIf>
  <AuiIf condition={(s) => !s.chainOfThought.collapsed}>
    <ChevronDownIcon className="size-4" />
  </AuiIf>
  Thinking
</ChainOfThoughtPrimitive.AccordionTrigger>;
```

### Parts Components \[#parts-components]

`ChainOfThoughtPrimitive.Parts` accepts a `components` prop to control how each part type renders:

```tsx
<ChainOfThoughtPrimitive.Parts
  components={{
    Reasoning: ({ text }) => (
      <p className="whitespace-pre-wrap px-4 py-2 text-muted-foreground text-sm italic">{text}</p>
    ),
    tools: {
      Fallback: ({ toolName, status }) => (
        <div className="px-4 py-2 text-sm">
          {status.type === "running" ? `Running ${toolName}...` : `${toolName} completed`}
        </div>
      ),
    },
    Layout: ({ children }) => <div className="border-t">{children}</div>,
  }}
/>
```

| Prop                        | Type                               | Description                       |
| --------------------------- | ---------------------------------- | --------------------------------- |
| `components.Reasoning`      | `FC<{ text: string }>`             | Renders reasoning parts           |
| `components.tools.Fallback` | `ToolCallMessagePartComponent`     | Fallback for tool-call parts      |
| `components.Layout`         | `ComponentType<PropsWithChildren>` | Wrapper around each rendered part |

## Parts \[#parts]

### Root \[#root]

Container for the chain-of-thought disclosure UI. Renders a `<div>` element unless `asChild` is set.

```tsx
<ChainOfThoughtPrimitive.Root className="rounded-lg border">...</ChainOfThoughtPrimitive.Root>
```

### AccordionTrigger \[#accordiontrigger]

Trigger that toggles the collapsed state. Renders a `<button>` element unless `asChild` is set.

```tsx
<ChainOfThoughtPrimitive.AccordionTrigger className="flex w-full items-center justify-between px-4 py-2 text-sm">
  Thinking
</ChainOfThoughtPrimitive.AccordionTrigger>
```

### Parts \[#parts-1]

Renders reasoning and tool-call parts. This component does not track collapsed state internally, so control visibility with `AuiIf` as shown in the patterns below.

```tsx
<ChainOfThoughtPrimitive.Parts
  components={{
    Reasoning: ({ text }) => (
      <p className="whitespace-pre-wrap px-4 py-2 text-muted-foreground text-sm italic">{text}</p>
    ),
    tools: {
      Fallback: ({ toolName, status }) => (
        <div className="px-4 py-2 text-sm">
          {status.type === "running" ? `Running ${toolName}...` : `${toolName} completed`}
        </div>
      ),
    },
  }}
/>
```

<PrimitivesTypeTable type="ChainOfThoughtPrimitivePartsProps" parameters="ChainOfThoughtPrimitiveDocs.Parts.props" />

## Patterns \[#patterns]

### Minimal Accordion \[#minimal-accordion]

```tsx
function ChainOfThought() {
  return (
    <ChainOfThoughtPrimitive.Root className="my-2 rounded-lg border">
      <ChainOfThoughtPrimitive.AccordionTrigger className="flex w-full cursor-pointer items-center gap-2 px-4 py-2 font-medium text-sm hover:bg-muted/50">
        Thinking
      </ChainOfThoughtPrimitive.AccordionTrigger>
      <AuiIf condition={(s) => !s.chainOfThought.collapsed}>
        <ChainOfThoughtPrimitive.Parts
          components={{
            Reasoning: ({ text }) => (
              <p className="whitespace-pre-wrap px-4 py-2 text-muted-foreground text-sm italic">
                {text}
              </p>
            ),
          }}
        />
      </AuiIf>
    </ChainOfThoughtPrimitive.Root>
  );
}
```

### With Tool Calls \[#with-tool-calls]

```tsx
function ChainOfThought() {
  return (
    <ChainOfThoughtPrimitive.Root className="my-2 rounded-lg border">
      <ChainOfThoughtPrimitive.AccordionTrigger className="flex w-full cursor-pointer items-center gap-2 px-4 py-2 font-medium text-sm hover:bg-muted/50">
        Thinking
      </ChainOfThoughtPrimitive.AccordionTrigger>
      <AuiIf condition={(s) => !s.chainOfThought.collapsed}>
        <ChainOfThoughtPrimitive.Parts
          components={{
            Reasoning: ({ text }) => (
              <p className="whitespace-pre-wrap px-4 py-2 text-muted-foreground text-sm italic">
                {text}
              </p>
            ),
            tools: {
              Fallback: ({ toolName, status }) => (
                <div className="flex items-center gap-2 px-4 py-2 text-sm">
                  <span className="font-medium">{toolName}</span>
                  <span className="text-muted-foreground">
                    {status.type === "running" ? "running..." : "done"}
                  </span>
                </div>
              ),
            },
            Layout: ({ children }) => <div className="border-t">{children}</div>,
          }}
        />
      </AuiIf>
    </ChainOfThoughtPrimitive.Root>
  );
}
```

## Relationship to Components \[#relationship-to-components]

The [Chain of Thought guide](/docs/guides/chain-of-thought) covers end-to-end setup including backend configuration with reasoning models. See the complete [with-chain-of-thought example](https://github.com/assistant-ui/assistant-ui/tree/main/examples/with-chain-of-thought) for a full working implementation.

## API Reference \[#api-reference]

For the complete guide including backend configuration, see [Chain of Thought](/docs/guides/chain-of-thought). For prop details, see the [ChainOfThoughtPrimitive source](https://github.com/assistant-ui/assistant-ui/tree/main/packages/react/src/primitives/chainOfThought).

Related:

- [Chain of Thought Guide](/docs/guides/chain-of-thought)
- [MessagePrimitive](/docs/primitives/message)

# Generative UI

URL: /docs/guides/tool-ui

Render tool calls as interactive UI instead of plain text.

Create custom UI components for AI tool calls, providing visual feedback and interactive experiences when tools are executed.

<ToolUISample />

## Overview \[#overview]

Tool UIs in assistant-ui allow you to create custom interfaces that appear when AI tools are called. These generative UI components enhance the user experience by:

- **Visualizing tool execution** with loading states and progress indicators
- **Displaying results** in rich, formatted layouts
- **Enabling user interaction** through forms and controls
- **Providing error feedback** with helpful recovery options

This guide demonstrates building tool UIs with the **Vercel AI SDK**.

## Creating Tool UIs \[#creating-tool-uis]

There are two main approaches to creating tool UIs in assistant-ui:

### 1. Client-Defined Tools (`makeAssistantTool`) \[#1-client-defined-tools-makeassistanttool]

If you're creating tools on the client side, use `makeAssistantTool` to register them with the assistant context. Then create a UI component with `makeAssistantToolUI`. This component-based API coexists with the [Tools()](/docs/guides/tools) toolkit API; pick whichever fits your codebase better.

```tsx
import { makeAssistantTool, tool } from "@assistant-ui/react";
import { z } from "zod";

// Define the tool
const weatherTool = tool({
  description: "Get current weather for a location",
  parameters: z.object({
    location: z.string(),
    unit: z.enum(["celsius", "fahrenheit"]),
  }),
  execute: async ({ location, unit }) => {
    const weather = await fetchWeatherAPI(location, unit);
    return weather;
  },
});

// Register the tool
const WeatherTool = makeAssistantTool({
  ...weatherTool,
  toolName: "getWeather",
});

// Create the UI
const WeatherToolUI = makeAssistantToolUI<
  { location: string; unit: "celsius" | "fahrenheit" },
  { temperature: number; description: string }
>({
  toolName: "getWeather",
  render: ({ args, result, status }) => {
    if (status.type === "running") {
      return <div>Checking weather in {args.location}...</div>;
    }

    return (
      <div className="weather-card">
        <h3>{args.location}</h3>
        <p>
          {result.temperature}°{args.unit === "celsius" ? "C" : "F"}
        </p>
        <p>{result.description}</p>
      </div>
    );
  },
});
```

<Callout type="tip">
  Tools defined with `makeAssistantTool` can be passed to your backend using the
  `frontendTools` utility
</Callout>

Learn more about creating tools in the [Tools Guide](/docs/guides/tools).

### 2. UI-Only for Existing Tools (`makeAssistantToolUI`) \[#2-ui-only-for-existing-tools-makeassistanttoolui]

If your tool is defined elsewhere (e.g., in your backend API, MCP server, or LangGraph), use `makeAssistantToolUI` to create just the UI component:

```tsx
import { makeAssistantToolUI } from "@assistant-ui/react";

const WeatherToolUI = makeAssistantToolUI<
  { location: string; unit: "celsius" | "fahrenheit" },
  { temperature: number; description: string }
>({
  toolName: "getWeather", // Must match the backend tool name
  render: ({ args, result, status }) => {
    // UI rendering logic only
  },
});
```

## Quick Start Example \[#quick-start-example]

This example shows how to implement the UI-only approach using `makeAssistantToolUI`:

<Steps>
  <Step>
    ### Create a Tool UI Component \[#create-a-tool-ui-component]

    ```tsx
    import { makeAssistantToolUI } from "@assistant-ui/react";
    import { z } from "zod";

    type WeatherArgs = {
      location: string;
      unit: "celsius" | "fahrenheit";
    };

    type WeatherResult = {
      temperature: number;
      description: string;
      humidity: number;
      windSpeed: number;
    };

    const WeatherToolUI = makeAssistantToolUI<WeatherArgs, WeatherResult>({
      toolName: "getWeather",
      render: ({ args, status, result }) => {
        if (status.type === "running") {
          return (
            <div className="flex items-center gap-2">
              <Spinner />
              <span>Checking weather in {args.location}...</span>
            </div>
          );
        }

        if (status.type === "incomplete" && status.reason === "error") {
          return (
            <div className="text-red-500">
              Failed to get weather for {args.location}
            </div>
          );
        }

        return (
          <div className="weather-card rounded-lg bg-blue-50 p-4">
            <h3 className="text-lg font-bold">{args.location}</h3>
            <div className="mt-2 grid grid-cols-2 gap-4">
              <div>
                <p className="text-2xl">
                  {result.temperature}°{args.unit === "celsius" ? "C" : "F"}
                </p>
                <p className="text-gray-600">{result.description}</p>
              </div>
              <div className="text-sm">
                <p>Humidity: {result.humidity}%</p>
                <p>Wind: {result.windSpeed} km/h</p>
              </div>
            </div>
          </div>
        );
      },
    });
    ```

  </Step>

  <Step>
    ### Register the Tool UI \[#register-the-tool-ui]

    Place the component inside your `AssistantRuntimeProvider`:

    ```tsx
    function App() {
      return (
        <AssistantRuntimeProvider runtime={runtime}>
          <Thread />
          <WeatherToolUI />
        </AssistantRuntimeProvider>
      );
    }
    ```

  </Step>

  <Step>
    ### Define the Backend Tool (Vercel AI SDK) \[#define-the-backend-tool-vercel-ai-sdk]

    When using the Vercel AI SDK, define the corresponding tool in your API route:

    ```tsx title="/app/api/chat/route.ts"
    import { streamText, tool, zodSchema } from "ai";
    import { z } from "zod";

    export async function POST(req: Request) {
      const { messages } = await req.json();

      const result = streamText({
        model: openai("gpt-4o"),
        messages: await convertToModelMessages(messages),
        tools: {
          getWeather: tool({
            description: "Get current weather for a location",
            inputSchema: zodSchema(
              z.object({
                location: z.string(),
                unit: z.enum(["celsius", "fahrenheit"]),
              }),
            ),
            execute: async ({ location, unit }) => {
              const weather = await fetchWeatherAPI(location);
              return {
                temperature: weather.temp,
                description: weather.condition,
                humidity: weather.humidity,
                windSpeed: weather.wind,
              };
            },
          }),
        },
      });

      return result.toUIMessageStreamResponse();
    }
    ```

  </Step>
</Steps>

## Tool UI Patterns \[#tool-ui-patterns]

### Component Pattern \[#component-pattern]

Create standalone tool UI components:

```tsx
export const WebSearchToolUI = makeAssistantToolUI<{ query: string }, { results: SearchResult[] }>({
  toolName: "webSearch",
  render: ({ args, status, result }) => {
    return (
      <div className="search-container">
        <div className="mb-3 flex items-center gap-2">
          <SearchIcon />
          <span>Search results for: "{args.query}"</span>
        </div>

        {status.type === "running" && <LoadingSpinner />}

        {result && (
          <div className="space-y-2">
            {result.results.map((item, index) => (
              <div key={index} className="rounded border p-3">
                <a href={item.url} className="font-medium text-blue-600">
                  {item.title}
                </a>
                <p className="text-sm text-gray-600">{item.snippet}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
});
```

### Hook Pattern \[#hook-pattern]

Use hooks for dynamic tool UI registration:

<Callout type="tip">
  Use the `useAssistantToolUI` hook directly in your component for dynamic tool UI registration. This allows access to local component state and props when rendering the tool UI.
</Callout>

```tsx
import { useAssistantToolUI } from "@assistant-ui/react";

function DynamicToolUI() {
  const [theme, setTheme] = useState("light");

  useAssistantToolUI({
    toolName: "analyzeData",
    render: ({ args, result, status }) => {
      // Hook allows access to component state
      return <DataVisualization data={result} theme={theme} loading={status.type === "running"} />;
    },
  });

  return null;
}
```

### Inline Pattern \[#inline-pattern]

For tools that need access to parent component props:

<Callout type="tip">
  **Why `useInlineRender`?** By default, a tool UI's `render` function is
  static. Use `useInlineRender` when your UI needs access to dynamic component
  props (for example, to pass in an `id` or other contextual data).
</Callout>

```tsx
import { useAssistantToolUI, useInlineRender } from "@assistant-ui/react";

function ProductPage({ productId, productName }) {
  useAssistantToolUI({
    toolName: "checkInventory",
    render: useInlineRender(({ args, result }) => {
      // Access parent component props
      return (
        <div className="inventory-status">
          <h4>{productName} Inventory</h4>
          <p>
            Stock for {productId}: {result.quantity} units
          </p>
          <p>Location: {result.warehouse}</p>
        </div>
      );
    }),
  });

  return <div>Product details...</div>;
}
```

## Interactive Tool UIs \[#interactive-tool-uis]

### User Input Collection \[#user-input-collection]

Create tools that collect user input during execution:

<Callout type="tip">
  **Pro tip:** Call `addResult(...)` exactly once to complete the tool call.
  After it's invoked, the assistant will resume the conversation with your
  provided data.
</Callout>

```tsx
const DatePickerToolUI = makeAssistantToolUI<{ prompt: string }, { date: string }>({
  toolName: "selectDate",
  render: ({ args, result, addResult }) => {
    if (result) {
      return (
        <div className="rounded bg-green-50 p-3">
          ✅ Selected date: {new Date(result.date).toLocaleDateString()}
        </div>
      );
    }

    return (
      <div className="rounded border p-4">
        <p className="mb-3">{args.prompt}</p>
        <DatePicker
          onChange={(date) => {
            addResult({ date: date.toISOString() });
          }}
        />
      </div>
    );
  },
});
```

### Multi-Step Interactions \[#multi-step-interactions]

Build complex workflows with human-in-the-loop patterns for multi-step user interactions:

```tsx
const DeleteProjectTool = makeAssistantTool({
  toolName: "deleteProject",
  parameters: z.object({
    projectId: z.string(),
  }),
  execute: async ({ projectId }, { human }) => {
    const response = await human({ action, details });
    if (!response.approved) throw new Error("Project deletion cancelled");

    await deleteProject(projectId);
    return { success: true };
  },
});

const ApprovalTool = makeAssistantTool({
  ...tool({
    description: "Request user approval for an action",
    parameters: z.object({
      action: z.string(),
      details: z.any(),
    }),
    execute: async ({ action, details }, { human }) => {
      // Request approval from user
      const response = await human({ action, details });

      return {
        approved: response.approved,
        reason: response.reason,
      };
    },
  }),
  toolName: "requestApproval",
  render: ({ args, result, interrupt, resume }) => {
    const [reason, setReason] = useState("");

    // Show result after approval/rejection
    if (result) {
      return (
        <div className={result.approved ? "text-green-600" : "text-red-600"}>
          {result.approved ? "✅ Approved" : `❌ Rejected: ${result.reason}`}
        </div>
      );
    }

    // Show approval UI when waiting for user input
    if (interrupt) {
      return (
        <div className="rounded border-2 border-yellow-400 p-4">
          <h4 className="font-bold">Approval Required</h4>
          <p className="my-2">{interrupt.payload.action}</p>
          <pre className="rounded bg-gray-100 p-2 text-sm">
            {JSON.stringify(interrupt.payload.details, null, 2)}
          </pre>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => resume({ approved: true })}
              className="rounded bg-green-500 px-4 py-2 text-white"
            >
              Approve
            </button>
            <button
              onClick={() => resume({ approved: false, reason })}
              className="rounded bg-red-500 px-4 py-2 text-white"
            >
              Reject
            </button>
            <input
              type="text"
              placeholder="Rejection reason..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="flex-1 rounded border px-2"
            />
          </div>
        </div>
      );
    }

    return <div>Processing...</div>;
  },
});
```

<Callout type="tip">
  Use tool human input (`human()` / `resume()`) for workflows that need to
  pause tool execution and wait for user input. Use `addResult()` for "human
  tools" where the AI requests a tool call but the entire execution happens
  through user interaction.
</Callout>

## Advanced Features \[#advanced-features]

### Tool Status Handling \[#tool-status-handling]

The `status` prop provides detailed execution state:

```tsx
render: ({ status, args }) => {
  switch (status.type) {
    case "running":
      return <LoadingState />;

    case "requires-action":
      return <UserInputRequired reason={status.reason} />;

    case "incomplete":
      if (status.reason === "cancelled") {
        return <div>Operation cancelled</div>;
      }
      if (status.reason === "error") {
        return <ErrorDisplay error={status.error} />;
      }
      return <div>Failed: {status.reason}</div>;

    case "complete":
      return <SuccessDisplay />;
  }
};
```

### Deferred Rendering \[#deferred-rendering]

<Callout type="info">
  This section applies when the model **drives** the component through a tool call (args arrive incrementally and you want to wait for the final shape). If your backend or orchestrator pushes the component instead, prefer [Data-Part Generative UI](#data-part-generative-ui) with `makeAssistantDataUI`. Data parts arrive as terminal events, so the renderer only fires once with the final data, no deferred rendering needed.
</Callout>

Sometimes you want to capture a tool call's streaming arguments but only render the final UI once the call completes. This is useful when partial args would render misleading or jarring intermediate states (a chart that flashes through half-populated data), when the component is expensive to mount (heavy visualizations, embedded iframes, third-party widgets), or when the model controls _whether_ the component appears at all.

#### Inline at the end of streaming \[#inline-at-the-end-of-streaming]

Return `null` from the tool UI's `render` until `status.type === "complete"`. The streaming args still arrive in `args` as the model emits them, you just ignore them until the call is done:

```tsx
const ChartToolUI = makeAssistantToolUI<{ title: string; series: number[] }, void>({
  toolName: "renderChart",
  render: ({ args, status }) => {
    if (status.type !== "complete") return null;
    return <Chart title={args.title} data={args.series} />;
  },
});
```

The chart mounts once, with the final args, after streaming finishes. No re-renders during the stream.

The same `render` shape works inside the [`Tools()`](/docs/guides/tools) toolkit's `render` field, with `useAssistantToolUI`, and with `MessagePrimitive.Parts`'s inline `tools.by_name` overrides. The deferred-rendering pattern applies regardless of how you registered the tool UI.

#### Below the message body \[#below-the-message-body]

If the component should sit _outside_ the message parts (for example, a card attached under the avatar block rather than inline with text), gate at the message level with [`AuiIf`](/docs/api-reference/primitives/assistant-if) and read `s.message.status`:

```tsx
import { MessagePrimitive, AuiIf, useAuiState } from "@assistant-ui/react";

function PostMessageCard() {
  const parts = useAuiState((s) => s.message.parts);
  const chartCall = parts.find((p) => p.type === "tool-call" && p.toolName === "renderChart");
  if (!chartCall) return null;
  return <Chart {...chartCall.args} />;
}

<MessagePrimitive.Root>
  <MessagePrimitive.Parts />

  <AuiIf condition={(s) => s.message.role === "assistant" && s.message.status?.type === "complete"}>
    <PostMessageCard />
  </AuiIf>
</MessagePrimitive.Root>;
```

The `AuiIf` predicate fires whenever the assistant state changes; children mount only when both checks pass. `PostMessageCard` then reads the captured tool-call part from `s.message.parts` and renders from its args.

For the opposite pattern (showing partial data as it streams in), see [Field-Level Streaming State](#field-level-streaming-state) and [Partial Results & Streaming](#partial-results--streaming) below.

### Field-Level Streaming State \[#field-level-streaming-state]

Use `useToolArgsStatus` to react to per-field streaming state. The hook returns a `propStatus` map where each top-level key in the args object resolves from `"streaming"` to `"complete"` as the partial JSON arrives. Call it inside a tool-call message part context:

```tsx
import { useToolArgsStatus } from "@assistant-ui/react";

const FormToolUI = makeAssistantToolUI<{ email: string; phone: string }, unknown>({
  toolName: "submitForm",
  render: ({ args }) => {
    const { propStatus } = useToolArgsStatus<{ email: string; phone: string }>();

    return (
      <form className="space-y-4">
        <div>
          <input
            type="email"
            value={args.email ?? ""}
            className={propStatus.email === "streaming" ? "loading" : ""}
            disabled
          />
        </div>

        <div>
          <input
            type="tel"
            value={args.phone ?? ""}
            className={propStatus.phone === "streaming" ? "loading" : ""}
            disabled
          />
        </div>
      </form>
    );
  },
});
```

### Partial Results & Streaming \[#partial-results--streaming]

Display results as they stream in:

```tsx
const AnalysisToolUI = makeAssistantToolUI<
  { data: string },
  { progress: number; insights: string[] }
>({
  toolName: "analyzeData",
  render: ({ result, status }) => {
    const progress = result?.progress || 0;
    const insights = result?.insights || [];

    return (
      <div className="analysis-container">
        {status.type === "running" && (
          <div className="mb-4">
            <div className="mb-1 flex justify-between">
              <span>Analyzing...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full rounded bg-gray-200">
              <div className="h-2 rounded bg-blue-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <div className="space-y-2">
          {insights.map((insight, i) => (
            <div key={i} className="rounded bg-gray-50 p-2">
              {insight}
            </div>
          ))}
        </div>
      </div>
    );
  },
});
```

### Custom Tool Fallback \[#custom-tool-fallback]

For tools that have no dedicated UI, add the `ToolFallback` shadcn component to your project. See the [ToolFallback install guide](/docs/ui/tool-fallback) for setup instructions and the [ToolGroup guide](/docs/ui/tool-group) for grouping consecutive tool calls into a collapsible container.

## Execution Context \[#execution-context]

Generative UI components have access to execution context through props:

```tsx
type ToolCallMessagePartProps<TArgs, TResult> = {
  // Tool arguments
  args: TArgs;
  argsText: string; // JSON stringified args

  // Execution status
  status: ToolCallMessagePartStatus;
  isError?: boolean;

  // Tool result (may be partial during streaming)
  result?: TResult;

  // Tool metadata
  toolName: string;
  toolCallId: string;

  // Interactive callbacks
  addResult: (result: TResult | ToolResponse<TResult>) => void;
  resume: (payload: unknown) => void;

  // Interrupt state
  interrupt?: { type: "human"; payload: unknown }; // Payload from context.human()

  // Optional artifact data
  artifact?: unknown;
};
```

### Human Input Handling \[#human-input-handling]

When a tool calls `human()` during execution, the payload becomes available in the render function as `interrupt.payload`:

```tsx
const ConfirmationToolUI = makeAssistantToolUI<{ action: string }, { confirmed: boolean }>({
  toolName: "confirmAction",
  render: ({ args, result, interrupt, resume }) => {
    // Tool is waiting for user input
    if (interrupt) {
      return (
        <div className="confirmation-dialog">
          <p>Confirm: {interrupt.payload.message}</p>
          <button onClick={() => resume(true)}>Yes</button>
          <button onClick={() => resume(false)}>No</button>
        </div>
      );
    }

    // Tool completed
    if (result) {
      return <div>Action {result.confirmed ? "confirmed" : "cancelled"}</div>;
    }

    return <div>Processing...</div>;
  },
});
```

Learn more about tool human input in the [Tools Guide](/docs/guides/tools#human-in-the-loop).

## Best Practices \[#best-practices]

### 1. Handle All Status States \[#1-handle-all-status-states]

Always handle loading, error, and success states:

```tsx
render: ({ status, result, args }) => {
  if (status.type === "running") return <Skeleton />;
  if (status.type === "incomplete") return <ErrorState />;
  if (!result) return null;
  return <ResultDisplay result={result} />;
};
```

### 2. Provide Visual Feedback \[#2-provide-visual-feedback]

Use animations and transitions for better UX:

```tsx
<div
  className={cn(
    "transition-all duration-300",
    status.type === "running" && "opacity-50",
    status.type === "complete" && "opacity-100",
  )}
>
  {/* Tool UI content */}
</div>
```

### 3. Make UIs Accessible \[#3-make-uis-accessible]

Ensure keyboard navigation and screen reader support:

```tsx
<button
  onClick={() => addResult(value)}
  aria-label="Confirm selection"
  className="focus:outline-none focus:ring-2"
>
  Confirm
</button>
```

### 4. Optimize Performance \[#4-optimize-performance]

Use `useInlineRender` to prevent unnecessary re-renders:

```tsx
useAssistantToolUI({
  toolName: "heavyComputation",
  render: useInlineRender(({ result }) => {
    // Expensive rendering logic
    return <ComplexVisualization data={result} />;
  }),
});
```

<Callout>
  Generative UI components are only displayed in the chat interface. The actual
  tool execution happens on the backend. This separation allows you to create
  rich, interactive experiences while keeping sensitive logic secure on the
  server.
</Callout>

## Per-Property Streaming Status \[#per-property-streaming-status]

When rendering a tool UI, you can track which arguments have finished streaming using `useToolArgsStatus`. This must be used inside a tool-call message part context.

```tsx
import { useToolArgsStatus } from "@assistant-ui/react";

const WeatherUI = makeAssistantToolUI({
  toolName: "weather",
  render: ({ args }) => {
    const { status, propStatus } = useToolArgsStatus<{
      location: string;
      unit: string;
    }>();

    return (
      <div>
        <span className={propStatus.location === "streaming" ? "animate-pulse" : ""}>
          {args.location ?? "..."}
        </span>
        {status === "complete" && <WeatherChart data={args} />}
      </div>
    );
  },
});
```

`propStatus` maps each key to `"streaming"` | `"complete"` once the key appears in the partial JSON. Keys not yet present in the stream are absent from `propStatus`.

## Data-Part Generative UI \[#data-part-generative-ui]

Alongside tool-call rendering, assistant-ui supports a second generative UI mechanism based on `DataMessagePart`. Instead of attaching UI to a tool invocation, the backend (or the LangGraph graph) emits named data events that are appended as `{ type: "data", name, data }` parts on the parent assistant message.

**When to choose which:**

- **Tool UI**: the **model** decides what to render by calling a tool whose args become the component's data. Register the renderer via the [`Tools()`](/docs/guides/tools) toolkit's `render` field (recommended), or standalone with `makeAssistantToolUI` / `useAssistantToolUI` when the tool itself is defined elsewhere (backend, MCP, LangGraph). Args stream incrementally, so you observe partial state via `status` / `useToolArgsStatus` and may need [Deferred Rendering](#deferred-rendering) for components that should only mount with final data.
- **Data UI** (`makeAssistantDataUI`): the **backend or orchestrator** decides what to render and pushes a named data event onto the assistant message. Data parts arrive as terminal events with no streaming partials, so the renderer naturally fires once with the final data.

If you want a component to appear only after the message is complete and you control the backend, Data UI is usually the more direct fit; reach for Tool UI's deferred pattern when the model itself must drive the choice.

Use `makeAssistantDataUI` to register a renderer for a named data part:

```tsx
import { makeAssistantDataUI } from "@assistant-ui/react";

type ChartProps = { series: number[]; title: string };

export const ChartUI = makeAssistantDataUI<ChartProps>({
  name: "chart",
  render: ({ data }) => (
    <div>
      <h3>{data.title}</h3>
      <Chart series={data.series} />
    </div>
  ),
});
```

Mount `<ChartUI />` once inside the `AssistantRuntimeProvider` tree; it renders nothing itself and only registers the renderer.

For LangGraph-specific patterns (emitting UI from a Python/TypeScript graph node via `push_ui_message` / `typedUi`, dynamic loading with `LoadExternalComponent`, and the `useLangGraphUIMessages` escape hatch), see [LangGraph Generative UI](/docs/runtimes/langgraph/generative-ui).

A fallback renderer for unmatched data parts is available internally but `setFallbackDataUI` is not yet a public API.

## Related Guides \[#related-guides]

- [Tools Guide](/docs/guides/tools) - Learn how to create and use tools with AI models
- [Multi-Agent](/docs/guides/multi-agent) - Render sub-agent conversations inside tool call UIs
- [Tool Fallback](/docs/ui/tool-fallback) - Default UI for tools without custom components
- [API Reference](/docs/api-reference/primitives/message-part) - Detailed type definitions and component APIs
- [Message Primitive](/docs/api-reference/primitives/message) - Complete Message component documentation

# Text-to-Speech (Speech Synthesis)

URL: /docs/guides/speech

Read messages aloud with Web Speech API or a custom TTS adapter.

assistant-ui supports text-to-speech via the `SpeechSynthesisAdapter` interface. When a speech adapter is configured, users can trigger playback for any assistant message.

<SpeechSample />

## SpeechSynthesisAdapter \[#speechsynthesisadapter]

The `SpeechSynthesisAdapter` interface has a single method:

```tsx
import type { SpeechSynthesisAdapter } from "@assistant-ui/react";

type SpeechSynthesisAdapter = {
  speak: (text: string) => SpeechSynthesisAdapter.Utterance;
};
```

`speak` is called with the plain text of an assistant message and must return an `Utterance` object:

```tsx
type Utterance = {
  status: SpeechSynthesisAdapter.Status;
  cancel: () => void;
  subscribe: (callback: () => void) => Unsubscribe;
};

type Status =
  | { type: "starting" | "running" }
  | { type: "ended"; reason: "finished" | "cancelled" | "error"; error?: unknown };
```

Currently the following built-in adapter is available:

- `WebSpeechSynthesisAdapter`: uses the browser's `Web Speech API` (`SpeechSynthesis`)

## WebSpeechSynthesisAdapter \[#webspeechsynthesisadapter]

```tsx
import { WebSpeechSynthesisAdapter } from "@assistant-ui/react";

const runtime = useChatRuntime({
  adapters: {
    speech: new WebSpeechSynthesisAdapter(),
  },
});
```

## UI \[#ui]

The default action bar does not include a speech button. Add `ActionBarPrimitive.Speak` and `ActionBarPrimitive.StopSpeaking` to your assistant message action bar:

```tsx
import { ActionBarPrimitive, useMessageTTS } from "@assistant-ui/react";
import { AudioLinesIcon, StopCircleIcon } from "lucide-react";

const AssistantActionBar = () => {
  const isSpeaking = useMessageTTS();

  return (
    <ActionBarPrimitive.Root>
           {" "}
      {!isSpeaking && (
        <ActionBarPrimitive.Speak>
                    <AudioLinesIcon />       {" "}
        </ActionBarPrimitive.Speak>
      )}
           {" "}
      {isSpeaking && (
        <ActionBarPrimitive.StopSpeaking>
                    <StopCircleIcon />       {" "}
        </ActionBarPrimitive.StopSpeaking>
      )}
            <ActionBarPrimitive.Copy />   {" "}
    </ActionBarPrimitive.Root>
  );
};
```

`ActionBarPrimitive.Speak` is automatically disabled when no speech adapter is configured.

## Custom Adapters \[#custom-adapters]

Implement `SpeechSynthesisAdapter` to call any external TTS API:

```tsx title="lib/custom-tts-adapter.ts"
import type { SpeechSynthesisAdapter } from "@assistant-ui/react";

export class CustomTTSAdapter implements SpeechSynthesisAdapter {
  private apiUrl: string;

  constructor(options: { apiUrl: string }) {
    this.apiUrl = options.apiUrl;
  }

  speak(text: string): SpeechSynthesisAdapter.Utterance {
    const subscribers = new Set<() => void>();
    let status: SpeechSynthesisAdapter.Status = { type: "starting" };
    let audio: HTMLAudioElement | null = null;

    const notify = () => {
      for (const cb of subscribers) cb();
    };

    const finish = (reason: "finished" | "cancelled" | "error", error?: unknown) => {
      if (status.type === "ended") return;
      status = { type: "ended", reason, error };
      notify();
    };

    fetch(this.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then((res) => res.blob())
      .then((blob) => {
        audio = new Audio(URL.createObjectURL(blob));
        status = { type: "running" };
        notify();
        audio.onended = () => finish("finished");
        audio.onerror = (e) => finish("error", e);
        audio.play();
      })
      .catch((err) => finish("error", err));

    return {
      get status() {
        return status;
      },
      cancel: () => {
        audio?.pause();
        finish("cancelled");
      },
      subscribe: (cb) => {
        subscribers.add(cb);
        return () => subscribers.delete(cb);
      },
    };
  }
}
```

Wire it up the same way as the built-in adapter:

```tsx
import { CustomTTSAdapter } from "@/lib/custom-tts-adapter";

const runtime = useChatRuntime({
  adapters: {
    speech: new CustomTTSAdapter({ apiUrl: "/api/tts" }),
  },
});
```

# Context Display

URL: /docs/ui/context-display

Visualize token usage relative to a model's context window — ring, bar, or text — with a detailed hover popover.

<ContextDisplaySample />

<Callout type="info">
  This component requires server-side setup to [forward token usage metadata](#forward-token-usage-from-your-route-handler). Without it, ContextDisplay will show 0 usage and no breakdown data.
</Callout>

## Getting Started \[#getting-started]

<Steps>
  <Step>
    ### Add `context-display` \[#add-context-display]

    <InstallCommand shadcn="[&#x22;context-display&#x22;]" />

    This adds a `/components/assistant-ui/context-display.tsx` file to your project.
  </Step>

  <Step>
    ### Forward token usage from your route handler \[#forward-token-usage-from-your-route-handler]

    Use `messageMetadata` in your Next.js route to attach `usage` from `finish` and `modelId` from `finish-step`:

    ```tsx title="app/api/chat/route.ts"
    import { streamText, convertToModelMessages } from "ai";

    export async function POST(req: Request) {
      const { messages, config } = await req.json();
      const result = streamText({
        model: getModel(config?.modelName),
        messages: await convertToModelMessages(messages),
      });
      return result.toUIMessageStreamResponse({
        messageMetadata: ({ part }) => {
          if (part.type === "finish") {
            return {
              usage: part.totalUsage,
            };
          }
          if (part.type === "finish-step") {
            return {
              modelId: part.response.modelId,
            };
          }
          return undefined;
        },
      });
    }
    ```
  </Step>

  <Step>
    ### Use in your application \[#use-in-your-application]

    Pick a variant and place it in your thread footer, composer, or sidebar. Pass `modelContextWindow` with your model's token limit.

    ```tsx title="/components/assistant-ui/thread.tsx" {1,8}
    import { ContextDisplay } from "@/components/assistant-ui/context-display";

    const ThreadFooter: FC = () => {
      return (
        <div className="flex items-center justify-end px-3 py-1.5">
          <ContextDisplay.Bar modelContextWindow={128000} />
        </div>
      );
    };
    ```
  </Step>
</Steps>

## Variants \[#variants]

Three preset variants are available, each wrapping the shared tooltip popover:

```tsx
// SVG donut ring (default, compact)
<ContextDisplay.Ring modelContextWindow={128000} />

// Horizontal progress bar with label
<ContextDisplay.Bar modelContextWindow={128000} />

// Minimal monospace text
<ContextDisplay.Text modelContextWindow={128000} />
```

All presets accept `className` for styling overrides and `side` to control tooltip placement (`"top"`, `"bottom"`, `"left"`, `"right"`).

## Composable API \[#composable-api]

For custom visualizations, use the building blocks directly:

```tsx
import { ContextDisplay } from "@/components/assistant-ui/context-display";

<ContextDisplay.Root modelContextWindow={128000}>
   {" "}
  <ContextDisplay.Trigger aria-label="Context usage">
        <MyCustomGauge /> {" "}
  </ContextDisplay.Trigger>
    <ContextDisplay.Content side="top" />
</ContextDisplay.Root>;
```

| Component | Description                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Root`    | Uses provided `usage` when supplied, otherwise fetches token usage internally; provides shared context and wraps children in a tooltip  |
| `Trigger` | Button that opens the tooltip on hover                                                                                                  |
| `Content` | Tooltip popover with the token breakdown (Usage %, Input, Cached, Output, Reasoning, Total)                                             |

## API Reference \[#api-reference]

### Preset Props \[#preset-props]

All preset variants (`Ring`, `Bar`, `Text`) share the same props:

| Prop                  | Type                                      | Default  | Description                                                                         |
| --------------------- | ----------------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `modelContextWindow`  | `number`                                  | —        | Maximum token limit of the current model (required)                                 |
| `className`           | `string`                                  | —        | Additional class names on the trigger button                                        |
| `side`                | `"top" \| "bottom" \| "left" \| "right"`  | `"top"`  | Tooltip placement                                                                   |
| `usage`               | `ThreadTokenUsage`                        | —        | Optional externally-provided usage data (skips internal usage fetch when provided)  |

### Color Thresholds \[#color-thresholds]

Ring and Bar share the same severity colors:

| Level    | Threshold    | Ring                  | Bar               |
| -------- | ------------ | --------------------- | ----------------- |
| Low      | `< 65%`      | `stroke-emerald-500`  | `bg-emerald-500`  |
| Warning  | `65% – 85%`  | `stroke-amber-500`    | `bg-amber-500`    |
| Critical | `> 85%`      | `stroke-red-500`      | `bg-red-500`      |

Text displays numeric values only — no severity color.

## Related \[#related]

- [Message Timing](/docs/ui/message-timing) — Streaming performance stats (TTFT, tok/s)
- [Thread](/docs/ui/thread) — The thread component where ContextDisplay is typically placed
