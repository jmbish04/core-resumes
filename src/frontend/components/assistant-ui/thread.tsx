"use client";

import {
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  ActionBarPrimitive,
  ErrorPrimitive,
  AuiIf,
} from "@assistant-ui/react";
import {
  SendIcon,
  MicIcon,
  SquareIcon,
  Volume2Icon,
  VolumeXIcon,
  CopyIcon,
  CheckIcon,
  RefreshCcwIcon,
  XCircleIcon,
  AlertTriangleIcon,
} from "lucide-react";
import { useState, type ComponentPropsWithoutRef } from "react";

import { MarkdownText } from "./markdown-text";
import { Reasoning } from "./reasoning";
import { ToolFallback } from "./tool-fallback";

// ---------------------------------------------------------------------------
// Thread — the main chat container
// ---------------------------------------------------------------------------

export function Thread() {
  return (
    <ThreadPrimitive.Root className="flex flex-col h-full">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
        <ThreadWelcome />
        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />
      </ThreadPrimitive.Viewport>
      <Composer />
    </ThreadPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Welcome screen with suggestions
// ---------------------------------------------------------------------------

function ThreadWelcome() {
  return (
    <ThreadPrimitive.Empty>
      <div className="flex flex-col items-center justify-center h-full p-6 text-center">
        <h3 className="text-lg font-semibold mb-2">Career Assistant</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-md">
          I can help you draft resumes, cover letters, prepare for interviews, and analyze job
          requirements. Ask me anything about this role.
        </p>
        <ThreadPrimitive.Suggestion
          prompt="Help me tailor my resume for this role"
          method="replace"
          autoSend
        >
          <SuggestionButton text="Tailor my resume" />
        </ThreadPrimitive.Suggestion>
        <ThreadPrimitive.Suggestion
          prompt="What are my strongest qualifications for this position?"
          method="replace"
          autoSend
        >
          <SuggestionButton text="Analyze my fit" />
        </ThreadPrimitive.Suggestion>
        <ThreadPrimitive.Suggestion
          prompt="Draft a cover letter for this role"
          method="replace"
          autoSend
        >
          <SuggestionButton text="Draft cover letter" />
        </ThreadPrimitive.Suggestion>
        <ThreadPrimitive.Suggestion
          prompt="Generate a fresh set of mock interview questions for this role"
          method="replace"
          autoSend
        >
          <SuggestionButton text="Mock interview prep" />
        </ThreadPrimitive.Suggestion>
        <ThreadPrimitive.Suggestion
          prompt="Search my career memory for relevant experience at Google"
          method="replace"
          autoSend
        >
          <SuggestionButton text="Search career memory" />
        </ThreadPrimitive.Suggestion>
        <ThreadPrimitive.Suggestion
          prompt="What does NotebookLM say about my qualifications for this role?"
          method="replace"
          autoSend
        >
          <SuggestionButton text="Ask NotebookLM" />
        </ThreadPrimitive.Suggestion>
      </div>
    </ThreadPrimitive.Empty>
  );
}

function SuggestionButton({ text, ...props }: { text: string } & ComponentPropsWithoutRef<"button">) {
  return (
    <button
      {...props}
      className="px-4 py-2 mb-2 text-sm rounded-lg border border-border hover:bg-muted/50 transition-colors w-64 cursor-pointer"
    >
      {text}
    </button>
  );
}

// ---------------------------------------------------------------------------
// User message
// ---------------------------------------------------------------------------

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end px-4 py-2">
      <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5 max-w-[80%]">
        <MessagePrimitive.Content
          components={{
            Text: ({ text }) => <p className="text-sm whitespace-pre-wrap">{text}</p>,
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Assistant message — renders text, reasoning, tool calls, and sources
// ---------------------------------------------------------------------------

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex px-4 py-2">
      <div className="bg-muted/50 rounded-2xl rounded-bl-sm px-4 py-2.5 max-w-[85%]">
        <MessagePrimitive.Content
          components={{
            Text: MarkdownText,
            Reasoning: ReasoningPart,
            tools: {
              Fallback: ToolFallbackPart,
            },
          }}
        />
        <MessagePrimitive.Error>
          <InlineStreamError />
        </MessagePrimitive.Error>
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
  );
}

/**
 * ReasoningPart — collapsible thinking/reasoning content part.
 * Wired into MessagePrimitive.Content as the Reasoning component.
 */
function ReasoningPart({ text }: { text: string }) {
  return <Reasoning text={text} />;
}

/**
 * ToolFallbackPart — fallback UI for tool calls without a registered ToolUI.
 * Wired into MessagePrimitive.Content via the tools.Fallback slot.
 *
 * Renders a polished shadcn-style card with error display and copy-to-clipboard
 * for debugging — never uses chrome alerts.
 */
function ToolFallbackPart({
  toolName,
  args,
  result,
  status,
}: {
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  status?: { type: "running" | "complete" | "incomplete" | "requires-action" };
}) {
  return <ToolFallback toolName={toolName} args={args} result={result} status={status} />;
}

/**
 * InlineStreamError — renders stream-level errors inside assistant messages.
 *
 * Uses ErrorPrimitive.Root + ErrorPrimitive.Message from assistant-ui to access
 * error context. Includes copy-to-clipboard so users can share the error with
 * their coding agent for debugging. Never uses chrome alerts.
 */
function InlineStreamError() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (errorText: string) => {
    const report = [
      `## Chat Stream Error Report`,
      `**Timestamp:** ${new Date().toISOString()}`,
      ``,
      `### Error Message`,
      `\`\`\``,
      errorText,
      `\`\`\``,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(report);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = report;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <ErrorPrimitive.Root className="mt-2 rounded-lg bg-destructive/5 border border-destructive/20 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-destructive/10 bg-destructive/5">
        <div className="flex items-center gap-2">
          <XCircleIcon className="size-4 text-destructive shrink-0" />
          <span className="text-xs font-semibold text-destructive">
            Something went wrong
          </span>
        </div>
        <button
          onClick={() => {
            // Grab the error text from the DOM for copy
            const errorEl = document.querySelector("[data-slot='error-message']");
            handleCopy(errorEl?.textContent ?? "Unknown error");
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-medium rounded-md bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors shrink-0 cursor-pointer"
          title="Copy error report to clipboard — paste into your coding agent to debug"
        >
          {copied ? (
            <>
              <CheckIcon className="size-3" />
              Copied!
            </>
          ) : (
            <>
              <CopyIcon className="size-3" />
              Copy for debugging
            </>
          )}
        </button>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5">
        <ErrorPrimitive.Message
          data-slot="error-message"
          className="text-xs text-destructive/80 leading-relaxed block mb-2"
        />
        <div className="flex items-start gap-1.5 p-2 rounded bg-muted/20 border border-border/30">
          <AlertTriangleIcon className="size-3 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Click <strong>"Copy for debugging"</strong> to copy the full error report,
            then paste it into your coding agent to diagnose and fix the issue.
          </p>
        </div>
      </div>
    </ErrorPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Assistant action bar (copy, speak, retry)
// ---------------------------------------------------------------------------

function AssistantActionBar() {
  const [copied, setCopied] = useState(false);

  return (
    <ActionBarPrimitive.Root className="flex items-center gap-1 mt-2 -mb-1">
      <ActionBarPrimitive.Copy
        onClick={() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="p-1.5 rounded-md hover:bg-background/60 transition-colors text-muted-foreground"
      >
        {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      </ActionBarPrimitive.Copy>

      <ActionBarPrimitive.Speak className="p-1.5 rounded-md hover:bg-background/60 transition-colors text-muted-foreground">
        <Volume2Icon className="size-3.5" />
      </ActionBarPrimitive.Speak>

      <ActionBarPrimitive.StopSpeaking className="p-1.5 rounded-md hover:bg-background/60 transition-colors text-muted-foreground">
        <VolumeXIcon className="size-3.5" />
      </ActionBarPrimitive.StopSpeaking>

      <ActionBarPrimitive.Reload className="p-1.5 rounded-md hover:bg-background/60 transition-colors text-muted-foreground">
        <RefreshCcwIcon className="size-3.5" />
      </ActionBarPrimitive.Reload>
    </ActionBarPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Composer — input area with dictation
// ---------------------------------------------------------------------------

function Composer() {
  return (
    <ComposerPrimitive.Root className="flex items-end gap-2 border-t border-border p-3 bg-background">
      <ComposerPrimitive.Input
        className="min-h-[40px] flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
        placeholder="Type a message or use voice..."
        autoFocus
      />

      <div className="flex gap-1.5">
        {/* Show Dictate button when not dictating */}
        <AuiIf condition={(s) => s.composer.dictation == null}>
          <ComposerPrimitive.Dictate className="inline-flex items-center justify-center rounded-md text-sm hover:bg-muted h-9 w-9 text-muted-foreground transition-colors">
            <MicIcon className="h-4 w-4" />
          </ComposerPrimitive.Dictate>
        </AuiIf>

        {/* Show Stop button when dictating */}
        <AuiIf condition={(s) => s.composer.dictation != null}>
          <ComposerPrimitive.StopDictation className="inline-flex items-center justify-center rounded-md text-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 h-9 w-9 transition-colors">
            <SquareIcon className="h-4 w-4 animate-pulse fill-current" />
          </ComposerPrimitive.StopDictation>
        </AuiIf>

        <ComposerPrimitive.Send className="inline-flex items-center justify-center rounded-md text-sm bg-primary text-primary-foreground hover:bg-primary/90 h-9 w-9 transition-colors disabled:opacity-50">
          <SendIcon className="h-4 w-4" />
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  );
}
