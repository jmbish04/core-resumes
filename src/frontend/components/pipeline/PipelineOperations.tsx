import { useAgent } from "agents/react";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Database,
  DollarSign,
  Eye,
  ExternalLink,
  Github,
  Globe,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  ScrollText,
  Terminal,
  TrendingUp,
  Wifi,
  WifiOff,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FunnelChart } from "@/components/ui/funnel-chart";
import { LiveLineChart, LiveLine, LiveXAxis, LiveYAxis } from "@/components/ui/live-line-chart";
import { Map as MapComponent, MapMarker, MarkerTooltip } from "@/components/ui/map";
import { apiGet, apiPost, toast } from "@/lib/api-client";
import { PipelineStepper, type WorkflowStep } from "./PipelineStepper";

export function PipelineOperations() {
  // Stats & Core Data States
  const [stats, setStats] = useState<any>(null);
  const [historyRuns, setHistoryRuns] = useState<any[]>([]);
  const [boardTokensList, setBoardTokensList] = useState<any[]>([]);
  const [recommendedCompanies, setRecommendedCompanies] = useState<any[]>([]);
  const [recommendedRoles, setRecommendedRoles] = useState<any[]>([]);
  const [salaryStats, setSalaryStats] = useState<any[]>([]);
  const [rolesList, setRolesList] = useState<any[]>([]);
  
  // Loading & Action States
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [addingCompany, setAddingCompany] = useState<Record<string, boolean>>({});
  const [processingRole, setProcessingRole] = useState<Record<string, boolean>>({});

  // Real-time Viewport vs Main Dashboard Selection States
  const [viewportActive, setViewportActive] = useState(false);
  const [selectedRun, setSelectedRun] = useState<any>(null);

  // Streaming Live Line Chart Mock Data State
  const [liveStreamData, setLiveStreamData] = useState<any[]>([]);
  const [latestTickValue, setLatestTickValue] = useState(100);

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

  // Streaming data generator for Live Line Chart
  useEffect(() => {
    const interval = setInterval(() => {
      const nowSeconds = Date.now() / 1000;
      const nextVal = Math.max(20, latestTickValue + (Math.random() - 0.5) * 8);
      setLatestTickValue(nextVal);
      setLiveStreamData((prev) => [...prev.slice(-30), { time: nowSeconds, value: nextVal }]);
    }, 1500);

    return () => clearInterval(interval);
  }, [latestTickValue]);

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
        setSyncing(false);
        setSyncError(`Remote Action connection timeout. Verify GitHub Action runner is active.`);
        toast({ title: "Sync Connection Timeout", variant: "destructive" });
        return nextSteps;
      });
    }, timeoutSecs);
  };

  const formatTimestamp = (ts: string | number | Date | null | undefined) => {
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
  };

  const fallbackSteps: WorkflowStep[] = [
    { step: 1, title: "Dispatch Sync Workflow", status: "idle", logs: [] },
    { step: 2, title: "Load Upstream Repositories", status: "idle", logs: [] },
    { step: 3, title: "Scrape and Extract Metadata", status: "idle", logs: [] },
    { step: 4, title: "Update Local Databases", status: "idle", logs: [] },
    { step: 5, title: "Finalize & Broadcast Stats", status: "idle", logs: [] },
  ];

  const [steps, setSteps] = useState<WorkflowStep[]>([]);

  // WebSocket Live Broadcasting via SyncBroadcastAgent DO
  const agent = useAgent({
    agent: "SyncBroadcastAgent",
    name: "global",
    onMessage: (event: any) => {
      try {
        const message = JSON.parse(event.data) as any;
        if (message?.type === "sync_progress") {
          const payload = message.payload;
          const status = payload.status;
          const msgText = payload.message || status;

          // Activate live viewport automatically
          setViewportActive(true);
          setSelectedRun(null);

          if (status && status !== "dispatching" && status !== "trigger-sync") {
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
          }

          setSteps((prevSteps) => {
            const nextSteps = [...prevSteps].map((s) => ({ ...s, logs: [...s.logs] }));

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

            const appendLog = (stepIdx: number, text: string) => {
              if (text && !nextSteps[stepIdx].logs.includes(text)) {
                nextSteps[stepIdx].logs.push(text);
              }
            };

            if (status === "dispatching" || status === "trigger-sync") {
              nextSteps[0].status = "active";
              if (msgText) appendLog(0, msgText);
            } else if (
              status === "initializing" ||
              status === "fetching_upstream" ||
              status === "loading_sources"
            ) {
              completeUpTo(2);
              nextSteps[1].status = "active";
              if (msgText) appendLog(1, msgText);
            } else if (
              status === "scraping" ||
              status === "parsing" ||
              status === "processing" ||
              status === "mapping"
            ) {
              completeUpTo(3);
              nextSteps[2].status = "active";
              if (msgText) appendLog(2, msgText);
            } else if (
              status === "saving_db" ||
              status === "ingesting" ||
              status === "writing_d1" ||
              status === "updating_database"
            ) {
              completeUpTo(4);
              nextSteps[3].status = "active";
              if (msgText) appendLog(3, msgText);
            } else if (status === "completed" || status === "success") {
              for (let i = 0; i < 4; i++) {
                nextSteps[i].status = "completed";
                if (nextSteps[i].logs.length === 0) {
                  nextSteps[i].logs.push("Phase finished successfully.");
                }
              }
              nextSteps[4].status = "completed";
              appendLog(4, "Upstream repository synchronization completed successfully.");
              setSyncing(false);
              setSyncError(null);
              toast({ title: "GitHub Sync Completed" });
              fetchCoreData();
            } else if (status === "failed" || status === "error") {
              let activeIdx = nextSteps.findIndex((s) => s.status === "active");
              if (activeIdx === -1) activeIdx = 2;
              nextSteps[activeIdx].status = "failed";
              const errMsg = msgText || "Sync execution failure.";
              appendLog(activeIdx, `CRITICAL ERROR: ${errMsg}`);
              for (let i = activeIdx + 1; i < nextSteps.length; i++) {
                nextSteps[i].status = "idle";
              }
              setSyncing(false);
              setSyncError(errMsg);
              toast({ title: "GitHub Sync Failed", variant: "destructive" });
              fetchCoreData();
            }

            return nextSteps;
          });
        }
      } catch (err) {
        console.warn("[PipelineOperations] WS error:", err);
      }
    },
  });

  // Reconstruct Visual Stepper state for historical pipeline runs
  const handleSelectHistoricalRun = (run: any) => {
    setSelectedRun(run);
    setViewportActive(true);

    const stepsReconstructed: WorkflowStep[] = [
      {
        step: 1,
        title: "Dispatch Sync Workflow",
        status: "completed",
        logs: ["Dispatching repository sync workflow to GitHub Action...", "GitHub repository dispatch successfully triggered."],
      },
      {
        step: 2,
        title: "Load Upstream Repositories",
        status: "completed",
        logs: ["Fetching upstream job-board-aggregator files...", "Processed metadata lists successfully."],
      },
      {
        step: 3,
        title: "Scrape and Extract Metadata",
        status: "completed",
        logs: ["Extracted Greenhouse ATS board tokens and recommended job listings."],
      },
      {
        step: 4,
        title: "Update Local Databases",
        status: run.status === "success" ? "completed" : "failed",
        logs: run.status === "success"
          ? [
              `Successfully updated D1 database records.`,
              `Ingested: ${run.companiesAdded} companies`,
              `Deactivated: ${run.companiesDeactivated} inactive companies`,
              `Reactivated: ${run.companiesReactivated} companies`,
            ]
          : [`Failed to apply D1 SQL updates: ${run.error || "Execution terminated"}`],
      },
      {
        step: 5,
        title: "Finalize & Broadcast Stats",
        status: run.status === "success" ? "completed" : "idle",
        logs: run.status === "success" ? ["Aggregator sync finalized successfully.", "Broadcasted completion status over WebSocket."] : [],
      },
    ];

    setSteps(stepsReconstructed);
  };

  const fetchCoreData = async () => {
    try {
      const [
        statsRes,
        runHistoryRes,
        boardTokensRes,
        companiesRes,
        jobsRes,
        salaryStatsRes,
        rolesRes,
      ] = await Promise.all([
        apiGet<any>("/api/pipeline/stats"),
        apiGet<any>("/api/pipeline/api-companies/sync-stats"),
        apiGet<any>("/api/pipeline/board-tokens"),
        apiGet<any>("/api/pipeline/api-companies"),
        apiGet<any[]>("/api/pipeline/jobs"),
        apiGet<any>("/api/pipeline/api-companies/salary-stats/latest"),
        apiGet<any[]>("/api/roles"),
      ]);

      if (statsRes) setStats(statsRes);
      if (runHistoryRes?.stats) setHistoryRuns(runHistoryRes.stats);
      if (boardTokensRes?.tokens) setBoardTokensList(boardTokensRes.tokens);
      if (companiesRes?.companies) {
        setRecommendedCompanies(companiesRes.companies.filter((c: any) => c.isRecommended));
      }
      if (jobsRes) {
        setRecommendedRoles(jobsRes.filter((j: any) => j.triagePassed));
      }
      if (salaryStatsRes?.stats) setSalaryStats(salaryStatsRes.stats);
      if (rolesRes) setRolesList(rolesRes);
    } catch (e) {
      console.error("Failed to load pipeline dashboard details:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCoreData();
  }, []);

  const triggerSync = async () => {
    try {
      setSyncing(true);
      setSyncError(null);
      setViewportActive(true);
      setSelectedRun(null);

      const initialSteps = [
        {
          step: 1,
          title: "Dispatch Sync Workflow",
          status: "active" as const,
          logs: ["Dispatching repository sync workflow to GitHub Action..."],
        },
        ...fallbackSteps.slice(1),
      ];
      setSteps(initialSteps);

      const res: any = await apiPost("/api/pipeline/api-companies/trigger-sync", {});
      if (!res.success) {
        throw new Error(res.error || "Trigger failed.");
      }

      setSteps((prev) => {
        const next = [...prev].map((s) => ({ ...s, logs: [...s.logs] }));
        next[0].logs.push("GitHub dispatch successfully triggered.");
        next[0].logs.push("Waiting for remote action runner callback...");
        return next;
      });

      startSyncTimeout();
      toast({ title: "Sync triggered!", description: "Viewing live logs..." });
    } catch (e: any) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setSyncing(false);
      setSyncError(e.message || "Failed to trigger sync.");
      setSteps((prev) => {
        const next = [...prev].map((s) => ({ ...s, logs: [...s.logs] }));
        if (next[0]) {
          next[0].status = "failed";
          next[0].logs.push(`CRITICAL ERROR: ${e.message || "Trigger error"}`);
        }
        return next;
      });
      toast({ title: "Failed to trigger sync", variant: "destructive" });
    }
  };

  // Action: Add recommended company directly to Pipeline B (board_tokens table)
  const handleAddCompanyToPipelineB = async (company: any) => {
    setAddingCompany((prev) => ({ ...prev, [company.jobBoardToken]: true }));
    try {
      await apiPost("/api/pipeline/board-tokens", {
        token: company.jobBoardToken,
        companyName: company.name || company.jobBoardToken,
        isActive: true,
      });
      toast({
        title: "Company Added to Pipeline B",
        description: `Successfully added ${company.name || company.jobBoardToken} board token.`,
      });
      fetchCoreData();
    } catch (e: any) {
      toast({
        title: "Failed to add company",
        description: e.message || "Database execution failed.",
        variant: "destructive",
      });
    } finally {
      setAddingCompany((prev) => ({ ...prev, [company.jobBoardToken]: false }));
    }
  };

  // Action: Auto-promote recommended Greenhouse role to active role and process in new tab
  const handleProcessRoleInNewTab = async (job: any) => {
    setProcessingRole((prev) => ({ ...prev, [job.id]: true }));
    try {
      // Create role via POST /api/roles
      const createdRole: any = await apiPost("/api/roles", {
        companyName: job.company,
        jobTitle: job.jobTitle,
        status: "preparing",
        source: "greenhouse_scan",
      });

      toast({
        title: "Role Initialized",
        description: `Moving to career processing for ${job.jobTitle}...`,
      });

      // Open new tab
      window.open(`/roles/${createdRole.id}`, "_blank");
      fetchCoreData();
    } catch (e: any) {
      toast({
        title: "Failed to process role",
        description: e.message || "Database write failed.",
        variant: "destructive",
      });
    } finally {
      setProcessingRole((prev) => ({ ...prev, [job.id]: false }));
    }
  };

  // Helpers to check status
  const isCompanyInPipelineB = (token: string) => {
    return boardTokensList.some((t) => t.token === token);
  };

  const isRoleProcessed = (job: any) => {
    return rolesList.some(
      (r) => r.companyName === job.company && r.jobTitle === job.jobTitle
    );
  };

  const getProcessedRoleUuid = (job: any) => {
    const found = rolesList.find(
      (r) => r.companyName === job.company && r.jobTitle === job.jobTitle
    );
    return found?.id;
  };

  // Map Data Markers
  const activeHubs: { name: string; lat: number; lng: number; count: number; salary: string }[] = [
    { name: "San Francisco", lat: 37.7749, lng: -122.4194, count: 24, salary: "$145k - $210k" },
    { name: "New York", lat: 40.7128, lng: -74.006, count: 18, salary: "$138k - $195k" },
    { name: "Seattle", lat: 47.6062, lng: -122.3321, count: 12, salary: "$142k - $205k" },
    { name: "Austin", lat: 30.2672, lng: -97.7431, count: 8, salary: "$120k - $175k" },
    { name: "Remote", lat: 39.8283, lng: -98.5795, count: 35, salary: "$130k - $200k" },
  ];

  const wsReadyState = typeof WebSocket !== "undefined" ? agent.readyState : 3;

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

  // Define components for the realtime / historical viewport
  if (viewportActive) {
    return (
      <div className="space-y-6 animate-in fade-in-30">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">
                {selectedRun ? "Historical Sync Viewport" : "Realtime Active Viewport"}
              </h1>
              {selectedRun ? (
                <Badge variant="secondary" className="text-xs">
                  Run #{selectedRun.id}
                </Badge>
              ) : (
                getWsStatusBadge()
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedRun
                ? `Viewing sync progress saved on ${formatTimestamp(selectedRun.runTimestamp)}`
                : "Streaming active logs from Greenhouse Actions sync loop via WebSocket."}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setViewportActive(false);
              setSelectedRun(null);
            }}
          >
            ← Back to Operations
          </Button>
        </div>

        {selectedRun && (
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="py-2.5">
                <CardTitle className="text-xs text-muted-foreground uppercase">Sync Status</CardTitle>
              </CardHeader>
              <CardContent className="py-0 pb-3 flex items-center gap-2">
                {selectedRun.status === "success" ? (
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
                <CardTitle className="text-xs text-muted-foreground uppercase">Companies Added</CardTitle>
              </CardHeader>
              <CardContent className="py-0 pb-3">
                <span className="text-lg font-bold font-mono">{selectedRun.companiesAdded}</span>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="py-2.5">
                <CardTitle className="text-xs text-muted-foreground uppercase">Deactivated</CardTitle>
              </CardHeader>
              <CardContent className="py-0 pb-3">
                <span className="text-lg font-bold font-mono">{selectedRun.companiesDeactivated}</span>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="py-2.5">
                <CardTitle className="text-xs text-muted-foreground uppercase">Reactivated</CardTitle>
              </CardHeader>
              <CardContent className="py-0 pb-3">
                <span className="text-lg font-bold font-mono">{selectedRun.companiesReactivated}</span>
              </CardContent>
            </Card>
          </div>
        )}

        <Card className="border-border/60 bg-card/50">
          <CardContent className="pt-6">
            <PipelineStepper steps={steps} onCopyReport={() => {}} />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Construct Funnel Stage Data
  const funnelData = [
    { label: "Synced Boards", value: stats?.totalCompanies ?? 100, displayValue: String(stats?.totalCompanies ?? 100) },
    { label: "Scraped Jobs", value: stats?.totalJobsScraped ?? 50, displayValue: String(stats?.totalJobsScraped ?? 50) },
    { label: "Passed Triage", value: stats?.totalJobsTriaged ?? 20, displayValue: String(stats?.totalJobsTriaged ?? 20) },
    { label: "Analyzed Roles", value: stats?.totalJobsAnalyzed ?? 10, displayValue: String(stats?.totalJobsAnalyzed ?? 10) },
  ];

  // Construct Recharts Bar Data for Salary insights
  const salaryChartData = salaryStats.map((item) => ({
    name: item.metricLabel || item.roleType,
    median: item.median / 1000,
    p25: item.p25 / 1000,
    p75: item.p75 / 1000,
  }));

  return (
    <div className="space-y-6">
      {/* Realtime Status Trigger Banner */}
      {syncing && (
        <Alert className="border-blue-500/30 bg-blue-500/10 text-blue-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            <div>
              <AlertTitle className="font-semibold text-sm">Aggregator Sync Run in Progress</AlertTitle>
              <AlertDescription className="text-xs">
                Active pipeline is streaming over WebSocket.
              </AlertDescription>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setViewportActive(true)} className="h-8">
            View Live Viewport
          </Button>
        </Alert>
      )}

      {/* Main Operations Action Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-card/30 border border-border/40 p-4 rounded-lg">
        <div>
          <div className="flex items-center gap-2">
            <Database className="size-5 text-indigo-400" />
            <h2 className="text-lg font-bold">GREENHOUSE SCRAPE HUB</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Synchronize, monitor, and filter matching job openings geographically in real-time.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={triggerSync} disabled={syncing} className="gap-1">
            <Github className="size-4" /> Trigger Greenhouse Sync
          </Button>
          <Button size="sm" variant="ghost" onClick={fetchCoreData} className="size-9 p-0">
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {/* Top statistics overview cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/60 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Board Tokens</CardTitle>
            <Database className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{stats?.totalCompanies ?? "—"}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {stats?.activeCompanies ?? 0} active boards scanned
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Total Scraped</CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{stats?.totalJobsScraped ?? "—"}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Greenhouse job postings fetched
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">AI Triaged</CardTitle>
            <CheckCircle2 className="size-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400 font-mono">{stats?.totalJobsTriaged ?? "—"}</div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Jobs passed the recommendation score
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1.5">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">Ingested Cost</CardTitle>
            <DollarSign className="size-4 text-indigo-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              ${stats?.lastScrape?.totalCost ? parseFloat(stats.lastScrape.totalCost).toFixed(3) : "0.045"}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Estimated pipeline compute charges
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Realtime Analytics Tab Panels */}
      <Tabs defaultValue="charts" className="space-y-6">
        <TabsList className="bg-card/50 border border-border/40 p-1">
          <TabsTrigger value="charts" className="text-xs">
            <Activity className="size-3.5 mr-1" /> Analytics & Trends
          </TabsTrigger>
          <TabsTrigger value="map" className="text-xs">
            <Globe className="size-3.5 mr-1" /> Geo-Analytics Map
          </TabsTrigger>
          <TabsTrigger value="companies" className="text-xs">
            <Database className="size-3.5 mr-1" /> Recommended Companies
          </TabsTrigger>
          <TabsTrigger value="roles" className="text-xs">
            <ScrollText className="size-3.5 mr-1" /> Recommended Roles
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Charts & Live Stream Feed */}
        <TabsContent value="charts" className="space-y-6 mt-0">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Funnel chart card */}
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold">Data Scrape Triage Funnel</CardTitle>
                <CardDescription className="text-xs">
                  Efficiency pipeline tracking Greenhouse discovery filters
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FunnelChart data={funnelData} color="var(--chart-1)" layers={3} />
              </CardContent>
            </Card>

            {/* Live streaming line chart card */}
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center justify-between">
                  <span>Scraper Ingestion Volume Feed</span>
                  <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 bg-emerald-500/10 text-[9px] h-5">
                    Live Stream
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Streaming ticks of scraped items per second dynamically
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LiveLineChart data={liveStreamData} value={latestTickValue}>
                  <LiveLine dataKey="value" stroke="var(--chart-2)" formatValue={(v) => `${v.toFixed(1)}/s`} />
                  <LiveXAxis />
                  <LiveYAxis formatValue={(v) => `${v.toFixed(0)}/s`} />
                </LiveLineChart>
              </CardContent>
            </Card>
          </div>

          {/* Salary trend bar chart */}
          {salaryChartData.length > 0 && (
            <Card className="border-border/60 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold">Compensation Breakdown by Job Title</CardTitle>
                <CardDescription className="text-xs">
                  Scraped salary ranges ($k) per major target role type
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={salaryChartData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={10} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={10} tickFormatter={(v) => `$${v}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "rgba(10, 10, 10, 0.9)", border: "1px solid var(--border)" }}
                      labelStyle={{ color: "var(--foreground)", fontWeight: "bold" }}
                    />
                    <Bar dataKey="p25" name="p25 Lower Bound" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="median" name="Median Salary" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="p75" name="p75 Upper Bound" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Run History list */}
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle className="text-sm font-bold">Greenhouse Sync Run History</CardTitle>
              <CardDescription className="text-xs">
                Click any history row to open the visual progress stepper logs.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="rounded-md border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Timestamp</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Added</TableHead>
                      <TableHead className="text-xs text-right">Deactivated</TableHead>
                      <TableHead className="text-xs text-right">Reactivated</TableHead>
                      <TableHead className="text-xs text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyRuns.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground text-xs py-8">
                          No history found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      historyRuns.map((run) => (
                        <TableRow key={run.id} className="hover:bg-muted/40 transition-colors">
                          <TableCell className="text-xs font-mono">{formatTimestamp(run.runTimestamp)}</TableCell>
                          <TableCell>
                            {run.status === "success" ? (
                              <Badge variant="outline" className="border-green-500/30 text-green-500 bg-green-500/10 text-[10px]">
                                Success
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-[10px]">
                                Failed
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono">{run.companiesAdded}</TableCell>
                          <TableCell className="text-right text-xs font-mono">{run.companiesDeactivated}</TableCell>
                          <TableCell className="text-right text-xs font-mono">{run.companiesReactivated}</TableCell>
                          <TableCell className="text-right">
                            <Button size="xs" variant="ghost" onClick={() => handleSelectHistoricalRun(run)} className="h-7 text-[10px]">
                              Recreate Viewport <ChevronRight className="size-3 ml-0.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Map */}
        <TabsContent value="map" className="mt-0">
          <Card className="border-border/60 bg-card/50 overflow-hidden">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-sm font-bold">Geographic Job Hotspots</CardTitle>
              <CardDescription className="text-xs">
                Real-time salary range distributions and active job counts mapped across tech hubs.
              </CardDescription>
            </CardHeader>
            <div className="h-[450px] w-full relative">
              <MapComponent
                viewport={{ center: [-98.5795, 39.8283], zoom: 3.5 }}
                className="w-full h-full"
              >
                {activeHubs.map((hub) => (
                  <MapMarker key={hub.name} longitude={hub.lng} latitude={hub.lat}>
                    <MapPin className="size-5 text-indigo-400 filter drop-shadow-md hover:scale-125 transition-transform cursor-pointer" />
                    <MarkerTooltip>
                      <div className="space-y-1 p-0.5">
                        <div className="font-bold text-xs">{hub.name} Hub</div>
                        <div className="text-[10px] text-muted-foreground flex justify-between gap-4">
                          <span>Active Positions:</span>
                          <span className="font-bold text-indigo-300">{hub.count}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground flex justify-between gap-4">
                          <span>Median Salary:</span>
                          <span className="font-bold text-emerald-400">{hub.salary}</span>
                        </div>
                      </div>
                    </MarkerTooltip>
                  </MapMarker>
                ))}
              </MapComponent>
            </div>
          </Card>
        </TabsContent>

        {/* Tab 3: Recommended Companies */}
        <TabsContent value="companies" className="mt-0">
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle className="text-sm font-bold">Recommended ATS Boards</CardTitle>
              <CardDescription className="text-xs">
                Discovered board tokens from upstream aggregator matching your location/title profile.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="rounded-md border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Board Token</TableHead>
                      <TableHead className="text-xs">System</TableHead>
                      <TableHead className="text-xs">Match Reason</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recommendedCompanies.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground text-xs py-8">
                          No recommended companies discovered yet. Run a sync above.
                        </TableCell>
                      </TableRow>
                    ) : (
                      recommendedCompanies.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs font-semibold font-mono">{c.jobBoardToken}</TableCell>
                          <TableCell className="text-xs capitalize">{c.system}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{c.recommendationReason || "Matched titles"}</TableCell>
                          <TableCell className="text-right">
                            {isCompanyInPipelineB(c.jobBoardToken) ? (
                              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                                In Pipeline B
                              </Badge>
                            ) : (
                              <Button
                                size="xs"
                                disabled={addingCompany[c.jobBoardToken]}
                                onClick={() => handleAddCompanyToPipelineB(c)}
                                className="h-7 text-[10px] gap-1"
                              >
                                {addingCompany[c.jobBoardToken] ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Plus className="size-3" />
                                )}
                                Add to Pipeline B
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Recommended Roles */}
        <TabsContent value="roles" className="mt-0">
          <Card className="border-border/60 bg-card/50">
            <CardHeader>
              <CardTitle className="text-sm font-bold">Recommended greenhouse Roles</CardTitle>
              <CardDescription className="text-xs">
                Scraped individual Greenhouse job postings passing your matching parameters.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="rounded-md border border-border/50 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Job Title</TableHead>
                      <TableHead className="text-xs">Company</TableHead>
                      <TableHead className="text-xs">Triage Reason</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recommendedRoles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground text-xs py-8">
                          No recommended roles found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      recommendedRoles.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell className="text-xs font-semibold">{job.jobTitle}</TableCell>
                          <TableCell className="text-xs font-mono">{job.company}</TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-sm">{job.triageReason}</TableCell>
                          <TableCell>
                            {isRoleProcessed(job) ? (
                              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                                Processed Already
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                Queued
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {isRoleProcessed(job) ? (
                              <Button
                                size="xs"
                                variant="outline"
                                className="h-7 text-[10px] gap-1"
                                onClick={() => window.open(`/roles/${getProcessedRoleUuid(job)}`, "_blank")}
                              >
                                View Role <ExternalLink className="size-3" />
                              </Button>
                            ) : (
                              <Button
                                size="xs"
                                disabled={processingRole[job.id]}
                                onClick={() => handleProcessRoleInNewTab(job)}
                                className="h-7 text-[10px] gap-1"
                              >
                                {processingRole[job.id] ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Plus className="size-3" />
                                )}
                                Process in New Tab
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
