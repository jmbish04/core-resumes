"use client";

import {
  ScaleIcon,
  RefreshCcwIcon,
  Loader2Icon,
  ChevronDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { apiGet, apiPost, toast } from "@/lib/api-client";

import { ScoreRadialChart } from "./ScoreRadialChart";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CombinedInsight {
  id: string;
  roleId: string;
  version: number;
  type: string;
  score: number;
  rationale: string;
  analysisPayload: {
    locationScore?: number;
    compensationScore?: number;
  } | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
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
// CombinedValueScore
// ---------------------------------------------------------------------------

export function CombinedValueScore({ roleId }: { roleId: string }) {
  const [insight, setInsight] = useState<CombinedInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [isOpen, setIsOpen] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<CombinedInsight>(`/api/roles/${roleId}/insights?type=combined`);
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
      await apiPost(`/api/roles/${roleId}/insights`, {
        types: ["location", "compensation", "combined"],
      });
      toast({ title: "Full analysis complete" });
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
          <ScaleIcon className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No combined analysis yet.</p>
          <Button size="sm" disabled={analyzing} onClick={() => void analyze()}>
            {analyzing ? (
              <>
                <Loader2Icon className="mr-1 h-3 w-3 animate-spin" /> Analyzing…
              </>
            ) : (
              "Run Full Analysis"
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const color = getScoreColor(insight.score);

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
              <ScaleIcon className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-xl">Combined Value</CardTitle>
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

          {insight.score === 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-sm text-amber-400 mt-2">
              <ScaleIcon className="mt-0.5 size-4 shrink-0" />
              <div className="flex-1">
                <p>
                  Combined score did not compute correctly — this usually means the sub-analyses
                  haven't been generated yet.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 h-7 text-xs"
                  disabled={analyzing}
                  onClick={() => void analyze()}
                >
                  {analyzing ? (
                    <>
                      <Loader2Icon className="mr-1 h-3 w-3 animate-spin" /> Running…
                    </>
                  ) : (
                    "Run Full Analysis"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Sub-score badges */}
          {insight.analysisPayload && (
            <div className="flex flex-wrap gap-2 mt-2">
              {insight.analysisPayload.locationScore != null && (
                <Badge variant="outline" className="text-xs">
                  Location: {insight.analysisPayload.locationScore}/100
                </Badge>
              )}
              {insight.analysisPayload.compensationScore != null && (
                <Badge variant="outline" className="text-xs">
                  Compensation: {insight.analysisPayload.compensationScore}/100
                </Badge>
              )}
            </div>
          )}
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
            <div className="prose prose-sm dark:prose-invert max-w-none text-left">
              <ReactMarkdown>{insight.rationale}</ReactMarkdown>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardFooter>
    </Card>
  );
}
