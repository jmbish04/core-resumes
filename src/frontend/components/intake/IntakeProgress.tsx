import { ChevronDown, Check, Loader2, AlertCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type IntakeStage =
  | "idle"
  | "scraping"
  | "extracting"
  | "mapping"
  | "error"
  | "complete";

type LogEntry = { timestamp: number; message: string };

export type IntakeLogData = {
  scraping: LogEntry[];
  extracting: LogEntry[];
  mapping: LogEntry[];
  scrapedMarkdown?: string;
};

const stages = [
  { id: "scraping" as const, label: "Scraping", description: "Browser Rendering page capture" },
  { id: "extracting" as const, label: "Extracting", description: "AI structured data extraction" },
  { id: "mapping" as const, label: "Mapping", description: "Field mapping & validation" },
] as const;

export function IntakeProgress({
  stage,
  logs,
}: {
  stage: IntakeStage;
  logs: IntakeLogData;
}) {
  const activeIndex = stages.findIndex((item) => item.id === stage);
  const complete = stage === "complete";
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [markdownExpanded, setMarkdownExpanded] = useState(false);

  // Auto-expand the active stage, collapse others
  useEffect(() => {
    if (stage === "scraping" || stage === "extracting" || stage === "mapping") {
      setExpandedId(stage);
    }
  }, [stage]);

  if (stage === "idle") return null;

  return (
    <div className="grid gap-1.5">
      {stages.map((item, index) => {
        const done = complete || (activeIndex > -1 && index < activeIndex);
        const active = item.id === stage;
        const isExpanded = expandedId === item.id;
        const logEntries = logs[item.id] ?? [];

        return (
          <div
            key={item.id}
            className={cn(
              "rounded-lg border border-border/60 transition-all duration-200",
              active && "border-primary/40 bg-muted/40",
              done && "border-green-500/20 bg-green-500/5",
            )}
          >
            {/* Header */}
            <button
              type="button"
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm"
              onClick={() =>
                setExpandedId(isExpanded ? null : item.id)
              }
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors",
                  done && "bg-green-500/20 text-green-400",
                  active && "bg-primary/20 text-primary",
                  !done && !active && "bg-muted text-muted-foreground",
                )}
              >
                {done ? (
                  <Check className="size-3.5" />
                ) : active ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : stage === "error" && item.id === stages[activeIndex]?.id ? (
                  <AlertCircle className="size-3.5 text-destructive" />
                ) : (
                  <span className="size-1.5 rounded-full bg-current" />
                )}
              </span>

              <div className="flex-1">
                <span className="font-medium">{item.label}</span>
                {logEntries.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({logEntries.length} events)
                  </span>
                )}
              </div>

              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform duration-200",
                  isExpanded && "rotate-180",
                )}
              />
            </button>

            {/* Expandable Content */}
            {isExpanded && (
              <div className="border-t border-border/40 px-3 pb-3 pt-2">
                {logEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    {active ? "Waiting for events…" : "No events recorded"}
                  </p>
                ) : (
                  <LogStream entries={logEntries} />
                )}

                {/* Scraped Markdown Section (only in scraping stage) */}
                {item.id === "scraping" && logs.scrapedMarkdown && (
                  <div className="mt-2">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md border border-border/40 px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted/40"
                      onClick={() => setMarkdownExpanded(!markdownExpanded)}
                    >
                      <ChevronDown
                        className={cn(
                          "size-3 transition-transform duration-200",
                          markdownExpanded && "rotate-180",
                        )}
                      />
                      <span>
                        Captured Markdown ({logs.scrapedMarkdown.length.toLocaleString()} chars)
                      </span>
                    </button>
                    {markdownExpanded && (
                      <pre className="mt-1.5 max-h-[200px] overflow-auto rounded-md bg-muted/60 p-2 text-[11px] leading-relaxed text-muted-foreground">
                        {logs.scrapedMarkdown}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LogStream — auto-scrolling log viewer
// ---------------------------------------------------------------------------

function LogStream({ entries }: { entries: LogEntry[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries.length]);

  return (
    <div
      ref={containerRef}
      className="max-h-[120px] overflow-auto rounded-md bg-black/20 px-2 py-1.5 font-mono text-[11px] leading-relaxed"
    >
      {entries.map((entry, i) => (
        <div key={i} className="flex gap-2">
          <span className="shrink-0 text-muted-foreground/60">
            {new Date(entry.timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
          <span className="text-muted-foreground">{entry.message}</span>
        </div>
      ))}
    </div>
  );
}
