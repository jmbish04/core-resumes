/**
 * @fileoverview NotebookChat — a full-featured React chat component for
 * conversing with the NotebookLM career knowledge base.
 *
 * Rendered as a `client:load` island on the `/notebook` Astro page.
 * All messages are sent as HTTP POST requests to `/api/notebook/chat`
 * (session-cookie-authenticated) — no WebSocket required because the
 * NotebookLM SDK returns complete answers synchronously.
 *
 * Features:
 *  - User / assistant message bubbles with entrance animations
 *  - Animated typing indicator while waiting for the API response
 *  - Expandable source-reference panel on each assistant message
 *  - Suggested-prompt cards on the empty state for quick onboarding
 *  - Auto-resizing textarea (up to 200 px) with Enter-to-send
 *  - Inline error display with toast notification via `api-client`
 */

import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiPost } from "@/lib/api-client";
import { parseMarkdownToHtml } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A source reference returned by NotebookLM alongside the answer. */
type Reference = {
  sourceId?: string;
  sourceTitle?: string;
  snippet?: string;
  [key: string]: unknown;
};

/** Response shape from `POST /api/notebook/chat`. */
type NotebookResponse = {
  answer: string;
  conversationId: string;
  turnNumber: number;
  references: Reference[];
};

/** A single message in the local chat history (not persisted to D1). */
type ChatMessage = {
  /** Client-generated UUID. */
  id: string;
  /** Whether this message was sent by the user or returned by the assistant. */
  role: "user" | "assistant";
  /** The message text content. */
  content: string;
  /** Source references (assistant messages only). */
  references?: Reference[];
  /** Epoch-millisecond timestamp for display ordering. */
  timestamp: number;
  /** Error message if the API call failed (assistant messages only). */
  error?: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Starter questions shown on the empty state to guide first-time users. */
const SUGGESTED_PROMPTS = [
  "What are the key skills on my resume?",
  "Summarize my career experience",
  "What industries have I worked in?",
  "Suggest improvements for my resume",
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Collapsible panel that displays source references cited by NotebookLM.
 * Rendered below each assistant message bubble.
 */
function ReferencePanel({ references }: { references: Reference[] }) {
  const [open, setOpen] = useState(false);

  if (references.length === 0) return null;

  return (
    <div className="mt-2 rounded-lg border border-border/40 bg-muted/30">
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-1.5">
          <BookOpen className="size-3" />
          {references.length} source{references.length > 1 ? "s" : ""}
        </span>
        {open ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
      </button>
      {open && (
        <div className="grid gap-2 border-t border-border/30 px-3 py-2">
          {references.map((ref, i) => (
            <div key={ref.sourceId ?? i} className="rounded-md bg-background/60 px-3 py-2">
              {ref.sourceTitle && (
                <div className="text-xs font-medium text-foreground">{ref.sourceTitle}</div>
              )}
              {ref.snippet && (
                <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {ref.snippet}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Renders a single chat message as a styled bubble.
 * User messages are right-aligned with primary bg; assistant messages are
 * left-aligned with card bg and an optional reference panel.
 */
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const hasError = !!message.error;
  const isEmpty = !message.content && !hasError;

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-primary text-primary-foreground"
            : hasError
              ? "bg-red-950/50 text-red-300 ring-1 ring-red-500/30"
              : "bg-card text-card-foreground ring-1 ring-foreground/10"
        }`}
      >
        {hasError ? (
          <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0 text-red-400">⚠</span>
            <span>{message.error}</span>
          </div>
        ) : isEmpty ? (
          <div className="italic text-muted-foreground">
            No response received. The service may be temporarily unavailable.
          </div>
        ) : (
          <div
            className="whitespace-pre-wrap prose prose-sm prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: parseMarkdownToHtml(message.content) }}
          />
        )}
        {!isUser && message.references && <ReferencePanel references={message.references} />}
      </div>
    </div>
  );
}

/**
 * Animated three-dot typing indicator shown while waiting for the
 * NotebookLM API response.
 */
function TypingIndicator() {
  return (
    <div className="flex justify-start animate-in fade-in duration-300">
      <div className="flex items-center gap-1.5 rounded-2xl bg-card px-4 py-3 ring-1 ring-foreground/10">
        <div className="size-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:0ms]" />
        <div className="size-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
        <div className="size-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
      </div>
    </div>
  );
}

/**
 * Branded empty state shown when no messages exist.
 * Displays the NotebookLM branding and four suggested-prompt cards.
 *
 * @param onPromptClick - Callback fired when a suggested prompt card is clicked.
 */
function EmptyState({ onPromptClick }: { onPromptClick: (prompt: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-12">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
        <Sparkles className="size-8 text-primary" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-semibold tracking-tight">NotebookLM</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Ask questions about your career documents, resume content, and professional profile.
        </p>
      </div>
      <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="rounded-xl border border-border/60 bg-card px-4 py-3 text-left text-sm text-card-foreground transition hover:border-primary/40 hover:bg-card/80 hover:shadow-sm"
            onClick={() => onPromptClick(prompt)}
          >
            <MessageSquare className="mb-1.5 size-4 text-muted-foreground" />
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Full-screen chat interface for querying the NotebookLM career knowledge base.
 *
 * State is entirely client-side — messages are not persisted to D1.
 * Each user message triggers a `POST /api/notebook/chat` request and the
 * response is appended as an assistant message with optional references.
 */
export function NotebookChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** Smooth-scroll the message list to the bottom after new content. */
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, scrollToBottom]);

  /**
   * Send a query to the NotebookLM API and append the response.
   *
   * Creates a user message immediately, fires the API call, and then
   * appends either a successful assistant message (with references) or
   * an error message on failure.
   */
  const sendMessage = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed || loading) return;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInput("");
      setLoading(true);

      // Reset textarea height after clearing input
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }

      try {
        const result = await apiPost<NotebookResponse>("/api/notebook/chat", { query: trimmed });

        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: result.answer || "",
          references: result.references,
          timestamp: Date.now(),
          // Surface empty answer as a user-facing error
          error: result.answer
            ? undefined
            : "NotebookLM returned an empty answer. The service credentials may need to be refreshed.",
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        const errorMessage =
          err instanceof Error && err.message
            ? err.message
            : "Failed to get a response. Please try again.";

        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "",
          error: errorMessage,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } finally {
        setLoading(false);
        textareaRef.current?.focus();
      }
    },
    [loading],
  );

  /** Submit on Enter (without Shift) — Shift+Enter inserts a newline. */
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  /** Update input state and auto-resize the textarea (max 200 px). */
  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  return (
    <Card className="flex h-[calc(100svh-7rem)] flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/40 px-6 py-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
          <Sparkles className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-sm font-semibold">NotebookLM Chat</h1>
          <p className="text-xs text-muted-foreground">
            Career knowledge base · {messages.filter((m) => m.role === "user").length} messages
          </p>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4 no-scrollbar"
      >
        {messages.length === 0 && !loading ? (
          <EmptyState onPromptClick={(prompt) => void sendMessage(prompt)} />
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            {loading && <TypingIndicator />}
          </>
        )}
      </div>

      {/* Input */}
      <CardContent className="border-t border-border/40 py-4">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            id="notebook-chat-input"
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your career docs…"
            rows={1}
            disabled={loading}
            className="flex-1 resize-none rounded-xl border border-input bg-input/30 px-4 py-3 text-sm outline-none transition placeholder:text-muted-foreground/60 focus:border-ring focus:ring-[3px] focus:ring-ring/50 disabled:opacity-50"
          />
          <Button
            id="notebook-chat-send"
            size="icon"
            disabled={loading || !input.trim()}
            onClick={() => void sendMessage(input)}
            className="size-11 shrink-0 rounded-xl transition-all hover:shadow-md disabled:opacity-40"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
