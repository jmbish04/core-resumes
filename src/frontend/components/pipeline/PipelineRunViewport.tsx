import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Database,
  Loader2,
  Timer,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet } from "@/lib/api-client";
import { PipelineStepper, type WorkflowStep } from "./PipelineStepper";
import type { SyncRunSummary } from "./PipelineRunList";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncRunEvent {
  id: number;
  syncStatsId: number | null;
  eventType: string;
  stepNumber: number | null;
  status: string;
  message: string | null;
  current: number | null;
  total: number | null;
  metadata: string | null;
  createdAt: string;
}

interface PipelineRunViewportProps {
  /** If set, showing a historical run */
  selectedRun: SyncRunSummary | null;
  /** If true, this is a live sync actively in progress — elapsed timer runs */
  isLive: boolean;
  /**
   * If true, render live steps/events instead of fetching historical data.
   * This stays true even after the sync completes, so the viewport doesn't
   * flash blank when the user remains on the page.
   */
  showLiveData: boolean;
  /** Live stepper steps — driven by WebSocket messages */
  liveSteps: WorkflowStep[];
  /** Live events accumulated during a live sync */
  liveEvents: SyncRunEvent[];
  /** Navigate back to the run list */
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return "—";
  try {
    const date = new Date(ts);
    if (isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return "—";
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Reconstruct WorkflowStep[] from D1 events.
 */
function eventsToSteps(events: SyncRunEvent[], runStatus: string): WorkflowStep[] {
  const stepDefs = [
    { step: 1, title: "Dispatch Sync Workflow" },
    { step: 2, title: "Load Upstream Repositories" },
    { step: 3, title: "Scrape and Extract Metadata" },
    { step: 4, title: "Update Local Databases" },
    { step: 5, title: "Finalize & Broadcast Stats" },
  ];

  const steps: WorkflowStep[] = stepDefs.map((def) => ({
    ...def,
    status: "idle" as const,
    logs: [],
  }));

  // Track the highest completed step
  let highestActiveStep = 0;

  for (const event of events) {
    const stepIdx = event.stepNumber ? event.stepNumber - 1 : null;

    if (stepIdx !== null && stepIdx >= 0 && stepIdx < steps.length) {
      if (event.stepNumber! > highestActiveStep) {
        highestActiveStep = event.stepNumber!;
      }
      if (event.message && !steps[stepIdx].logs.includes(event.message)) {
        steps[stepIdx].logs.push(event.message);
      }
    }
  }

  // Mark step statuses based on the run outcome and highest reached step
  const isFailed = runStatus === "failed" || runStatus === "error";
  const isComplete = runStatus === "success" || runStatus === "completed";

  for (let i = 0; i < steps.length; i++) {
    if (isComplete) {
      steps[i].status = "completed";
      if (steps[i].logs.length === 0) {
        steps[i].logs.push("Phase finished successfully.");
      }
    } else if (isFailed) {
      if (i + 1 < highestActiveStep) {
        steps[i].status = "completed";
        if (steps[i].logs.length === 0) {
          steps[i].logs.push("Phase finished successfully.");
        }
      } else if (i + 1 === highestActiveStep) {
        steps[i].status = "failed";
      }
      // Steps after the failure stay idle
    }
  }

  return steps;
}

/**
 * Build bar chart data from events showing companies added/deactivated/reactivated
 * or simply the run's summary stats.
 */
function buildRunBreakdownChart(run: SyncRunSummary) {
  return [
    { label: "Added", value: run.companiesAdded, fill: "var(--chart-2)" },
    { label: "Deactivated", value: run.companiesDeactivated, fill: "var(--chart-4)" },
    { label: "Reactivated", value: run.companiesReactivated, fill: "var(--chart-1)" },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PipelineRunViewport({
  selectedRun,
  isLive,
  showLiveData,
  liveSteps,
  liveEvents,
  onBack,
}: PipelineRunViewportProps) {
  const [historicalEvents, setHistoricalEvents] = useState<SyncRunEvent[]>([]);
  const [historicalSteps, setHistoricalSteps] = useState<WorkflowStep[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Elapsed time counter — only ticks while the sync is actively running
  const [elapsedMs, setElapsedMs] = useState(0);
  const [startTime] = useState(() => Date.now());

  // Freeze the duration when sync completes so the timer stops
  const [frozenDuration, setFrozenDuration] = useState<number | null>(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (!isLive) {
      // Sync just finished — freeze the duration at its current value
      if (elapsedRef.current > 0) {
        setFrozenDuration(elapsedRef.current);
      }
      return;
    }
    // Reset frozen duration on a new live sync
    setFrozenDuration(null);
    elapsedRef.current = 0;
    setElapsedMs(0);
    const interval = setInterval(() => {
      const ms = Date.now() - startTime;
      elapsedRef.current = ms;
      setElapsedMs(ms);
    }, 1000);
    return () => clearInterval(interval);
  }, [isLive, startTime]);

  // Fetch historical events when viewing a past run
  useEffect(() => {
    if (!selectedRun || showLiveData) return;

    const fetchEvents = async () => {
      setLoadingEvents(true);
      try {
        const res = await apiGet<{ events: SyncRunEvent[] }>(
          `/api/pipeline/api-companies/sync-stats/${selectedRun.id}/events`
        );
        if (res?.events) {
          setHistoricalEvents(res.events);
          setHistoricalSteps(eventsToSteps(res.events, selectedRun.status));
        }
      } catch (e) {
        console.error("Failed to fetch run events:", e);
        setHistoricalSteps(eventsToSteps([], selectedRun.status));
      } finally {
        setLoadingEvents(false);
      }
    };

    fetchEvents();
  }, [selectedRun, showLiveData]);

  // Derive which data to render — live data takes priority over historical
  const steps = showLiveData ? liveSteps : historicalSteps;
  const events = showLiveData ? liveEvents : historicalEvents;
  const chartData = selectedRun ? buildRunBreakdownChart(selectedRun) : [];

  // Detect completed/failed live sync from the frozen stepper
  const liveCompleted = showLiveData && !isLive && liveSteps.length > 0
    && liveSteps.every((s) => s.status === "completed");
  const liveFailed = showLiveData && !isLive && liveSteps.length > 0
    && liveSteps.some((s) => s.status === "failed");

  const displayDuration = isLive
    ? formatDuration(elapsedMs)
    : showLiveData
      ? formatDuration(frozenDuration ?? elapsedMs)
      : formatDuration(selectedRun?.durationMs ?? null);

  return (
    <div className="space-y-6 animate-in fade-in-30">
      {/* Viewport header */}
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">
              {isLive ? "Live Sync Viewport" : showLiveData ? "Sync Run Details" : "Sync Run Details"}
            </h1>
            {isLive ? (
              <Badge variant="outline" className="border-blue-500/30 text-blue-400 bg-blue-500/10 text-[10px] animate-pulse">
                <span className="size-1.5 rounded-full bg-blue-400 mr-1" />
                Live
              </Badge>
            ) : liveCompleted ? (
              <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-[10px]">
                <CheckCircle2 className="size-3 mr-1" />
                Completed
              </Badge>
            ) : liveFailed ? (
              <Badge variant="destructive" className="text-[10px]">
                <AlertCircle className="size-3 mr-1" />
                Failed
              </Badge>
            ) : selectedRun ? (
              <Badge variant="secondary" className="text-xs">
                Run #{selectedRun.id}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isLive
              ? "Streaming live progress from the GitHub Action runner via WebSocket."
              : liveCompleted
                ? "Sync run completed. Review the results below."
                : liveFailed
                  ? "Sync run failed. Review the error logs below."
                  : selectedRun
                    ? `Viewing sync run from ${formatTimestamp(selectedRun.runTimestamp)}`
                    : "Run details"}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="size-3.5" />
          Back to Runs
        </Button>
      </div>

      {/* Status cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border/60 bg-card/50">
          <CardHeader className="py-2.5">
            <CardTitle className="text-xs text-muted-foreground uppercase">Status</CardTitle>
          </CardHeader>
          <CardContent className="py-0 pb-3 flex items-center gap-2">
            {isLive ? (
              <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30">
                <Loader2 className="mr-1 size-3 animate-spin" /> In Progress
              </Badge>
            ) : liveCompleted ? (
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                <CheckCircle2 className="mr-1 size-3" /> Completed
              </Badge>
            ) : liveFailed ? (
              <Badge variant="destructive">
                <AlertCircle className="mr-1 size-3" /> Failed
              </Badge>
            ) : selectedRun?.status === "success" ? (
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                <CheckCircle2 className="mr-1 size-3" /> Success
              </Badge>
            ) : (
              <Badge variant="destructive">
                <AlertCircle className="mr-1 size-3" /> Failed
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader className="py-2.5">
            <CardTitle className="text-xs text-muted-foreground uppercase">Duration</CardTitle>
          </CardHeader>
          <CardContent className="py-0 pb-3 flex items-center gap-2">
            <Timer className="size-4 text-muted-foreground" />
            <span className="text-lg font-bold font-mono">
              {displayDuration}
            </span>
          </CardContent>
        </Card>

        {selectedRun && (
          <>
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="py-2.5">
                <CardTitle className="text-xs text-muted-foreground uppercase">Companies Added</CardTitle>
              </CardHeader>
              <CardContent className="py-0 pb-3">
                <span className="text-lg font-bold font-mono">{selectedRun.companiesAdded.toLocaleString()}</span>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="py-2.5">
                <CardTitle className="text-xs text-muted-foreground uppercase">Events</CardTitle>
              </CardHeader>
              <CardContent className="py-0 pb-3 flex items-center gap-2">
                <Database className="size-4 text-muted-foreground" />
                <span className="text-lg font-bold font-mono">
                  {isLive ? liveEvents.length.toLocaleString() : selectedRun.eventsCount.toLocaleString()}
                </span>
              </CardContent>
            </Card>
          </>
        )}

        {showLiveData && !selectedRun && (
          <>
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="py-2.5">
                <CardTitle className="text-xs text-muted-foreground uppercase">Events Received</CardTitle>
              </CardHeader>
              <CardContent className="py-0 pb-3 flex items-center gap-2">
                <Database className="size-4 text-muted-foreground" />
                <span className="text-lg font-bold font-mono">{liveEvents.length.toLocaleString()}</span>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="py-2.5">
                <CardTitle className="text-xs text-muted-foreground uppercase">Time</CardTitle>
              </CardHeader>
              <CardContent className="py-0 pb-3 flex items-center gap-2">
                <Clock className="size-4 text-muted-foreground" />
                <span className="text-sm font-mono">{formatTimestamp(new Date().toISOString())}</span>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Stepper */}
      {loadingEvents ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : steps.length > 0 ? (
        <Card className="border-border/60 bg-card/50">
          <CardContent className="pt-6">
            <PipelineStepper steps={steps} onCopyReport={() => {}} />
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/60 bg-card/50">
          <CardContent className="pt-6 text-center text-muted-foreground text-xs py-12">
            <p>No events recorded for this run.</p>
            <p className="text-muted-foreground/60 mt-1">
              This run may predate the event tracking system.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Run breakdown chart — only for completed historical runs with real data */}
      {selectedRun && !isLive && chartData.some((d) => d.value > 0) && (
        <Card className="border-border/60 bg-card/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">Run Breakdown</CardTitle>
            <CardDescription className="text-xs">
              Companies added, deactivated, and reactivated during this sync run.
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} horizontal={false} />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={10} tickFormatter={(v: number) => v.toLocaleString()} />
                <YAxis dataKey="label" type="category" stroke="var(--muted-foreground)" fontSize={11} width={75} />
                <Tooltip
                  contentStyle={{ backgroundColor: "rgba(10, 10, 10, 0.9)", border: "1px solid var(--border)" }}
                  labelStyle={{ color: "var(--foreground)", fontWeight: "bold" }}
                />
                <Bar dataKey="value" name="Count" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Event timeline — raw event log for debugging */}
      {events.length > 0 && (
        <Card className="border-border/60 bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm font-bold">Event Timeline</CardTitle>
            <CardDescription className="text-xs">
              Raw progress events received from the GitHub Action runner ({events.length.toLocaleString()} events).
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="rounded-md border border-border/50 overflow-hidden max-h-[300px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-[60px]">Step</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Message</TableHead>
                    <TableHead className="text-xs text-right">Progress</TableHead>
                    <TableHead className="text-xs text-right">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id} className="text-xs">
                      <TableCell className="font-mono text-muted-foreground">{event.stepNumber ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[9px] py-0 h-5">
                          {event.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground truncate max-w-xs">
                        {event.message ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {event.current !== null && event.total !== null
                          ? `${event.current.toLocaleString()}/${event.total.toLocaleString()}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {formatTimestamp(event.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
