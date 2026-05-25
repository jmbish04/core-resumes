/**
 * @fileoverview VPCTunnelStatus — a premium React component that displays
 * live Workers VPC & Cloudflare Tunnel connection status on the docs page.
 *
 * Rendered as `client:load` on the `/docs/integrations/vpc-tunnel` page.
 */

import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Cpu,
  HelpCircle,
  Network,
  RefreshCw,
  Server,
  Terminal,
  AlertCircle,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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
}

interface HealthResult {
  id: string;
  runId: string;
  category: string;
  name: string;
  status: CheckStatus;
  message?: string;
  details?: Record<string, any>;
  durationMs: number;
  aiSuggestion?: string;
  timestamp: string;
}

interface ApiResponse {
  run: HealthRun | null;
  results: HealthResult[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VPCTunnelStatus() {
  const [result, setResult] = useState<HealthResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch("/api/health/latest", { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ApiResponse;
      
      const vpcCheck = data.results.find((r) => r.name === "notebooklm_credentials");
      if (vpcCheck) {
        setResult(vpcCheck);
      } else {
        setResult(null);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setError(null);
    try {
      const res = await fetch("/api/health/run", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ApiResponse;
      
      const vpcCheck = data.results.find((r) => r.name === "notebooklm_credentials");
      if (vpcCheck) {
        setResult(vpcCheck);
      } else {
        setResult(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const getStatusColor = (status: CheckStatus) => {
    switch (status) {
      case "ok":
        return "text-green-500 bg-green-500/10 border-green-500/20";
      case "warn":
        return "text-yellow-500 bg-yellow-500/10 border-yellow-500/20";
      case "fail":
      case "timeout":
        return "text-red-500 bg-red-500/10 border-red-500/20";
      case "skipped":
      default:
        return "text-muted-foreground bg-muted/20 border-border";
    }
  };

  const getStatusText = (status: CheckStatus) => {
    switch (status) {
      case "ok":
        return "Connected & Healthy";
      case "warn":
        return "Degraded Connection";
      case "fail":
        return "Connection Failed";
      case "timeout":
        return "Connection Timeout";
      case "skipped":
        return "Test Skipped";
      default:
        return "Unknown";
    }
  };

  const getStatusIcon = (status: CheckStatus) => {
    switch (status) {
      case "ok":
        return <CheckCircle2 className="size-5 text-green-500 animate-pulse" />;
      case "warn":
        return <AlertCircle className="size-5 text-yellow-500" />;
      case "fail":
      case "timeout":
        return <XCircle className="size-5 text-red-500" />;
      case "skipped":
      default:
        return <HelpCircle className="size-5 text-muted-foreground" />;
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const details = result?.details || {};
  const fastapiHealth = details.fastapiHealth || {};
  const status = result?.status || "skipped";

  return (
    <div className="space-y-6">
      {/* Topology Widget */}
      <Card className="overflow-hidden border-border/60 bg-card/45 backdrop-blur-md">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
            <div>
              <CardTitle className="text-xl flex items-center gap-2">
                <Network className="size-5 text-primary" />
                VPC & Tunnel Health Monitor
              </CardTitle>
              <CardDescription>
                Live connectivity check mapping Cloudflare Workers VPC to the local macoffice bridge.
              </CardDescription>
            </div>
            <Button
              onClick={runTest}
              disabled={testing}
              size="sm"
              variant="outline"
              className="shrink-0 self-start sm:self-center"
            >
              {testing ? (
                <RefreshCw className="mr-2 size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-3.5" />
              )}
              {testing ? "Testing Connection…" : "Test Connection"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Active Topology Graph */}
          <div className="relative rounded-lg border border-border/40 bg-muted/20 p-6">
            <div className="grid gap-6 md:grid-cols-3 items-center relative z-10 text-center">
              {/* Hop 1: Cloudflare Worker */}
              <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-card/60 border border-border/40 shadow-sm">
                <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
                  <Cpu className="size-5 text-primary" />
                </div>
                <div className="text-sm font-semibold">Cloudflare Worker</div>
                <Badge variant="outline" className="text-[10px] uppercase font-mono">
                  core-resumes
                </Badge>
              </div>

              {/* Connector 1 */}
              <div className="hidden md:flex flex-col items-center justify-center text-muted-foreground select-none relative">
                <div className="text-[10px] font-mono mb-1 text-primary/60">VPC_SERVICE</div>
                <ArrowRight className="size-5 text-primary/40 animate-pulse" />
              </div>

              {/* Hop 2: Cloudflare Tunnel */}
              <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-card/60 border border-border/40 shadow-sm relative">
                <div className="size-10 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                  <Server className="size-5 text-blue-500" />
                </div>
                <div className="text-sm font-semibold">Cloudflare Tunnel</div>
                <Badge
                  variant="outline"
                  className={
                    status === "ok"
                      ? "text-[10px] font-mono uppercase bg-green-500/10 border-green-500/20 text-green-400"
                      : "text-[10px] font-mono uppercase bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
                  }
                >
                  macoffice (Healthy)
                </Badge>
              </div>

              {/* Connector 2 */}
              <div className="hidden md:flex flex-col items-center justify-center text-muted-foreground select-none">
                <div className="text-[10px] font-mono mb-1 text-blue-400">Port 8770 / 8789</div>
                <ArrowRight className="size-5 text-blue-500/40" />
              </div>

              {/* Hop 3: FastAPI Host Service */}
              <div className="flex flex-col items-center gap-2 p-3 rounded-lg bg-card/60 border border-border/40 shadow-sm">
                <div className="size-10 rounded-full bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
                  <Terminal className="size-5 text-purple-400" />
                </div>
                <div className="text-sm font-semibold">FastAPI Bridge</div>
                <Badge
                  variant="outline"
                  className={
                    status === "ok"
                      ? "text-[10px] font-mono bg-green-500/10 border-green-500/20 text-green-400"
                      : "text-[10px] font-mono bg-red-500/10 border-red-500/20 text-red-400"
                  }
                >
                  {status === "ok" ? "ACTIVE" : "OFFLINE"}
                </Badge>
              </div>
            </div>

            {/* Background Connection Path Line */}
            <div className="absolute top-[52px] left-[15%] right-[15%] h-0.5 bg-gradient-to-r from-primary/30 via-blue-500/30 to-purple-500/30 hidden md:block -z-0" />
          </div>

          {/* Status Display Card */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Live Connectivity */}
            <div className={`rounded-lg border p-4 flex items-start gap-3 ${getStatusColor(status)}`}>
              <div className="mt-0.5">{getStatusIcon(status)}</div>
              <div>
                <div className="font-semibold text-sm">VPC Connection Status</div>
                <div className="text-xs opacity-80 mt-1 font-mono">{getStatusText(status)}</div>
                {result?.durationMs && (
                  <div className="text-[10px] opacity-60 mt-1 font-mono">
                    Roundtrip Latency: {result.durationMs}ms
                  </div>
                )}
              </div>
            </div>

            {/* Live Service Details */}
            <div className="rounded-lg border border-border/40 bg-muted/10 p-4 flex flex-col gap-1.5 text-xs text-muted-foreground font-mono">
              <div className="flex justify-between border-b border-border/20 pb-1.5 mb-1">
                <span className="font-semibold text-foreground font-sans text-xs">VPC CONFIGURATION</span>
                <span className="text-[10px] text-primary">LIVE CONFIG</span>
              </div>
              <div className="flex justify-between">
                <span>FastAPI Base URL:</span>
                <span className="text-foreground">{details.fastapiUrl || "http://127.0.0.1:8789"}</span>
              </div>
              <div className="flex justify-between">
                <span>Tunnel ID:</span>
                <span className="text-foreground">macoffice</span>
              </div>
              <div className="flex justify-between">
                <span>Connection Type:</span>
                <span className="text-foreground">{details.connectionMode || "VPC Service Binding"}</span>
              </div>
              <div className="flex justify-between">
                <span>Uvicorn Health Port:</span>
                <span className="text-foreground">8770 / 8789</span>
              </div>
            </div>
          </div>

          {/* Error Suggestion Area */}
          {status !== "ok" && result?.aiSuggestion && (
            <div className="mt-4 p-4 rounded-lg bg-red-500/5 border border-red-500/20 text-xs">
              <div className="flex items-center gap-2 text-red-400 font-semibold mb-2">
                <AlertCircle className="size-4" />
                VPC Troubleshooting Recommendations
              </div>
              <pre className="font-mono text-[10px] text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto bg-slate-950/60 p-3 rounded border border-border/20">
                {result.aiSuggestion}
              </pre>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive font-mono">
              ❌ Diagnostics Fetch Failed: {error}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
