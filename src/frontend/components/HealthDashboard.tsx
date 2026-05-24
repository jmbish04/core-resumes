/**
 * @fileoverview HealthDashboard — full-featured system diagnostics page.
 *
 * ## Features
 *
 * - **On load:** fetches `GET /api/health/latest` and displays the most recent
 *   diagnostic run with relative age indicator.
 * - **Run Diagnostics:** clears results, shows Skeleton placeholders, calls
 *   `POST /api/health/run`, animates in fresh results.
 * - **Background completion:** Synchronizes with `HealthBadge` via `localStorage`.
 * - **Copy to clipboard:** Wraps all health data in a comprehensive AI-agent
 *   prompt and copies to clipboard.
 * - **Check cards:** Dynamically renders results from the `HealthCoordinator`.
 */

import {
  Activity,
  Check,
  Copy,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Database,
  Key,
  Variable,
  Cpu,
  Router,
  HardDrive,
  HelpCircle,
  Sprout,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "@/lib/api-client";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "./ui/card";
import { Skeleton } from "./ui/skeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CheckStatus = "ok" | "warn" | "fail" | "skipped" | "timeout";
type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

interface HealthRun {
  id: string;
  status: HealthStatus;
  trigger: string;
  durationMs: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

interface HealthResult {
  id: string;
  runId: string;
  category: string;
  name: string;
  status: CheckStatus;
  message?: string;
  details?: Record<string, unknown>;
  durationMs: number;
  aiSuggestion?: string;
  timestamp: string;
}

interface ApiResponse {
  run: HealthRun | null;
  results: HealthResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAge(isoString: string): string {
  const then = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  let relative: string;
  if (diffMin < 1) relative = "just now";
  else if (diffMin === 1) relative = "1 minute ago";
  else if (diffMin < 60) relative = `${diffMin} minutes ago`;
  else if (diffHrs === 1) relative = "1 hour ago";
  else if (diffHrs < 24) relative = `${diffHrs} hours ago`;
  else if (diffDays === 1) relative = "1 day ago";
  else relative = `${diffDays} days ago`;

  const pst = then.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });

  return `Showing results from ${relative} (${pst})`;
}

function buildAgentPrompt(run: HealthRun, results: HealthResult[], ageInfo?: string): string {
  return `# 🩺 Health Diagnostic Report — core-resumes Worker

## Instructions for Coding Agent

I ran a health diagnostic on my Cloudflare Worker application ("core-resumes") and the results are below. Please:
1. Review ALL failing modules and identify root causes
2. Provide specific fixes for each issue (file paths, code changes, wrangler.jsonc updates)
3. Prioritize critical failures (database, agents) over secondary ones
4. If secrets are missing, tell me the exact \`wrangler secret put\` or Secrets Store commands

${ageInfo ? `**Diagnostic Age:** ${ageInfo}\n` : ""}

## Full Diagnostic Results

\`\`\`json
${JSON.stringify({ run, results }, null, 2)}
\`\`\`

## Environment Context

- **Runtime:** Cloudflare Workers (Paid Plan)
- **Database:** D1 (SQLite) via Drizzle ORM
- **Config:** wrangler.jsonc
- **Schema:** src/backend/db/schemas/
- **Health Coordinator:** src/backend/health/coordinator.ts
- **Health Route:** src/backend/api/routes/health.ts

Please fix all issues found above.`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "ok":
    case "healthy":
      return <CheckCircle2 className="w-5 h-5 text-green-500" />;
    case "warn":
    case "degraded":
      return <AlertCircle className="w-5 h-5 text-yellow-500" />;
    case "fail":
    case "unhealthy":
    case "timeout":
      return <XCircle className="w-5 h-5 text-red-500" />;
    case "skipped":
      return <CheckCircle2 className="w-5 h-5 text-gray-400" />;
    default:
      return <Activity className="w-5 h-5 text-gray-500" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "ok":
    case "healthy":
      return <Badge className="bg-green-500 hover:bg-green-600">OK</Badge>;
    case "warn":
    case "degraded":
      return <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white">DEGRADED</Badge>;
    case "fail":
    case "unhealthy":
      return <Badge variant="destructive">FAIL</Badge>;
    case "timeout":
      return <Badge variant="destructive">TIMEOUT</Badge>;
    case "skipped":
      return <Badge variant="outline">SKIPPED</Badge>;
    default:
      return <Badge variant="outline">UNKNOWN</Badge>;
  }
}

function CheckCardSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="h-4 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  database: Database,
  providers: Key,
  binding: Variable,
  ai: Cpu,
  google: HardDrive,
  agents: Router,
  greenhouse: Sprout,
};

function CheckCard({ result }: { result: HealthResult }) {
  const Icon = CATEGORY_ICONS[result.category] || HelpCircle;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon className="w-4 h-4 text-muted-foreground" />
            {result.name}
          </CardTitle>
          <StatusBadge status={result.status} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Latency:</span>
            <span className="font-mono">{result.durationMs}ms</span>
          </div>
          {result.message && (
            <div
              className={`mt-2 p-2 rounded-md text-xs font-mono break-all ${
                result.status === "warn"
                  ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {result.message}
            </div>
          )}
          {result.aiSuggestion && (
            <div className="mt-2 p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md text-xs font-mono">
              💡 {result.aiSuggestion}
            </div>
          )}
          {result.details && Object.keys(result.details).length > 0 && (
            <div className="mt-2 p-2 bg-muted/50 rounded-md">
              {Object.entries(result.details).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs mb-1 last:mb-0">
                  <span className="text-muted-foreground">{k}:</span>
                  <span className="font-mono truncate max-w-[60%]">
                    {typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function HealthDashboard() {
  const [run, setRun] = useState<HealthRun | null>(null);
  const [results, setResults] = useState<HealthResult[]>([]);
  const [ageString, setAgeString] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch("/api/health/latest", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as ApiResponse;

      if (data.run) {
        setRun(data.run);
        setResults(data.results);
        setAgeString(formatAge(data.run.createdAt));
      } else {
        setRun(null);
        setResults([]);
        setAgeString("");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      toast({
        title: "Health Check Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (ageString) fetchLatest();
    }, 30_000);
    return () => clearInterval(interval);
  }, [ageString, fetchLatest]);

  useEffect(() => {
    function onFocus() {
      const complete = localStorage.getItem("health_screening_complete");
      if (complete) {
        localStorage.removeItem("health_screening_complete");
        fetchLatest();
      }
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchLatest]);

  const runDiagnostics = async () => {
    setIsRunning(true);
    setError(null);
    setCopied(false);
    setRun(null);
    setResults([]);
    setAgeString("");

    localStorage.setItem("health_screening_running", Date.now().toString());
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/health/run", {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = (await res.json()) as ApiResponse;

      setRun(data.run);
      setResults(data.results);
      setAgeString(formatAge(data.run!.createdAt));

      localStorage.removeItem("health_screening_running");
      localStorage.setItem(
        "health_screening_complete",
        JSON.stringify({
          status: data.run!.status,
          timestamp: Date.now(),
        }),
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        toast({
          title: "Diagnostics Failed",
          description: message,
          variant: "destructive",
        });
      }
    } finally {
      setIsRunning(false);
      localStorage.removeItem("health_screening_running");
    }
  };

  const handleCopy = async () => {
    if (!run) return;
    const prompt = buildAgentPrompt(run, results, ageString);
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast({
        title: "Copied to clipboard",
        description: "Health diagnostic results ready for your coding agent.",
      });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({
        title: "Copy failed",
        description: "Could not access clipboard.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="w-8 h-8 text-primary" />
            System Diagnostics
          </h1>
          <p className="text-muted-foreground mt-1">
            Comprehensive health screening across all backend services.
          </p>
        </div>
        <Button onClick={runDiagnostics} disabled={isRunning} size="lg" id="run-diagnostics-btn">
          {isRunning ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {isRunning ? "Screening…" : "Run Diagnostics"}
        </Button>
      </div>

      {ageString && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          {ageString}
        </div>
      )}

      {error && (
        <Card className="border-red-500 bg-red-50 dark:bg-red-950">
          <CardContent className="pt-6 text-red-700 dark:text-red-400 font-medium">
            Failed to fetch diagnostics: {error}
          </CardContent>
        </Card>
      )}

      {loading && !run && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="md:col-span-2">
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-64 mt-2" />
            </CardHeader>
          </Card>
          {Array.from({ length: 8 }).map((_, i) => (
            <CheckCardSkeleton key={i} />
          ))}
        </div>
      )}

      {isRunning && !run && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="md:col-span-2">
            <CardHeader className="flex flex-row items-center gap-3">
              <RefreshCw className="w-5 h-5 animate-spin text-primary" />
              <div>
                <CardTitle>Running health screening…</CardTitle>
                <CardDescription>
                  Checking 28 modules in parallel. This may take a few seconds.
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
          {Array.from({ length: 8 }).map((_, i) => (
            <CheckCardSkeleton key={i} />
          ))}
        </div>
      )}

      {!loading && !isRunning && !run && !error && (
        <Card className="md:col-span-2">
          <CardContent className="pt-6 text-center">
            <Activity className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No health runs recorded yet.</p>
            <Button onClick={runDiagnostics} className="mt-4" size="lg">
              <RefreshCw className="mr-2 h-4 w-4" />
              Run Your First Diagnostic
            </Button>
          </CardContent>
        </Card>
      )}

      {run && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="md:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle>Global Health Status</CardTitle>
                <CardDescription>
                  {run.durationMs > 0 &&
                    `Completed in ${run.durationMs}ms via ${run.trigger} trigger`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                <StatusIcon status={run.status} />
                <StatusBadge status={run.status} />
              </div>
            </CardHeader>
          </Card>

          {results.map((result) => (
            <CheckCard key={result.id} result={result} />
          ))}

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Verbose Trace</CardTitle>
              <CardDescription>Raw JSON payload ready for AI analysis.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-950 p-4 rounded-md overflow-x-auto max-h-96">
                <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
                  {JSON.stringify({ run, results }, null, 2)}
                </pre>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end bg-muted/50 pt-6">
              <Button
                variant={copied ? "default" : "secondary"}
                onClick={handleCopy}
                className={`transition-all ${copied ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}
                id="copy-health-results-btn"
              >
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copied to Clipboard!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Results for AI Agent
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}
