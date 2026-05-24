/**
 * @fileoverview GreenhousePipelineDocs — Live interactive widget suite
 * embedded in the Greenhouse Pipeline documentation page.
 *
 * Renders real-time data from the pipeline backend:
 *  - Pipeline health check (greenhouse-only)
 *  - Last scrape / next run status
 *  - Session history chart (Recharts)
 *  - Snapshot insights (verdict distribution, company coverage)
 *  - Board token configuration table with edit link
 */

import {
  Activity,
  AlertCircle,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  Settings,
  Sprout,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
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
import { apiGet, apiPost } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PipelineStats {
  totalSessions: number;
  totalCompanies: number;
  activeCompanies: number;
  totalJobsScraped: number;
  totalJobsTriaged: number;
  totalJobsAnalyzed: number;
  lastScrape: {
    timestamp: string;
    totalScraped: number;
    totalTriaged: number;
    totalAnalyzed: number;
    totalFailed: number;
  } | null;
  nextScheduledRun: string | null;
  cronSchedule: string;
  sessionHistory: Array<{
    timestamp: string;
    totalScraped: number;
    totalTriaged: number;
    totalAnalyzed: number;
    totalFailed: number;
  }>;
}

interface HealthResult {
  name: string;
  status: "ok" | "warn" | "fail" | "skipped" | "timeout";
  message?: string;
  durationMs: number;
  details?: Record<string, unknown>;
}

interface PipelineHealth {
  results: HealthResult[];
  overall: "healthy" | "degraded" | "unhealthy";
  durationMs: number;
}

interface BoardToken {
  id: number;
  token: string;
  companyName: string | null;
  companyUrl: string | null;
  emailDomain: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SnapshotInsights {
  verdictDistribution: Array<{ verdict: string; count: number }>;
  avgSalary: {
    overall: number | null;
    byVerdict: Array<{
      verdict: string;
      avgMin: number | null;
      avgMax: number | null;
    }>;
  };
  totalSnapshots: number;
  totalPostings: number;
  companyCoverage: Array<{
    token: string;
    companyName: string | null;
    jobCount: number;
  }>;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  ok: "text-emerald-400",
  warn: "text-amber-400",
  fail: "text-red-400",
  skipped: "text-zinc-500",
  timeout: "text-red-400",
  healthy: "text-emerald-400",
  degraded: "text-amber-400",
  unhealthy: "text-red-400",
};

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  ok: CheckCircle2,
  healthy: CheckCircle2,
  warn: AlertCircle,
  degraded: AlertCircle,
  fail: XCircle,
  unhealthy: XCircle,
};

const VERDICT_COLORS = ["#22c55e", "#eab308", "#ef4444", "#6366f1", "#8b5cf6"];

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Section: Pipeline Health
// ---------------------------------------------------------------------------

function PipelineHealthCard() {
  const [health, setHealth] = useState<PipelineHealth | null>(null);
  const [loading, setLoading] = useState(false);

  const runCheck = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiPost<PipelineHealth>("/api/pipeline/health", {});
      setHealth(res);
    } catch {
      /* noop */
    }
    setLoading(false);
  }, []);

  const OverallIcon = health ? (STATUS_ICONS[health.overall] ?? AlertCircle) : Activity;

  return (
    <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Sprout className="size-5 text-emerald-400" />
          <div>
            <CardTitle className="text-base">Pipeline Health</CardTitle>
            <CardDescription>Greenhouse-specific diagnostic checks</CardDescription>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={runCheck}
          disabled={loading}
          className="gap-1.5"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          {loading ? "Running…" : "Run Check"}
        </Button>
      </CardHeader>

      {health && (
        <CardContent className="space-y-3">
          {/* Overall badge */}
          <div className="flex items-center gap-2">
            <OverallIcon className={`size-5 ${STATUS_COLORS[health.overall]}`} />
            <span className={`text-sm font-semibold capitalize ${STATUS_COLORS[health.overall]}`}>
              {health.overall}
            </span>
            <span className="text-xs text-muted-foreground">
              {health.results.length} checks · {health.durationMs}ms
            </span>
          </div>

          {/* Per-check results */}
          <div className="grid gap-1.5">
            {health.results.map((r) => {
              const Icon = STATUS_ICONS[r.status] ?? AlertCircle;
              return (
                <div
                  key={r.name}
                  className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/30 px-3 py-1.5 text-sm"
                >
                  <Icon className={`size-3.5 ${STATUS_COLORS[r.status]}`} />
                  <span className="flex-1 font-mono text-xs">{r.name}</span>
                  <span className="text-xs text-muted-foreground">{r.durationMs}ms</span>
                  <Badge
                    variant={r.status === "ok" ? "default" : "destructive"}
                    className="px-1.5 py-0 text-[10px]"
                  >
                    {r.status}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      )}

      {!health && !loading && (
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Click <strong>Run Check</strong> to execute 9 greenhouse-specific diagnostic checks and
            see results here.
          </p>
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Pipeline Status
// ---------------------------------------------------------------------------

function PipelineStatusCard({ stats }: { stats: PipelineStats | null }) {
  if (!stats) return null;

  return (
    <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Clock className="size-5 text-blue-400" />
          <CardTitle className="text-base">Pipeline Status</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Last scrape */}
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Last Scrape
            </p>
            <p className="text-lg font-semibold">
              {stats.lastScrape ? formatRelative(stats.lastScrape.timestamp) : "Never"}
            </p>
            {stats.lastScrape && (
              <p className="text-xs text-muted-foreground">
                {stats.lastScrape.totalScraped} jobs · {stats.lastScrape.totalTriaged} triaged ·{" "}
                {stats.lastScrape.totalFailed} failed
              </p>
            )}
          </div>

          {/* Next run */}
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Next Scheduled
            </p>
            <p className="text-lg font-semibold">
              {stats.nextScheduledRun ? formatRelative(stats.nextScheduledRun) : "—"}
            </p>
            <p className="text-xs text-muted-foreground font-mono">Cron: {stats.cronSchedule}</p>
          </div>

          {/* Companies */}
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Companies Tracked
            </p>
            <p className="text-lg font-semibold">
              {stats.activeCompanies}{" "}
              <span className="text-sm text-muted-foreground font-normal">
                / {stats.totalCompanies}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">{stats.activeCompanies} active boards</p>
          </div>

          {/* Totals */}
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              All-Time Pipeline
            </p>
            <p className="text-lg font-semibold">{stats.totalJobsScraped.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              {stats.totalJobsTriaged.toLocaleString()} triaged ·{" "}
              {stats.totalJobsAnalyzed.toLocaleString()} analyzed
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Session History Chart
// ---------------------------------------------------------------------------

function SessionHistoryChart({ stats }: { stats: PipelineStats | null }) {
  if (!stats?.sessionHistory.length) return null;

  const data = stats.sessionHistory.map((s) => ({
    date: formatDate(s.timestamp),
    scraped: s.totalScraped,
    triaged: s.totalTriaged,
    analyzed: s.totalAnalyzed,
    failed: s.totalFailed,
  }));

  return (
    <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-5 text-purple-400" />
          <div>
            <CardTitle className="text-base">Pipeline Session History</CardTitle>
            <CardDescription>Jobs scraped, triaged, and analyzed over time</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
              />
              <Line
                type="monotone"
                dataKey="scraped"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
                name="Scraped"
              />
              <Line
                type="monotone"
                dataKey="triaged"
                stroke="#eab308"
                strokeWidth={2}
                dot={false}
                name="Triaged"
              />
              <Line
                type="monotone"
                dataKey="analyzed"
                stroke="#6366f1"
                strokeWidth={2}
                dot={false}
                name="Analyzed"
              />
              <Line
                type="monotone"
                dataKey="failed"
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                name="Failed"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section: Snapshot Insights
// ---------------------------------------------------------------------------

function SnapshotInsightsSection({ insights }: { insights: SnapshotInsights | null }) {
  if (!insights) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Verdict Distribution */}
      <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Verdict Distribution</CardTitle>
          <CardDescription>
            AI assessment breakdown across {insights.totalSnapshots} snapshots
          </CardDescription>
        </CardHeader>
        <CardContent>
          {insights.verdictDistribution.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={insights.verdictDistribution}
                    dataKey="count"
                    nameKey="verdict"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={3}
                    label={({ name, value }: { name?: string; value?: number }) =>
                      `${name ?? ""}: ${value ?? 0}`
                    }
                  >
                    {insights.verdictDistribution.map((_, i) => (
                      <Cell key={i} fill={VERDICT_COLORS[i % VERDICT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No verdict data available yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Salary by Verdict */}
      <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Average Salary by Verdict</CardTitle>
          <CardDescription>Salary ranges across role assessment tiers</CardDescription>
        </CardHeader>
        <CardContent>
          {insights.avgSalary.byVerdict.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={insights.avgSalary.byVerdict}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis
                    dataKey="verdict"
                    tick={{
                      fontSize: 10,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                  />
                  <YAxis
                    tick={{
                      fontSize: 10,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    formatter={(value: unknown) => `$${Number(value ?? 0).toLocaleString()}`}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="avgMin" fill="#6366f1" name="Avg Min" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avgMax" fill="#22c55e" name="Avg Max" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No salary data available yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Company Coverage */}
      <Card className="border-border/60 bg-card/50 backdrop-blur-sm lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Company Coverage</CardTitle>
          <CardDescription>
            Jobs discovered per company across {insights.totalPostings} postings
          </CardDescription>
        </CardHeader>
        <CardContent>
          {insights.companyCoverage.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={insights.companyCoverage.sort((a, b) => b.jobCount - a.jobCount)}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis
                    type="number"
                    tick={{
                      fontSize: 10,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                  />
                  <YAxis
                    dataKey="companyName"
                    type="category"
                    width={120}
                    tick={{
                      fontSize: 10,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="jobCount" fill="#8b5cf6" name="Jobs" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No postings data available yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section: Board Token Config Table
// ---------------------------------------------------------------------------

function BoardConfigTable({ tokens }: { tokens: BoardToken[] }) {
  return (
    <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <Settings className="size-5 text-zinc-400" />
          <div>
            <CardTitle className="text-base">Pipeline Configuration</CardTitle>
            <CardDescription>Companies currently in the scanner pipeline</CardDescription>
          </div>
        </div>
        <a
          href="/config?tab=pipeline"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-8 px-3 gap-1.5"
        >
          <Settings className="size-3.5" />
          Edit Configuration
          <ArrowRight className="size-3" />
        </a>
      </CardHeader>
      <CardContent>
        {tokens.length > 0 ? (
          <div className="rounded-md border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs">Company</TableHead>
                  <TableHead className="text-xs">Board Token</TableHead>
                  <TableHead className="text-xs">Email Domain</TableHead>
                  <TableHead className="text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((t) => (
                  <TableRow key={t.id} className="text-sm">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="size-3.5 text-muted-foreground" />
                        <span>{t.companyName ?? t.token}</span>
                        {t.companyUrl && (
                          <a
                            href={t.companyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {t.token}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t.emailDomain ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={t.isActive ? "default" : "secondary"} className="text-[10px]">
                        {t.isActive ? "Active" : "Paused"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No board tokens configured yet. Add companies via{" "}
            <a href="/config?tab=pipeline" className="text-primary underline">
              Config → Pipeline
            </a>
            .
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Root Component
// ---------------------------------------------------------------------------

export function PipelineBTrackerDocs() {
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [tokens, setTokens] = useState<BoardToken[]>([]);
  const [insights, setInsights] = useState<SnapshotInsights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [statsRes, tokensRes, insightsRes] = await Promise.allSettled([
          apiGet<PipelineStats>("/api/pipeline/stats"),
          apiGet<{ tokens: BoardToken[] }>("/api/pipeline/board-tokens"),
          apiGet<SnapshotInsights>("/api/pipeline/insights"),
        ]);

        if (statsRes.status === "fulfilled") setStats(statsRes.value);
        if (tokensRes.status === "fulfilled") setTokens(tokensRes.value.tokens);
        if (insightsRes.status === "fulfilled") setInsights(insightsRes.value);
      } catch {
        /* noop */
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading pipeline data…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top row: Health + Status */}
      <div className="grid gap-4 lg:grid-cols-2">
        <PipelineHealthCard />
        <PipelineStatusCard stats={stats} />
      </div>

      {/* Session History */}
      <SessionHistoryChart stats={stats} />

      {/* Snapshot Insights */}
      <SnapshotInsightsSection insights={insights} />

      {/* Board Configuration */}
      <BoardConfigTable tokens={tokens} />
    </div>
  );
}
