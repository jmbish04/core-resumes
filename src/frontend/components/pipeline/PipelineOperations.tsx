import { useAgent } from "agents/react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Github,
  Loader2,
  RefreshCw,
  Terminal,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { apiGet, apiPost, toast } from "@/lib/api-client";
import { PipelineStepper, type WorkflowStep } from "./PipelineStepper";

export function PipelineOperations() {
  const [stats, setStats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const timeoutSecs = 90000;

  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const startSyncTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setSteps((prevSteps) => {
        if (prevSteps.length === 0 || prevSteps[0].status !== "active") {
          return prevSteps;
        }

        const nextSteps = [...prevSteps].map((s) => ({ ...s, logs: [...s.logs] }));
        
        nextSteps[0].status = "failed";
        nextSteps[0].logs.push(
          `CRITICAL ERROR: Remote Action connection timeout after ${timeoutSecs / 1000} seconds.`
        );
        nextSteps[0].logs.push(
          "Please verify that your GitHub Repository has secrets.WORKER_API_KEY set correctly, matches the Worker's active secret, and that the runner is not queued or blocked."
        );

        setSyncing(false);
        setSyncError("Remote Action connection timeout. Verify GitHub workflow runner is online and authenticated.");
        toast({ title: "Sync Connection Timeout", variant: "destructive" });
        return nextSteps;
      });
    }, timeoutSecs);
  };

  // Safely formats timestamps without throwing RangeErrors
  const formatTimestamp = (ts: string | number | Date | null | undefined) => {
    if (!ts) return "Unknown Date";
    try {
      const date = new Date(ts);
      if (isNaN(date.getTime())) {
        return "Unknown Date";
      }
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
      return "Unknown Date";
    }
  };

  // Canonical fallback workflow steps matching the backend steps structure
  const fallbackSteps: WorkflowStep[] = [
    { step: 1, title: "Dispatch Sync Workflow", status: "idle", logs: [] },
    { step: 2, title: "Load Upstream Repositories", status: "idle", logs: [] },
    { step: 3, title: "Scrape and Extract Metadata", status: "idle", logs: [] },
    { step: 4, title: "Update Local Databases", status: "idle", logs: [] },
    { step: 5, title: "Finalize & Broadcast Stats", status: "idle", logs: [] },
  ];

  // Initialize the vertical Progress Stepper steps dynamically from the backend (single source of truth)
  const [steps, setSteps] = useState<WorkflowStep[]>([]);

  // Connect to the dedicated SyncBroadcastAgent WebSocket.
  // routeAgentRequest in _worker.ts handles the upgrade at
  // /agents/SyncBroadcastAgent/global automatically.
  const agent = useAgent({
    agent: "SyncBroadcastAgent",
    name: "global",
    onMessage: (message: any) => {
      if (message?.type === "sync_progress") {
        const payload = message.payload;
        const status = payload.status;
        const msgText = payload.message || status;

        // Clear the self-healing timeout on any progress message from the active runner (non-dispatching statuses)
        if (status && status !== "dispatching" && status !== "trigger-sync") {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        }

        setSteps((prevSteps) => {
          const nextSteps = [...prevSteps].map((s) => ({ ...s, logs: [...s.logs] }));

          // Helper to mark steps as completed up to a specific step
          const completeUpTo = (stepNum: number) => {
            for (let i = 0; i < stepNum - 1; i++) {
              if (nextSteps[i].status !== "completed") {
                nextSteps[i].status = "completed";
                if (nextSteps[i].logs.length === 0) {
                  nextSteps[i].logs.push("Phase finished successfully.");
                }
              }
            }
          };

          if (status === "dispatching" || status === "trigger-sync") {
            nextSteps[0].status = "active";
            if (msgText) nextSteps[0].logs.push(msgText);
          } else if (
            status === "initializing" ||
            status === "fetching_upstream" ||
            status === "loading_sources"
          ) {
            completeUpTo(2);
            nextSteps[1].status = "active";
            if (msgText) nextSteps[1].logs.push(msgText);
          } else if (
            status === "scraping" ||
            status === "parsing" ||
            status === "processing" ||
            status === "mapping"
          ) {
            completeUpTo(3);
            nextSteps[2].status = "active";
            if (msgText) nextSteps[2].logs.push(msgText);
          } else if (
            status === "saving_db" ||
            status === "ingesting" ||
            status === "writing_d1" ||
            status === "updating_database"
          ) {
            completeUpTo(4);
            nextSteps[3].status = "active";
            if (msgText) nextSteps[3].logs.push(msgText);
          } else if (status === "completed" || status === "success") {
            // Complete all steps
            for (let i = 0; i < 4; i++) {
              nextSteps[i].status = "completed";
              if (nextSteps[i].logs.length === 0) {
                nextSteps[i].logs.push("Phase finished successfully.");
              }
            }
            nextSteps[4].status = "completed";
            nextSteps[4].logs.push("Upstream repository synchronization completed successfully.");
            nextSteps[4].logs.push(`Added, deactivated, and reactivated companies matching D1.`);
            setSyncing(false);
            setSyncError(null);
            toast({ title: "GitHub Sync Completed", variant: "default" });
            fetchStats(); // Refresh table
          } else if (status === "failed" || status === "error") {
            // Mark currently active step as failed, or default to Step 3
            let activeIdx = nextSteps.findIndex((s) => s.status === "active");
            if (activeIdx === -1) activeIdx = 2; // fallback to Step 3

            nextSteps[activeIdx].status = "failed";
            const errMsg = msgText || "An unexpected execution failure occurred.";
            nextSteps[activeIdx].logs.push(`CRITICAL ERROR: ${errMsg}`);
            
            // Set all subsequent steps to idle
            for (let i = activeIdx + 1; i < nextSteps.length; i++) {
              nextSteps[i].status = "idle";
            }

            setSyncing(false);
            setSyncError(errMsg);
            toast({ title: "GitHub Sync Failed", variant: "destructive" });
            fetchStats(); // Refresh table
          }

          return nextSteps;
        });
      }
    },
  });

  const fetchStats = async () => {
    try {
      const res: any = await apiGet("/api/pipeline/api-companies/sync-stats");
      if (res.stats) {
        setStats(res.stats);
      }
    } catch (e: any) {
      setSyncError("Failed to fetch historical run metrics. The D1 database may be busy.");
      toast({ title: "Failed to load pipeline stats", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const fetchSteps = async () => {
    try {
      const res: any = await apiGet("/api/pipeline/api-companies/steps");
      if (res.steps) {
        setSteps(res.steps);
      } else {
        setSteps(fallbackSteps);
        setSyncError("Failed to load custom workflow configuration from the server. Using local layout fallback.");
      }
    } catch (e: any) {
      setSteps(fallbackSteps);
      setSyncError(`Failed to load sync steps from server: ${e.message || "Server unresponsive"}. Using local layout fallback.`);
    }
  };

  useEffect(() => {
    fetchSteps();
    fetchStats();
  }, []);

  const triggerSync = async () => {
    try {
      setSyncing(true);
      setSyncError(null);

      // Fetch fresh steps from backend (Single Source of Truth)
      let initialSteps = steps.length > 0 ? steps : fallbackSteps;
      try {
        const res: any = await apiGet("/api/pipeline/api-companies/steps");
        if (res.steps) {
          initialSteps = res.steps;
        } else {
          throw new Error("Invalid steps payload returned by the server.");
        }
      } catch (e: any) {
        const fetchError = `Failed to retrieve sync workflow configuration: ${e.message || "Server unresponsive"}.`;
        setSyncError(fetchError);
        throw new Error(fetchError);
      }

      // Reset progress steps to default active/idle state before starting sync
      const initialized = initialSteps.map((s, idx) => {
        if (idx === 0) {
          return {
            ...s,
            status: "active" as const,
            logs: ["Dispatching repository sync workflow to GitHub Action..."],
          };
        }
        return { ...s, status: "idle" as const, logs: [] };
      });
      setSteps(initialized);

      const res: any = await apiPost("/api/pipeline/api-companies/trigger-sync", {});
      if (!res.success) {
        throw new Error(res.error || "Failed to trigger sync workflow.");
      }
      
      setSteps((prev) => {
        const next = [...prev].map((s) => ({ ...s, logs: [...s.logs] }));
        if (next[0]) {
          next[0].logs.push("GitHub repository dispatch successfully triggered.");
          next[0].logs.push("Waiting for remote GitHub Action runner to establish socket callback...");
        }
        return next;
      });

      // Start the 45-second self-healing timeout listener
      startSyncTimeout();

      toast({ title: "GitHub Action triggered!", description: "Connecting to live logs..." });
    } catch (e: any) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setSyncing(false);
      setSyncError(e.message || "An error occurred while dispatching the repository sync run.");
      
      setSteps((prev) => {
        const source = prev.length > 0 ? prev : fallbackSteps;
        const next = source.map((s) => ({ ...s, logs: [...s.logs] }));
        if (next[0]) {
          next[0].status = "failed";
          next[0].logs.push(`CRITICAL ERROR: ${e.message || "Failed to dispatch sync workflow."}`);
        }
        return next;
      });

      toast({ title: "Failed to trigger sync", variant: "destructive" });
    }
  };


  const handleCopyWorkflowReport = () => {
    const reportJson = JSON.stringify(steps, null, 2);
    const reportText = `I am experiencing an execution failure in my agentic pipeline. Here is the structural state and log dump from the UI stepper component:

\`\`\`json
${reportJson}
\`\`\`

Please review the logs above, isolate the failure in the system execution layer, and provide a self-healing patch strategy.`;

    navigator.clipboard.writeText(reportText)
      .then(() => {
        toast({ title: "Report Copied!", description: "Markdown workflow log state copied to clipboard." });
      })
      .catch(() => {
        toast({ title: "Copy Failed", description: "Failed to copy report to clipboard.", variant: "destructive" });
      });
  };

  // Compute WebSocket ready state display metadata
  const wsReadyState = typeof WebSocket !== "undefined" ? agent.readyState : 3;

  const getWsStatusBadge = () => {
    switch (wsReadyState) {
      case 0: // CONNECTING
        return (
          <Badge variant="outline" className="border-amber-500/30 text-amber-500 bg-amber-500/10 flex items-center gap-1 h-6">
            <Loader2 className="size-3 animate-spin" />
            <span>Connecting...</span>
          </Badge>
        );
      case 1: // OPEN
        return (
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 bg-emerald-500/10 flex items-center gap-1 h-6">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <Wifi className="size-3" />
            <span>Connected</span>
          </Badge>
        );
      default: // CLOSED / CLOSING
        return (
          <Badge variant="outline" className="border-destructive/30 text-destructive bg-destructive/10 flex items-center gap-1 h-6">
            <WifiOff className="size-3" />
            <span>Offline</span>
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Real-time Error Display Section */}
      {syncError && (
        <Alert variant="destructive" className="border-destructive/40 bg-destructive/10">
          <AlertCircle className="size-4" />
          <AlertTitle className="font-semibold text-sm">Pipeline Error Detected</AlertTitle>
          <AlertDescription className="text-xs mt-1 flex flex-col gap-2">
            <p>{syncError}</p>
            <Button
              size="sm"
              variant="outline"
              className="w-fit h-7 px-2 border-destructive/30 hover:bg-destructive/20 text-destructive-foreground"
              onClick={() => setSyncError(null)}
            >
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Main Control Panel */}
      <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-xl">Pipeline A (Aggregator Sync)</CardTitle>
              {getWsStatusBadge()}
            </div>
            <CardDescription>
              Sync upstream jobs data from GitHub to populate API companies list in D1
            </CardDescription>
          </div>
          <Button
            variant="secondary"
            onClick={triggerSync}
            disabled={syncing}
            className="w-full sm:w-auto"
          >
            {syncing ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Github className="mr-2 size-4" />
            )}
            Trigger Sync
          </Button>
        </CardHeader>

        {/* Real-time WebSocket connection state warnings */}
        {wsReadyState !== 1 && (
          <CardContent className="pb-2">
            <Alert variant="info" className="border-amber-500/20 bg-amber-500/5 text-amber-400 py-3">
              <Terminal className="size-4 text-amber-400" />
              <AlertDescription className="text-xs">
                Real-time connection is currently establishing or offline. You can still trigger the synchronization; progress updates will refresh dynamically when the connection restores, or you can check status in the Run History below.
              </AlertDescription>
            </Alert>
          </CardContent>
        )}

        {/* Dynamic vertical Workflow Stepper replacement */}
        {syncing && (
          <CardContent className="pt-2">
            <PipelineStepper steps={steps} onCopyReport={handleCopyWorkflowReport} />
          </CardContent>
        )}
      </Card>

      {/* History panel */}
      <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Run History</CardTitle>
            <CardDescription>Recent pipeline executions and D1 ingestion results</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchStats} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Timestamp</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Added</TableHead>
                  <TableHead className="text-xs text-right">Deactivated</TableHead>
                  <TableHead className="text-xs text-right">Reactivated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && stats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center">
                      <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : stats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground text-xs">
                      No run history found. Trigger a sync above to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  stats.map((run) => (
                    <TableRow key={run?.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell className="font-medium text-xs">
                        {formatTimestamp(run?.runTimestamp)}
                      </TableCell>
                      <TableCell>
                        {run?.status === "success" ? (
                          <Badge
                            variant="outline"
                            className="border-green-500/30 text-green-500 bg-green-500/10 text-[10px]"
                          >
                            <CheckCircle2 className="mr-1 size-3" />
                            Success
                          </Badge>
                        ) : run?.status === "failed" ? (
                          <Badge variant="destructive" className="text-[10px]">
                            <AlertCircle className="mr-1 size-3" />
                            Failed
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            <Activity className="mr-1 size-3" />
                            {run?.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono">{run?.companiesAdded ?? 0}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{run?.companiesDeactivated ?? 0}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{run?.companiesReactivated ?? 0}</TableCell>
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
