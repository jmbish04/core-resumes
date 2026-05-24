import {
  AlertCircle,
  CheckCircle2,
  ClipboardCopy,
  Loader2,
  Play,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// TypeScript Types
// ---------------------------------------------------------------------------

export interface WorkflowStep {
  step: number;
  title: string;
  status: "idle" | "active" | "completed" | "failed";
  logs: string[];
}

interface PipelineStepperProps {
  steps: WorkflowStep[];
  onCopyReport?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PipelineStepper({ steps, onCopyReport }: PipelineStepperProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Automatically scroll active logs to the bottom
  React.useEffect(() => {
    const activeLogContainer = containerRef.current?.querySelector(".active-log-scroll");
    if (activeLogContainer) {
      activeLogContainer.scrollTop = activeLogContainer.scrollHeight;
    }
  }, [steps]);

  const handleCopy = () => {
    if (onCopyReport) {
      onCopyReport();
      return;
    }

    // Default copy implementation matching Untitled UI specifications
    const reportJson = JSON.stringify(steps, null, 2);
    const reportText = `I am experiencing an execution failure in my agentic pipeline. Here is the structural state and log dump from the UI stepper component:

\`\`\`json
${reportJson}
\`\`\`

Please review the logs above, isolate the failure in the system execution layer, and provide a self-healing patch strategy.`;

    navigator.clipboard.writeText(reportText)
      .then(() => {
        alert("Workflow Report Copied! Copied markdown payload to clipboard.");
      })
      .catch(() => {
        console.error("Clipboard capture failed");
      });
  };

  return (
    <div 
      ref={containerRef}
      className="w-full bg-zinc-950/60 border border-zinc-800/80 rounded-xl p-6 shadow-2xl relative overflow-hidden animate-in fade-in-50 duration-200"
    >
      {/* Header Panel */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4 mb-6">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100 uppercase tracking-wider">Sync Pipeline Live Monitor</h3>
          <p className="text-xs text-zinc-400 mt-0.5">Observe repository scanning and local database commits in real-time.</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-zinc-850 h-8 gap-1.5 text-xs"
        >
          <ClipboardCopy className="size-3.5" />
          <span>Copy Workflow Report</span>
        </Button>
      </div>

      {/* Stepper Vertical Tree */}
      <div className="relative pl-1">
        {steps.map((item, index) => {
          const isLast = index === steps.length - 1;
          const isActive = item.status === "active";
          const isCompleted = item.status === "completed";
          const isFailed = item.status === "failed";
          const isIdle = item.status === "idle";

          // Render proper state indicator node on the left
          const renderIndicator = () => {
            if (isCompleted) {
              return (
                <div className="size-8 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)] animate-in zoom-in-75 duration-300">
                  <CheckCircle2 className="size-4.5" />
                </div>
              );
            }
            if (isFailed) {
              return (
                <div className="size-8 rounded-full bg-destructive/15 border border-destructive/40 flex items-center justify-center text-destructive shadow-[0_0_12px_rgba(239,68,68,0.15)] animate-in zoom-in-75 duration-300">
                  <AlertCircle className="size-4.5" />
                </div>
              );
            }
            if (isActive) {
              return (
                <div className="size-8 rounded-full bg-amber-500/15 border border-amber-500/50 flex items-center justify-center text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)] animate-pulse">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              );
            }
            // Idle state shows index number
            return (
              <div className="size-8 rounded-full bg-zinc-900/80 border border-zinc-800/80 flex items-center justify-center text-zinc-500 text-xs font-semibold">
                {item.step}
              </div>
            );
          };

          return (
            <div key={item.step} className="flex gap-4 relative">
              {/* Left Column: indicator + connection vertical bar */}
              <div className="flex flex-col items-center shrink-0">
                {renderIndicator()}
                {!isLast && (
                  <div 
                    className={cn(
                      "w-px border-l border-zinc-800 flex-1 my-2 min-h-6 transition-all duration-300",
                      isCompleted && "border-emerald-500/30",
                      isActive && "border-amber-500/30"
                    )}
                  />
                )}
              </div>

              {/* Right Column: details and terminal logs stream */}
              <div className="flex-1 pb-6 pt-1">
                <div className="flex items-center gap-2">
                  <span 
                    className={cn(
                      "text-sm font-semibold tracking-tight transition-colors duration-200",
                      isActive ? "text-amber-400" : isCompleted ? "text-zinc-200" : isFailed ? "text-red-500 font-bold" : "text-zinc-500"
                    )}
                  >
                    {item.title}
                  </span>
                  {isActive && (
                    <Badge variant="outline" className="border-amber-500/20 bg-amber-500/5 text-amber-500 py-0 px-1 text-[9px] uppercase tracking-widest font-mono">
                      Running
                    </Badge>
                  )}
                  {isCompleted && (
                    <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/5 text-emerald-500 py-0 px-1 text-[9px] uppercase tracking-widest font-mono">
                      Success
                    </Badge>
                  )}
                  {isFailed && (
                    <Badge variant="outline" className="border-destructive/20 bg-destructive/5 text-destructive py-0 px-1 text-[9px] uppercase tracking-widest font-mono">
                      Failed
                    </Badge>
                  )}
                </div>

                {/* Subtitle / Terminal logs stream */}
                {(isActive || isCompleted || isFailed) && item.logs.length > 0 && (
                  <div 
                    className={cn(
                      "mt-2.5 rounded-lg border bg-zinc-950 p-3 max-h-40 overflow-y-auto active-log-scroll scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent transition-all duration-300",
                      isActive ? "border-amber-500/10 shadow-[inset_0_0_12px_rgba(245,158,11,0.02)]" : isFailed ? "border-red-950" : "border-zinc-900"
                    )}
                  >
                    <div className="font-mono text-[11px] leading-relaxed text-zinc-400 space-y-1">
                      {item.logs.map((logLine, lineIdx) => {
                        const isErrorLine = 
                          logLine.includes("ERROR") || 
                          logLine.includes("failed") || 
                          logLine.includes("Failed") || 
                          logLine.includes("critical") || 
                          logLine.includes("CRITICAL");

                        return (
                          <div 
                            key={lineIdx} 
                            className={cn(
                              "flex items-start gap-2 animate-in fade-in-50 duration-200",
                              isErrorLine ? "text-red-500 font-medium" : "text-zinc-400"
                            )}
                          >
                            <span className="text-zinc-600 select-none shrink-0 font-sans">&gt;</span>
                            <span className="break-all">{logLine}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Idle label helper */}
                {isIdle && (
                  <p className="text-xs text-zinc-600 mt-1">Pending subsequent phases...</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
