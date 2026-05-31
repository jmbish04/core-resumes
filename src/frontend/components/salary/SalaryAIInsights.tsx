/**
 * @fileoverview AI-generated salary insights panel. Renders structured analysis
 * from Workers AI including key insights, anomalies, and recommendations.
 */

import { useState } from "react";
import { Sparkles, RefreshCw, Loader2, AlertTriangle, Lightbulb, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiPost, toast } from "@/lib/api-client";

type AIAnalysis = {
  keyInsights: string[];
  anomalies: { title: string; explanation: string }[];
  recommendations: string[];
  marketNarrative: string;
  topPayingSegments: { segment: string; median: number; context: string }[];
};

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

export function SalaryAIInsights({ insight }: { insight: any | null }) {
  const [generating, setGenerating] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(() => {
    if (insight?.insightText) {
      try {
        return JSON.parse(insight.insightText);
      } catch {
        return null;
      }
    }
    return null;
  });

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await apiPost<{ success: boolean; analysis: AIAnalysis }>(
        "/api/pipeline/salary-intelligence/ai-analysis",
      );
      setAnalysis(res.analysis);
      toast({ title: "Analysis generated", variant: "success" });
    } catch {
      // Error handled by apiPost
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Card className="border-border/40 bg-card/60 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5 text-amber-400" />
          <h3 className="text-sm font-semibold">AI Market Analysis</h3>
          <Badge variant="secondary" className="text-[10px]">
            Workers AI
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleGenerate}
          disabled={generating}
          className="gap-1.5 text-xs"
        >
          {generating ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          {generating ? "Analyzing…" : analysis ? "Regenerate" : "Generate Analysis"}
        </Button>
      </div>

      {!analysis ? (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <Sparkles className="size-8 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">
            Click "Generate Analysis" to have Workers AI analyze your salary data and produce
            actionable career insights.
          </p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Key Insights */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-3 flex items-center gap-1.5">
              <TrendingUp className="size-3.5" />
              Key Insights
            </h4>
            <ul className="space-y-2">
              {analysis.keyInsights.map((insight, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-1 inline-block size-1.5 shrink-0 rounded-full bg-emerald-400" />
                  {insight}
                </li>
              ))}
            </ul>
          </div>

          {/* Anomalies */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-3 flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" />
              Anomalies & Outliers
            </h4>
            <div className="space-y-3">
              {analysis.anomalies.map((anomaly, i) => (
                <div key={i} className="rounded-lg bg-amber-500/5 border border-amber-500/10 p-3">
                  <p className="text-xs font-semibold text-amber-300">{anomaly.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{anomaly.explanation}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recommendations (full width) */}
          <div className="lg:col-span-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-sky-400 mb-3 flex items-center gap-1.5">
              <Lightbulb className="size-3.5" />
              Career Pivot Recommendations
            </h4>
            <div className="grid gap-2 sm:grid-cols-2">
              {analysis.recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-sky-500/5 border border-sky-500/10 p-3">
                  <span className="mt-0.5 text-xs font-bold text-sky-400">{i + 1}.</span>
                  <p className="text-xs text-muted-foreground">{rec}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Top Paying Segments */}
          {analysis.topPayingSegments.length > 0 && (
            <div className="lg:col-span-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-violet-400 mb-3">
                Top Paying Segments
              </h4>
              <div className="flex flex-wrap gap-2">
                {analysis.topPayingSegments.map((seg, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-full bg-violet-500/10 border border-violet-500/20 px-3 py-1.5"
                  >
                    <span className="text-xs font-medium text-violet-300">{seg.segment}</span>
                    <span className="text-xs font-bold tabular-nums">{fmt(seg.median)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
