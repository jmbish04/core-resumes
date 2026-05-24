"use client";

import {
  WrenchIcon,
  Loader2Icon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  CopyIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "lucide-react";
import { useState } from "react";

// ---------------------------------------------------------------------------
// ToolFallback — resilient fallback UI for unregistered or failed tool calls.
//
// Renders a polished shadcn-style card with:
//  - Tool name + status (running / complete / error)
//  - Collapsible args inspector
//  - Error details with copy-to-clipboard for bug reporting
// ---------------------------------------------------------------------------

interface ToolFallbackProps {
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  status?: { type: "running" | "complete" | "incomplete" | "requires-action" };
}

export function ToolFallback({ toolName, args, result, status }: ToolFallbackProps) {
  const [argsExpanded, setArgsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const isRunning = status?.type === "running";
  const isDone = result !== undefined;
  const isError =
    isDone &&
    result !== null &&
    typeof result === "object" &&
    ("error" in (result as Record<string, unknown>) ||
      "message" in (result as Record<string, unknown>));

  const errorMessage = isError
    ? ((result as Record<string, unknown>).error ??
      (result as Record<string, unknown>).message ??
      "Unknown error")
    : null;

  // Build the full error context string for copy-to-clipboard
  const buildErrorReport = () => {
    const parts = [
      `## Tool Call Error Report`,
      `**Tool:** \`${toolName}\``,
      `**Status:** ${status?.type ?? "unknown"}`,
      `**Timestamp:** ${new Date().toISOString()}`,
      ``,
      `### Error`,
      `\`\`\``,
      `${String(errorMessage)}`,
      `\`\`\``,
      ``,
      `### Arguments`,
      `\`\`\`json`,
      `${JSON.stringify(args, null, 2)}`,
      `\`\`\``,
    ];

    if (result && !isError) {
      parts.push(``, `### Result`, `\`\`\`json`, `${JSON.stringify(result, null, 2)}`, `\`\`\``);
    }

    return parts.join("\n");
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildErrorReport());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback for clipboard API failures
      const textarea = document.createElement("textarea");
      textarea.value = buildErrorReport();
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // ── Error state ──────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="flex flex-col gap-2 p-3 my-1 rounded-lg bg-destructive/5 border border-destructive/20">
        <div className="flex items-start gap-2">
          <AlertTriangleIcon className="size-4 mt-0.5 text-destructive shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                <WrenchIcon className="size-3" />
                <span>{toolName}</span>
                <span className="text-destructive/60">— failed</span>
              </div>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors shrink-0"
                title="Copy error report to clipboard for debugging"
              >
                {copied ? (
                  <>
                    <CheckIcon className="size-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <CopyIcon className="size-3" />
                    Copy for agent
                  </>
                )}
              </button>
            </div>

            <div className="mt-2 p-2 rounded bg-destructive/5 border border-destructive/10">
              <p className="text-xs text-destructive/90 font-mono leading-relaxed break-all">
                {String(errorMessage)}
              </p>
            </div>

            {/* Collapsible args */}
            <button
              onClick={() => setArgsExpanded(!argsExpanded)}
              className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {argsExpanded ? (
                <ChevronDownIcon className="size-3" />
              ) : (
                <ChevronRightIcon className="size-3" />
              )}
              Arguments
            </button>
            {argsExpanded && Object.keys(args).length > 0 && (
              <pre className="mt-1 text-[10px] text-muted-foreground overflow-x-auto max-w-full p-2 rounded bg-muted/20 border border-border/30">
                {JSON.stringify(args, null, 2)}
              </pre>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Normal state (running / complete) ────────────────────────────────
  return (
    <div className="flex items-start gap-2 p-3 my-1 rounded-lg bg-muted/30 border border-border/50">
      <div className="mt-0.5">
        {isRunning ? (
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
        ) : isDone ? (
          <CheckCircle2Icon className="size-4 text-emerald-400" />
        ) : (
          <WrenchIcon className="size-4 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          <WrenchIcon className="size-3" />
          <span>{toolName}</span>
          {isRunning && <span className="text-muted-foreground animate-pulse">running…</span>}
        </div>

        {Object.keys(args).length > 0 && (
          <>
            <button
              onClick={() => setArgsExpanded(!argsExpanded)}
              className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {argsExpanded ? (
                <ChevronDownIcon className="size-3" />
              ) : (
                <ChevronRightIcon className="size-3" />
              )}
              Arguments
            </button>
            {argsExpanded && (
              <pre className="mt-1 text-[10px] text-muted-foreground overflow-x-auto max-w-full p-2 rounded bg-muted/20 border border-border/30">
                {JSON.stringify(args, null, 2)}
              </pre>
            )}
          </>
        )}

        {isDone && !isError && (
          <div className="mt-1.5 text-xs text-muted-foreground">✓ Complete</div>
        )}
      </div>
    </div>
  );
}
