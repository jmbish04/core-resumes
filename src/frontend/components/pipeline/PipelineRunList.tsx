import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Github,
  Hash,
  Loader2,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncRunSummary {
  id: number;
  runTimestamp: string;
  filesProcessed: number;
  companiesAdded: number;
  companiesDeactivated: number;
  companiesReactivated: number;
  status: string;
  error: string | null;
  durationMs: number | null;
  eventsCount: number;
}

interface PipelineRunListProps {
  runs: SyncRunSummary[];
  loading: boolean;
  syncing: boolean;
  wsReadyState: number;
  onSelectRun: (run: SyncRunSummary) => void;
  onTriggerSync: () => void;
  onRefresh: () => void;
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

function relativeTime(ts: string): string {
  const date = new Date(ts);
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PipelineRunList({
  runs,
  loading,
  syncing,
  wsReadyState,
  onSelectRun,
  onTriggerSync,
  onRefresh,
}: PipelineRunListProps) {
  const getWsStatusBadge = () => {
    switch (wsReadyState) {
      case 0:
        return (
          <Badge variant="outline" className="border-amber-500/30 text-amber-500 bg-amber-500/10 flex items-center gap-1 h-6">
            <Loader2 className="size-3 animate-spin" />
            <span>Connecting...</span>
          </Badge>
        );
      case 1:
        return (
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 bg-emerald-500/10 flex items-center gap-1 h-6">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <Wifi className="size-3" />
            <span>Connected</span>
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/10 flex items-center gap-1 h-6">
            <WifiOff className="size-3" />
            <span>Offline</span>
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Compute summary stats from runs
  const totalRuns = runs.length;
  const successRuns = runs.filter((r) => r.status === "success").length;
  const failedRuns = runs.filter((r) => r.status === "failed").length;
  const lastRun = runs[0];

  return (
    <div className="space-y-6 animate-in fade-in-30">
      {/* Header with actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-card/30 border border-border/40 p-4 rounded-lg">
        <div>
          <div className="flex items-center gap-2">
            <Github className="size-5 text-zinc-400" />
            <h2 className="text-lg font-bold">Pipeline Sync Operations</h2>
            {getWsStatusBadge()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Trigger, monitor, and review GitHub Action sync runs that aggregate job board data into D1.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={onTriggerSync} disabled={syncing} className="gap-1.5">
            {syncing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Github className="size-4" />
            )}
            {syncing ? "Syncing..." : "New Sync"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onRefresh} className="size-9 p-0">
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {/* Quick stats cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border/60 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Total Runs</CardTitle>
            <Hash className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{totalRuns.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Successful</CardTitle>
            <CheckCircle2 className="size-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400 font-mono">{successRuns.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Failed</CardTitle>
            <AlertCircle className="size-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive font-mono">{failedRuns.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Last Run</CardTitle>
            <Clock className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-bold font-mono">
              {lastRun ? relativeTime(lastRun.runTimestamp) : "—"}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {lastRun ? formatTimestamp(lastRun.runTimestamp) : "No runs yet"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Syncing in progress banner */}
      {syncing && (
        <div className="flex items-center gap-3 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded-lg p-3 animate-in fade-in-30">
          <Loader2 className="size-4 animate-spin shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold">Sync in progress</p>
            <p className="text-xs text-blue-400/70">
              Streaming live progress from the GitHub Action runner...
            </p>
          </div>
        </div>
      )}

      {/* Run history table */}
      <Card className="border-border/60 bg-card/50">
        <CardHeader>
          <CardTitle className="text-sm font-bold">Sync Run History</CardTitle>
          <CardDescription className="text-xs">
            Click any row to open the detailed viewport with stepper logs and charts.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-md border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-[40px]">#</TableHead>
                  <TableHead className="text-xs">Timestamp</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Duration</TableHead>
                  <TableHead className="text-xs text-right">Added</TableHead>
                  <TableHead className="text-xs text-right">Deactivated</TableHead>
                  <TableHead className="text-xs text-right">Reactivated</TableHead>
                  <TableHead className="text-xs text-right">Events</TableHead>
                  <TableHead className="text-xs text-right w-[40px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground text-xs py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Github className="size-8 text-muted-foreground/40" />
                        <p>No sync runs found.</p>
                        <p className="text-muted-foreground/60">Trigger your first sync to get started.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  runs.map((run) => (
                    <TableRow
                      key={run.id}
                      className="hover:bg-muted/40 transition-colors cursor-pointer group"
                      onClick={() => onSelectRun(run)}
                    >
                      <TableCell className="text-xs font-mono text-muted-foreground">{run.id}</TableCell>
                      <TableCell className="text-xs font-mono">{formatTimestamp(run.runTimestamp)}</TableCell>
                      <TableCell>
                        {run.status === "success" ? (
                          <Badge variant="outline" className="border-green-500/30 text-green-500 bg-green-500/10 text-[10px]">
                            <CheckCircle2 className="size-3 mr-1" />
                            Success
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            <AlertCircle className="size-3 mr-1" />
                            Failed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono text-muted-foreground">
                        {formatDuration(run.durationMs)}
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono">{run.companiesAdded.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{run.companiesDeactivated.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{run.companiesReactivated.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-xs font-mono text-muted-foreground">{run.eventsCount.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <ChevronRight className="size-4 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
