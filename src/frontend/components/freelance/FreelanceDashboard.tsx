/**
 * @fileoverview FreelanceDashboard — main React component for the /freelance page.
 *
 * Renders:
 * - Stats overview cards (opportunities, triage, proposals by platform)
 * - Scan control panel with trigger buttons and scan run history
 * - Opportunity table with triage status, platform badge, and actions
 * - Proposal list with status tracking
 */

import { useAgent } from "agents/react";
import {
  Activity,
  AlertCircle,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Eye,
  Filter,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiGet, apiPost, apiPatch, toast } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FreelanceStats {
  totalOpportunities: number;
  activeOpportunities: number;
  triageBid: number;
  triageSkip: number;
  triagePending: number;
  proposalsDraft: number;
  proposalsSubmitted: number;
  proposalsAccepted: number;
  proposalsRejected: number;
  byPlatform: Record<string, number>;
}

interface FreelanceOpportunity {
  id: number;
  platform: string;
  platformJobId: string;
  url: string;
  title: string;
  description: string;
  skillsJson: string[] | null;
  budgetType: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  budgetCurrency: string | null;
  experienceLevel: string | null;
  clientScore: number | null;
  clientSpent: string | null;
  clientHires: number | null;
  clientVerified: boolean | null;
  proposalsCount: string | null;
  isPremium: boolean | null;
  isUrgent: boolean | null;
  publishedAt: string | number;
  triage?: {
    decision: string;
    confidence: number;
    rationale: string;
    winProbability: number | null;
    recommendedBid: number | null;
  } | null;
  proposals?: any[];
}

interface ScanRun {
  id: string;
  platform: string;
  status: string;
  listingsFound: number;
  listingsNew: number;
  listingsUpdated: number;
  durationMs: number | null;
  triggeredBy: string;
  createdAt: string | number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatTimestamp = (ts: string | number | Date | null | undefined) => {
  if (!ts) return "—";
  try {
    const date = new Date(typeof ts === "number" ? ts * 1000 : ts);
    if (isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return "—";
  }
};

const formatBudget = (opp: FreelanceOpportunity) => {
  const currency = opp.budgetCurrency ?? "USD";
  if (opp.budgetMin && opp.budgetMax) {
    return `${currency} ${opp.budgetMin.toLocaleString()}-${opp.budgetMax.toLocaleString()}`;
  }
  if (opp.budgetMax) return `${currency} ${opp.budgetMax.toLocaleString()}`;
  if (opp.budgetMin) return `${currency} ${opp.budgetMin.toLocaleString()}+`;
  return "—";
};

const triageBadge = (decision: string | undefined) => {
  switch (decision) {
    case "bid":
      return (
        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
          <Target className="mr-0.5 size-2.5" /> Bid
        </Badge>
      );
    case "skip":
      return (
        <Badge className="bg-zinc-500/15 text-zinc-400 border-zinc-500/30 text-[10px]">
          Skip
        </Badge>
      );
    case "manual_review":
      return (
        <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
          <Eye className="mr-0.5 size-2.5" /> Review
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-[10px] text-muted-foreground">
          Pending
        </Badge>
      );
  }
};

const platformBadge = (platform: string) => {
  if (platform === "upwork") {
    return (
      <Badge className="bg-green-600/15 text-green-400 border-green-500/30 text-[10px]">
        Upwork
      </Badge>
    );
  }
  return (
    <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30 text-[10px]">
      Freelancer
    </Badge>
  );
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FreelanceDashboard() {
  // State
  const [stats, setStats] = useState<FreelanceStats | null>(null);
  const [opportunities, setOpportunities] = useState<FreelanceOpportunity[]>([]);
  const [scanRuns, setScanRuns] = useState<ScanRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [triaging, setTriaging] = useState(false);

  // Filters
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [triageFilter, setTriageFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // WebSocket connection for real-time scan progress
  const agent = useAgent({
    agent: "FreelanceScannerAgent",
    name: "global",
    onMessage: (event: any) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg?.type === "freelance-scan-progress") {
          if (msg.status === "completed" || msg.status === "failed") {
            setScanning(false);
            fetchAll();
            toast({
              title: msg.status === "completed" ? "Scan Complete" : "Scan Failed",
              description: msg.status === "completed"
                ? `Found ${msg.found} listings (${msg.new} new, ${msg.updated} updated)`
                : msg.error,
              variant: msg.status === "completed" ? "default" : "destructive",
            });
          }
        }
      } catch {
        // Ignore malformed messages
      }
    },
  });

  const wsReady = typeof WebSocket !== "undefined" ? agent.readyState === 1 : false;

  // Data fetching
  const fetchStats = async () => {
    try {
      const res: any = await apiGet("/api/freelance/stats");
      if (res.data) setStats(res.data);
    } catch {
      // Silently fail for stats
    }
  };

  const fetchOpportunities = async () => {
    try {
      const params = new URLSearchParams();
      if (platformFilter !== "all") params.set("platform", platformFilter);
      params.set("is_active", "true");
      params.set("limit", "100");
      const res: any = await apiGet(`/api/freelance/opportunities?${params}`);
      if (res.data) setOpportunities(res.data);
    } catch {
      toast({ title: "Failed to load opportunities", variant: "destructive" });
    }
  };

  const fetchScanRuns = async () => {
    try {
      const res: any = await apiGet("/api/freelance/scan-runs?limit=10");
      if (res.data) setScanRuns(res.data);
    } catch {
      // Silently fail
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchStats(), fetchOpportunities(), fetchScanRuns()]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, [platformFilter]);

  // Actions
  const triggerScan = async (platform: "upwork" | "freelancer" | "both") => {
    try {
      setScanning(true);
      await apiPost("/api/freelance/scan", { platform });
      toast({ title: "Scan triggered", description: `Scanning ${platform}...` });
    } catch (e: any) {
      setScanning(false);
      toast({ title: "Failed to trigger scan", variant: "destructive" });
    }
  };

  const triggerTriage = async () => {
    try {
      setTriaging(true);
      await apiPost("/api/freelance/triage", {});
      toast({ title: "AI Triage Started", description: "Processing pending opportunities..." });
      // Refresh after a delay
      setTimeout(() => {
        setTriaging(false);
        fetchAll();
      }, 15000);
    } catch {
      setTriaging(false);
      toast({ title: "Triage failed", variant: "destructive" });
    }
  };

  const generateProposal = async (oppId: number) => {
    try {
      toast({ title: "Generating proposal...", description: "AI is drafting your cover letter" });
      const res: any = await apiPost(`/api/freelance/opportunities/${oppId}/proposal`, {});
      if (res.data) {
        toast({ title: "Proposal Ready", description: "Draft created successfully" });
        fetchAll();
      }
    } catch (e: any) {
      toast({ title: "Proposal generation failed", variant: "destructive" });
    }
  };

  const promoteToRole = async (oppId: number) => {
    try {
      const res: any = await apiPost(`/api/freelance/opportunities/${oppId}/promote`, {});
      if (res.data) {
        toast({ title: "Promoted to Role", description: `Role created: ${res.data.jobTitle}` });
      }
    } catch (e: any) {
      toast({ title: "Promotion failed", description: e.message, variant: "destructive" });
    }
  };

  // Filtered opportunities
  const filtered = opportunities.filter((opp) => {
    if (triageFilter !== "all") {
      const decision = opp.triage?.decision;
      if (triageFilter === "pending" && decision) return false;
      if (triageFilter !== "pending" && decision !== triageFilter) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        opp.title.toLowerCase().includes(q) ||
        opp.description.toLowerCase().includes(q) ||
        opp.skillsJson?.some((s) => s.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/60 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Opportunities</CardTitle>
            <Briefcase className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.activeOpportunities ?? "—"}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.byPlatform?.upwork ?? 0} Upwork · {stats?.byPlatform?.freelancer ?? 0} Freelancer
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI Triage</CardTitle>
            <Sparkles className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">{stats?.triageBid ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              recommended to bid · {stats?.triageSkip ?? 0} skipped · {stats?.triagePending ?? 0} pending
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Proposals</CardTitle>
            <Send className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(stats?.proposalsDraft ?? 0) + (stats?.proposalsSubmitted ?? 0)}</div>
            <p className="text-xs text-muted-foreground">
              {stats?.proposalsDraft ?? 0} drafts · {stats?.proposalsSubmitted ?? 0} submitted
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <TrendingUp className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.proposalsAccepted && stats.proposalsSubmitted
                ? `${Math.round((stats.proposalsAccepted / stats.proposalsSubmitted) * 100)}%`
                : "—"}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.proposalsAccepted ?? 0} accepted · {stats?.proposalsRejected ?? 0} rejected
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Scan Controls */}
      <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-xl">Scan Controls</CardTitle>
              <Badge
                variant="outline"
                className={`flex items-center gap-1 h-6 text-[10px] ${
                  wsReady
                    ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/10"
                    : "border-destructive/30 text-destructive bg-destructive/10"
                }`}
              >
                {wsReady ? (
                  <>
                    <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <Wifi className="size-3" />
                    Live
                  </>
                ) : (
                  <>
                    <WifiOff className="size-3" />
                    Offline
                  </>
                )}
              </Badge>
            </div>
            <CardDescription>
              Scan Upwork and Freelancer.com for matching opportunities. Cron: every 12 hours.
            </CardDescription>
          </div>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => triggerScan("upwork")}
              disabled={scanning}
            >
              {scanning ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : <Play className="mr-1.5 size-3" />}
              Upwork
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => triggerScan("freelancer")}
              disabled={scanning}
            >
              {scanning ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : <Play className="mr-1.5 size-3" />}
              Freelancer
            </Button>
            <Button
              onClick={() => triggerScan("both")}
              disabled={scanning}
              size="sm"
            >
              {scanning ? <Loader2 className="mr-1.5 size-3 animate-spin" /> : <Zap className="mr-1.5 size-3" />}
              Scan Both
            </Button>
          </div>
        </CardHeader>

        {/* Recent scan runs */}
        {scanRuns.length > 0 && (
          <CardContent className="pt-0">
            <div className="rounded-md border border-border/50 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Time</TableHead>
                    <TableHead className="text-xs">Platform</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs text-right">Found</TableHead>
                    <TableHead className="text-xs text-right">New</TableHead>
                    <TableHead className="text-xs text-right">Updated</TableHead>
                    <TableHead className="text-xs">Trigger</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scanRuns.map((run) => (
                    <TableRow key={run.id} className="hover:bg-muted/40">
                      <TableCell className="text-xs">{formatTimestamp(run.createdAt)}</TableCell>
                      <TableCell>{platformBadge(run.platform)}</TableCell>
                      <TableCell>
                        {run.status === "completed" ? (
                          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                            <CheckCircle2 className="mr-0.5 size-2.5" /> Done
                          </Badge>
                        ) : run.status === "failed" ? (
                          <Badge variant="destructive" className="text-[10px]">
                            <AlertCircle className="mr-0.5 size-2.5" /> Failed
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[10px]">
                            <Activity className="mr-0.5 size-2.5" /> {run.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs font-mono">{run.listingsFound}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{run.listingsNew}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{run.listingsUpdated}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {run.triggeredBy}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Opportunities Table */}
      <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl">Opportunities</CardTitle>
            <CardDescription>
              {filtered.length} of {opportunities.length} opportunities
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={triggerTriage}
              disabled={triaging}
            >
              {triaging ? (
                <Loader2 className="mr-1.5 size-3 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 size-3" />
              )}
              AI Triage
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchAll}
              disabled={loading}
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {/* Filters */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Search opportunities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
            <Select value={platformFilter} onValueChange={(val) => setPlatformFilter(val ?? "all")}>
              <SelectTrigger className="w-[140px] h-9">
                <Filter className="mr-1.5 size-3" />
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                <SelectItem value="upwork">Upwork</SelectItem>
                <SelectItem value="freelancer">Freelancer</SelectItem>
              </SelectContent>
            </Select>
            <Select value={triageFilter} onValueChange={(val) => setTriageFilter(val ?? "all")}>
              <SelectTrigger className="w-[140px] h-9">
                <Target className="mr-1.5 size-3" />
                <SelectValue placeholder="Triage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Triage</SelectItem>
                <SelectItem value="bid">Bid</SelectItem>
                <SelectItem value="skip">Skip</SelectItem>
                <SelectItem value="manual_review">Review</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="rounded-md border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Platform</TableHead>
                  <TableHead className="text-xs min-w-[250px]">Opportunity</TableHead>
                  <TableHead className="text-xs">Budget</TableHead>
                  <TableHead className="text-xs">Client</TableHead>
                  <TableHead className="text-xs">Triage</TableHead>
                  <TableHead className="text-xs">Win %</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && opportunities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground text-xs">
                      {opportunities.length === 0
                        ? "No opportunities found. Trigger a scan to discover listings."
                        : "No opportunities match the current filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.slice(0, 50).map((opp) => (
                    <TableRow key={opp.id} className="hover:bg-muted/40 transition-colors">
                      <TableCell>{platformBadge(opp.platform)}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <a
                            href={opp.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium hover:text-primary transition-colors flex items-center gap-1"
                          >
                            {opp.title.slice(0, 60)}{opp.title.length > 60 ? "..." : ""}
                            <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                          </a>
                          {opp.skillsJson && (
                            <div className="flex gap-1 flex-wrap">
                              {opp.skillsJson.slice(0, 4).map((skill) => (
                                <Badge key={skill} variant="secondary" className="text-[9px] px-1 py-0">
                                  {skill}
                                </Badge>
                              ))}
                              {opp.skillsJson.length > 4 && (
                                <Badge variant="secondary" className="text-[9px] px-1 py-0">
                                  +{opp.skillsJson.length - 4}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <span className="font-mono">{formatBudget(opp)}</span>
                          {opp.budgetType && (
                            <span className="text-muted-foreground ml-1">
                              ({opp.budgetType})
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs space-y-0.5">
                          {opp.clientScore !== null && (
                            <div className="flex items-center gap-1">
                              <span className="font-mono">{opp.clientScore.toFixed(1)}</span>
                              <span className="text-muted-foreground">★</span>
                            </div>
                          )}
                          <span className="text-muted-foreground">
                            {opp.proposalsCount ?? "0"} bids
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{triageBadge(opp.triage?.decision)}</TableCell>
                      <TableCell>
                        {opp.triage?.winProbability !== null && opp.triage?.winProbability !== undefined ? (
                          <span className="text-xs font-mono">
                            {Math.round(opp.triage.winProbability * 100)}%
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {opp.triage?.decision === "bid" && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              title="Generate Proposal"
                              onClick={() => generateProposal(opp.id)}
                            >
                              <Send className="size-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Promote to Role"
                            onClick={() => promoteToRole(opp.id)}
                          >
                            <ChevronRight className="size-3.5" />
                          </Button>
                        </div>
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
