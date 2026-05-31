"use client";

import {
  DollarSignIcon,
  RefreshCcwIcon,
  Loader2Icon,
  ChevronDownIcon,
  TrendingUpIcon,
  AlertTriangleIcon,
  Building as BuildingIcon,
  GlobeIcon,
  WifiIcon,
  UsersIcon,
  BarChart3Icon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  LabelList,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltipContent } from "@/components/ui/chart";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { apiGet, apiPost, toast } from "@/lib/api-client";

import { ScoreRadialChart } from "./ScoreRadialChart";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RoleInsight {
  id: string;
  roleId: string;
  version: number;
  type: string;
  score: number;
  rationale: string;
  analysisPayload: {
    advertisedMin?: number | null;
    advertisedMax?: number | null;
    currency?: string;
    googleBaseline?: Record<string, unknown>;
    negotiationTarget?: number | null;
    negotiationRationale?: string | null;
    deltaVsGoogle?: number | null;
    futurePromotionPath?: number | null;
    geographicPositioning?: string | null;
    remoteDiscountAnalysis?: string | null;
    industryPeerComparison?: string | null;
    marketTrendContext?: string | null;
  } | null;
  configSnapshot: {
    compensationBaseline?: Record<string, unknown>;
    advertisedAssessment?: string | null;
    [key: string]: unknown;
  } | null;
  createdAt: string;
}

interface MarketData {
  jobTitle: string;
  companyName: string | null;
  matchingRoleType: string;
  stats: Array<{
    id: number;
    metricKey: string;
    metricLabel: string;
    p25: number;
    median: number;
    p75: number;
    sampleSize: number;
  }>;
  companySalaries: Array<{
    id: number;
    companyName: string;
    jobTitle: string;
    seniority: string;
    p25: number;
    median: number;
    p75: number;
    sampleSize: number;
  }>;
  profile: {
    location: string;
    locations: string[];
    hubs: string[];
    target_roles: string[];
  };
}

// ---------------------------------------------------------------------------
// Score & formatting helpers
// ---------------------------------------------------------------------------

function getScoreColor(score: number): string {
  if (score >= 75) return "hsl(142, 71%, 45%)";
  if (score >= 40) return "hsl(38, 92%, 50%)";
  return "hsl(0, 84%, 60%)";
}

function getScoreLabel(score: number): string {
  if (score >= 75) return "Strong";
  if (score >= 40) return "Moderate";
  return "Low";
}

function formatShortCurrency(amount: number | null | undefined, currency = "USD"): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
    notation: "compact",
    compactDisplay: "short",
  }).format(amount);
}

/**
 * Small inline notice for when a data point couldn't be computed by the AI.
 */
function DataUnavailable({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-amber-500/80">
      <AlertTriangleIcon className="h-3 w-3 flex-shrink-0" />
      <span>{label} — not available</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CompensationAnalysis
// ---------------------------------------------------------------------------

export function CompensationAnalysis({ roleId }: { roleId: string }) {
  const [insight, setInsight] = useState<RoleInsight | null>(null);
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [isOpen, setIsOpen] = useState(true);

  const load = useCallback(async () => {
    try {
      const [data, mData] = await Promise.all([
        apiGet<RoleInsight>(`/api/roles/${roleId}/insights?type=compensation`),
        apiGet<MarketData>(`/api/roles/${roleId}/insights/market-compensation`)
      ]);
      setInsight(data);
      setMarketData(mData);
    } catch {
      try {
        const mData = await apiGet<MarketData>(`/api/roles/${roleId}/insights/market-compensation`);
        setMarketData(mData);
      } catch {
        setMarketData(null);
      }
      setInsight(null);
    } finally {
      setLoading(false);
    }
  }, [roleId]);


  useEffect(() => {
    void load();
  }, [load]);

  async function analyze() {
    setAnalyzing(true);
    try {
      await apiPost(`/api/roles/${roleId}/insights`, { types: ["compensation"] });
      toast({ title: "Compensation analysis complete" });
      await load();
    } catch {
      toast({ title: "Analysis failed", variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  }

  if (loading) {
    return (
      <Card className="flex items-center justify-center rounded-lg p-8">
        <Loader2Icon className="h-5 w-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  if (!insight) {
    return (
      <Card className="rounded-lg">
        <CardContent className="flex flex-col items-center gap-3 py-8">
          <DollarSignIcon className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No compensation analysis yet.</p>
          <Button size="sm" disabled={analyzing} onClick={() => void analyze()}>
            {analyzing ? (
              <>
                <Loader2Icon className="mr-1 h-3 w-3 animate-spin" /> Analyzing…
              </>
            ) : (
              "Analyze Compensation"
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const color = getScoreColor(insight.score);
  const payload = insight.analysisPayload;
  const currency = payload?.currency ?? "USD";

  const delta = payload?.deltaVsGoogle;
  const deltaColor =
    delta != null ? (delta >= 0 ? "text-green-500" : "text-red-500") : "text-muted-foreground";

  // Detect which fields are missing for user visibility
  const missingFields: string[] = [];
  if (payload?.negotiationTarget == null) missingFields.push("Negotiation target");
  if (!payload?.negotiationRationale) missingFields.push("Negotiation rationale");
  if (payload?.deltaVsGoogle == null) missingFields.push("Delta vs Google");
  if (!insight.configSnapshot?.advertisedAssessment) missingFields.push("Advertised assessment");
  if (payload?.futurePromotionPath == null) missingFields.push("Future promotion path");

  return (
    <Card className="flex flex-col">
      <div className="flex flex-col md:flex-row items-start p-6 gap-6">
        <div className="flex-1 w-full md:w-auto self-center">
          <ScoreRadialChart
            score={insight.score}
            label={getScoreLabel(insight.score)}
            color={color}
          />
        </div>

        <div className="flex-[2] flex flex-col gap-4 w-full">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <DollarSignIcon className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-xl">Compensation Analysis</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                v{insight.version}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={analyzing}
                onClick={() => void analyze()}
              >
                {analyzing ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCcwIcon className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Missing data banner */}
          {missingFields.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
              <AlertTriangleIcon className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-500/90">
                <span className="font-medium">Partial data:</span> {missingFields.join(", ")} could
                not be computed.
                <span className="text-muted-foreground ml-1">Try re-analyzing to fill gaps.</span>
              </div>
            </div>
          )}

          {/* Salary range badges */}
          <div className="flex flex-wrap gap-3 items-center">
            <Badge variant="outline" className="text-lg py-1 px-4 font-semibold">
              {formatShortCurrency(payload?.advertisedMin, currency)} –{" "}
              {formatShortCurrency(payload?.advertisedMax, currency)}
            </Badge>
            {payload?.negotiationTarget != null ? (
              <Badge variant="secondary" className="text-sm font-mono py-1.5 px-3">
                Target: {formatShortCurrency(payload.negotiationTarget, currency)}
              </Badge>
            ) : (
              <DataUnavailable label="Negotiation target" />
            )}
            {delta != null ? (
              <div
                className={`flex items-center gap-1 text-sm font-mono font-semibold ${deltaColor}`}
              >
                <span className="text-xs text-muted-foreground font-sans font-normal">
                  vs Google TC:
                </span>
                {delta >= 0 ? "+" : ""}
                {formatShortCurrency(delta, currency)}
              </div>
            ) : (
              <DataUnavailable label="Delta vs Google" />
            )}
          </div>

          {/* Comparison Line Chart */}
          {payload &&
            (() => {
              const chartData = [
                {
                  name: "Google TC",
                  value: 260672,
                  fill: "hsl(var(--chart-1))",
                },
                payload.advertisedMax != null
                  ? {
                      name: "Advertised Max",
                      value: payload.advertisedMax,
                      fill: "hsl(var(--chart-2))",
                    }
                  : null,
                payload.negotiationTarget != null
                  ? {
                      name: "Target",
                      value: payload.negotiationTarget,
                      fill: "hsl(var(--chart-3))",
                    }
                  : null,
                payload.futurePromotionPath != null
                  ? {
                      name: "Future Path (+2yr)",
                      value: payload.futurePromotionPath,
                      fill: "hsl(var(--chart-4))",
                    }
                  : null,
              ].filter((d): d is NonNullable<typeof d> => d != null && d.value > 0);

              // Need at least 2 data points for a meaningful line chart
              if (chartData.length < 2) {
                return (
                  <div className="mt-4 border rounded-md p-4 bg-muted/10 w-full">
                    <h4 className="text-sm font-semibold mb-2 text-muted-foreground">
                      Compensation Comparison
                    </h4>
                    <div className="flex items-center gap-2 py-6 justify-center text-sm text-muted-foreground/60">
                      <AlertTriangleIcon className="h-4 w-4" />
                      <span>
                        Insufficient data points for chart — salary data may not have been
                        disclosed.
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <div className="mt-4 border rounded-md p-4 bg-muted/10 w-full">
                  <h4 className="text-sm font-semibold mb-3 text-muted-foreground">
                    Compensation Comparison
                  </h4>
                  <div className="h-[220px] w-full">
                    <ChartContainer config={{}} className="h-full w-full">
                      <LineChart
                        data={chartData}
                        margin={{ top: 20, right: 20, left: 20, bottom: 20 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                          tickMargin={12}
                        />
                        <YAxis type="number" hide domain={[0, "dataMax + 40000"]} />
                        <RechartsTooltip
                          cursor={{
                            stroke: "hsl(var(--muted-foreground))",
                            strokeWidth: 1,
                            strokeDasharray: "3 3",
                          }}
                          content={
                            <ChartTooltipContent
                              formatter={(value: any) =>
                                formatShortCurrency(Number(value), currency)
                              }
                            />
                          }
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="hsl(var(--primary))"
                          strokeWidth={3}
                          dot={{ r: 6, fill: "hsl(var(--background))", strokeWidth: 2 }}
                          activeDot={{ r: 8 }}
                        >
                          <LabelList
                            dataKey="value"
                            position="top"
                            formatter={(val: any) => formatShortCurrency(Number(val), currency)}
                            fill="hsl(var(--foreground))"
                            fontSize={12}
                            offset={10}
                          />
                        </Line>
                      </LineChart>
                    </ChartContainer>
                  </div>
                </div>
              );
            })()}

          {/* Negotiation strategy */}
          {payload?.negotiationRationale ? (
            <div className="mt-2 rounded-md border border-border/60 bg-muted/20 px-4 py-3">
              <p className="text-sm font-medium text-foreground mb-1">Negotiation Strategy</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {payload.negotiationRationale}
              </p>
            </div>
          ) : (
            <div className="mt-2 rounded-md border border-border/40 bg-muted/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <AlertTriangleIcon className="h-3.5 w-3.5 text-amber-500/70" />
                <p className="text-sm text-muted-foreground/60">
                  Negotiation strategy unavailable — salary data may not have been disclosed.
                  Re-analyze to attempt computation.
                </p>
              </div>
            </div>
          )}

          {/* Live Market Benchmarks Scorecard */}
          {marketData && marketData.stats.length > 0 && (
            <div className="mt-4 border rounded-md p-4 bg-muted/10 w-full space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                  <TrendingUpIcon className="size-4 text-emerald-400" />
                  Live Market Percentiles &amp; Scorecards
                </h4>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Comparing this role's advertised midpoint or target against aggregated market statistics (matching role type: '{marketData.matchingRoleType}').
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {marketData.stats.map((stat) => {
                  const midpoint = payload?.advertisedMin && payload?.advertisedMax
                    ? Math.round((payload.advertisedMin + payload.advertisedMax) / 2)
                    : (payload?.negotiationTarget || 150000);
                  
                  const diffPercent = ((midpoint - stat.median) / stat.median) * 100;
                  const diffText = diffPercent >= 0 
                    ? `+${diffPercent.toFixed(1)}% above median` 
                    : `${diffPercent.toFixed(1)}% below median`;
                  const diffColor = diffPercent >= 0 ? "text-green-500 font-semibold" : "text-amber-500 font-semibold";

                  return (
                    <div key={stat.id} className="rounded-lg border border-border/50 bg-background/50 p-3 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground/80">
                          {stat.metricLabel}
                        </span>
                        <div className="text-lg font-mono font-bold text-foreground mt-1">
                          {formatShortCurrency(stat.median, currency)}
                          <span className="text-[10px] text-muted-foreground font-normal ml-1.5 font-sans">
                            (median)
                          </span>
                        </div>
                      </div>
                      <div className="mt-2 pt-1 border-t border-border/20 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground/60">Rating vs Role:</span>
                        <span className={`font-semibold ${diffColor}`}>{diffText}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Expected remote discount assessment */}
              {(() => {
                const local = marketData.stats.find(s => s.metricKey === "local_market");
                const remote = marketData.stats.find(s => s.metricKey === "remote");
                if (local && remote && local.median > remote.median) {
                  const loss = ((local.median - remote.median) / local.median) * 100;
                  return (
                    <div className="rounded-md border border-sky-500/20 bg-sky-500/5 px-3.5 py-2.5 text-xs text-sky-300">
                      <span className="font-semibold block mb-0.5">💡 Remote Discount Assessment:</span>
                      Market statistics suggest remote roles carry a <strong className="text-sky-200">{loss.toFixed(1)}% discount</strong> compared to local {marketData.profile?.location || "SF"} equivalents. Consider this differential if negotiating workplace flexibility vs compensation.
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {/* Company Certified H1B Salaries */}
          {marketData && marketData.companySalaries.length > 0 && (
            <div className="mt-4 border rounded-md p-4 bg-muted/10 w-full space-y-3">
              <div>
                <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                  <BuildingIcon className="size-4 text-emerald-400" />
                  {marketData.companyName || "Company"} H1B Certified Salaries
                </h4>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Certified base salaries filed by this employer with the Department of Labor for engineering hires.
                </p>
              </div>

              <div className="rounded-md border border-border/50 overflow-hidden text-xs">
                <div className="grid grid-cols-[2fr_1.2fr_1.5fr] bg-muted/50 font-medium px-3 py-2 border-b border-border/50 text-muted-foreground">
                  <span>Job Title / Seniority</span>
                  <span>Sample Size</span>
                  <span className="text-right">Median Base Salary</span>
                </div>
                <div className="divide-y divide-border/30">
                  {marketData.companySalaries.slice(0, 4).map((sal) => (
                    <div key={sal.id} className="grid grid-cols-[2fr_1.2fr_1.5fr] px-3 py-2 bg-background/30 capitalize hover:bg-muted/10 transition-colors">
                      <span className="font-medium truncate pr-2">
                        {sal.jobTitle}
                        <span className="text-[10px] text-muted-foreground block lowercase mt-0.5 font-normal">
                          {sal.seniority} seniority
                        </span>
                      </span>
                      <span className="text-muted-foreground self-center">
                        {sal.sampleSize} files
                      </span>
                      <span className="font-mono font-bold text-emerald-400 text-right self-center">
                        {formatShortCurrency(sal.median, currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Enriched Analysis Dimensions ── */}
          {payload?.geographicPositioning && (
            <div className="mt-4 border rounded-md p-4 bg-muted/10 w-full space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                <GlobeIcon className="size-4 text-blue-400" />
                Geographic Positioning
              </h4>
              <div className="prose prose-sm dark:prose-invert max-w-none text-left">
                <ReactMarkdown>{payload.geographicPositioning}</ReactMarkdown>
              </div>
            </div>
          )}

          {payload?.remoteDiscountAnalysis && (
            <div className="mt-3 border rounded-md p-4 bg-muted/10 w-full space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                <WifiIcon className="size-4 text-violet-400" />
                Remote vs Local Discount
              </h4>
              <div className="prose prose-sm dark:prose-invert max-w-none text-left">
                <ReactMarkdown>{payload.remoteDiscountAnalysis}</ReactMarkdown>
              </div>
            </div>
          )}

          {payload?.industryPeerComparison && (
            <div className="mt-3 border rounded-md p-4 bg-muted/10 w-full space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                <UsersIcon className="size-4 text-amber-400" />
                Industry Peer Comparison
              </h4>
              <div className="prose prose-sm dark:prose-invert max-w-none text-left">
                <ReactMarkdown>{payload.industryPeerComparison}</ReactMarkdown>
              </div>
            </div>
          )}

          {payload?.marketTrendContext && (
            <div className="mt-3 border rounded-md p-4 bg-muted/10 w-full space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
                <BarChart3Icon className="size-4 text-cyan-400" />
                Market Trend Context
              </h4>
              <div className="prose prose-sm dark:prose-invert max-w-none text-left">
                <ReactMarkdown>{payload.marketTrendContext}</ReactMarkdown>
              </div>
            </div>
          )}

        </div>
      </div>

      <CardFooter className="flex-col items-start gap-2 text-sm mt-auto bg-muted/20 border-t border-border/40 p-4 w-full">
        <Collapsible className="w-full" open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between font-medium leading-none hover:underline">
            <div className="flex items-center gap-2">
              AI Insight <TrendingUpIcon className="h-4 w-4 text-green-500" />
            </div>
            <ChevronDownIcon
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <div className="prose prose-sm dark:prose-invert max-w-none text-left">
              <ReactMarkdown>{insight.rationale}</ReactMarkdown>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardFooter>
    </Card>
  );
}
