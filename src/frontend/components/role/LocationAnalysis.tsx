"use client";

import {
  MapPinIcon,
  RefreshCcwIcon,
  Loader2Icon,
  ChevronDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { apiGet, apiPost, toast } from "@/lib/api-client";

import { CommuteModal } from "./CommuteModal";
import { CommuteRouteMap } from "./CommuteRouteMap";
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
    location?: string;
    workplaceType?: string;
    rtoPolicy?: string;
    homeAddress?: string;
    commuteTable?: Array<{
      departureTime: string;
      mode: string;
      durationMinutes: number | null;
      monthlyCost: number | null;
    }>;
  } | null;
  configSnapshot: Record<string, unknown> | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Score color helpers
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

// ---------------------------------------------------------------------------
// LocationAnalysis
// ---------------------------------------------------------------------------

export function LocationAnalysis({ roleId }: { roleId: string }) {
  const [insight, setInsight] = useState<RoleInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<RoleInsight>(`/api/roles/${roleId}/insights?type=location`);
      setInsight(data);
    } catch {
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
      await apiPost(`/api/roles/${roleId}/insights`, { types: ["location"] });
      toast({ title: "Location analysis complete" });
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
          <MapPinIcon className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No location analysis yet.</p>
          <Button size="sm" disabled={analyzing} onClick={() => void analyze()}>
            {analyzing ? (
              <>
                <Loader2Icon className="mr-1 h-3 w-3 animate-spin" /> Analyzing…
              </>
            ) : (
              "Analyze Location"
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const color = getScoreColor(insight.score);
  const payload = insight.analysisPayload;

  return (
    <Card className="flex flex-col">
      <div className="p-6 w-full flex-col flex">
        {/* Map Hero */}
        <div className="w-full mb-8">
          <CommuteRouteMap roleId={roleId} />
        </div>

        <div className="flex flex-col md:flex-row items-start gap-6 w-full">
          {/* Left Column: Radial Chart & Metadata */}
          <div className="flex flex-col w-full md:w-64 gap-6 shrink-0 border rounded-xl p-4 bg-muted/10">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <MapPinIcon className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Location</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px]">
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

            <div className="flex justify-center">
              <ScoreRadialChart
                score={insight.score}
                label={getScoreLabel(insight.score)}
                color={color}
              />
            </div>

            {/* Location metadata badges */}
            {payload && (
              <div className="flex flex-col gap-3 mt-2">
                <div className="flex flex-col gap-2">
                  {payload.location && (
                    <Badge variant="outline" className="w-fit">
                      {payload.location}
                    </Badge>
                  )}
                  {payload.workplaceType && (
                    <Badge variant="outline" className="w-fit">
                      {payload.workplaceType}
                    </Badge>
                  )}
                </div>
                {payload.rtoPolicy && (
                  <div className="rounded-md border border-border/60 bg-background px-3 py-2.5 text-sm text-muted-foreground leading-relaxed">
                    <span className="text-xs font-semibold uppercase tracking-wider text-foreground block mb-1">
                      RTO Policy
                    </span>
                    {payload.rtoPolicy}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Commute Metrics */}
          <div className="flex-1 flex flex-col gap-4 w-full min-w-0">
            {/* Commute modal & summary */}
            {payload?.commuteTable && payload.commuteTable.length > 0 ? (
              <div className="w-full">
                <CommuteModal
                  commuteData={payload.commuteTable.map((row) => ({
                    departureTime: row.departureTime,
                    mode: row.mode,
                    durationMinutes: row.durationMinutes,
                    monthlyCost: row.monthlyCost,
                  }))}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 border rounded-lg bg-muted/10">
                <p className="text-sm text-muted-foreground">No commute table available</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <CardFooter className="flex-col items-start gap-2 text-sm mt-auto bg-muted/20 border-t border-border/40 p-4 w-full">
        <Collapsible className="w-full" open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger className="flex w-full items-center justify-between font-medium leading-none hover:underline">
            <div className="flex items-center gap-2">
              AI Insight <TrendingUpIcon className="h-4 w-4 text-primary" />
            </div>
            <ChevronDownIcon
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3">
            <div className="leading-relaxed text-muted-foreground text-sm text-left">
              {insight.rationale}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardFooter>
    </Card>
  );
}
