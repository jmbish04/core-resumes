"use client";

import {
  RefreshCcwIcon,
  Loader2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  AlertTriangleIcon,
  ChevronDownIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { AnalysisConfigModal } from "./AnalysisConfigModal";
import { ScoreRadialChart } from "./ScoreRadialChart";
import { StrategicInsights } from "./StrategicInsights";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalysisRow {
  id: string;
  roleId: string;
  version: number;
  hireScore: number;
  hireRationale: string;
  compensationScore: number;
  compensationRationale: string;
  theHook: string | null;
  strategicRecommendation: string | null;
  counterPositioning: string | null;
  configNotebooklmPrompt: string | null;
  configCompensationBaseline: string | null;
  configCareerStories: string | null;
  usedDefaults: boolean | null;
  analyzedAt: string;
}

interface AnalysisData {
  analysis: AnalysisRow;
  totalRevisions: number;
  alignmentScores: Array<{
    id: string;
    type: string;
    content: string;
    score: number;
    rationale: string;
  }>;
}

interface RevisionSummary {
  id: string;
  version: number;
  hireScore: number;
  compensationScore: number;
  usedDefaults: boolean | null;
  analyzedAt: string;
}

interface HireabilityHeaderProps {
  roleId: string;
}

// ---------------------------------------------------------------------------
// Score color helpers
// ---------------------------------------------------------------------------

function getScoreColor(score: number): string {
  if (score >= 75) return "hsl(142, 71%, 45%)"; // Green — strong
  if (score >= 40) return "hsl(38, 92%, 50%)"; // Amber — moderate
  return "hsl(0, 84%, 60%)"; // Red — gap
}

function getScoreLabel(score: number): string {
  if (score >= 75) return "Strong";
  if (score >= 40) return "Moderate";
  return "Low";
}

// ---------------------------------------------------------------------------
// Radial Score Card — with expandable AI rationale
// ---------------------------------------------------------------------------

function RadialScoreCard({
  title,
  description,
  score,
  rationale,
}: {
  title: string;
  description: string;
  score: number;
  rationale: string;
}) {
  const color = getScoreColor(score);
  const [isOpen, setIsOpen] = useState(false);

  // Extract first sentence as the always-visible headline
  const headline = rationale.split(/[.!?]\s/)[0] + ".";

  return (
    <Card className="flex flex-col md:flex-row items-start p-6 gap-6">
      <div className="flex-1 w-full md:w-auto self-center">
        <ScoreRadialChart score={score} label={getScoreLabel(score)} color={color} />
      </div>
      <div className="flex-[2] flex flex-col gap-2 w-full">
        <div>
          <CardTitle className="text-xl mb-1">{title}</CardTitle>
          <CardDescription className="text-base">{description}</CardDescription>
        </div>

        {/* Headline — always visible */}
        <p className="text-muted-foreground leading-relaxed">{headline}</p>

        {/* Full rationale — expandable */}
        {rationale.length > headline.length && (
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger className="flex items-center gap-1 text-sm text-primary hover:underline">
              Read full analysis
              <ChevronDownIcon
                className={`size-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="prose prose-sm dark:prose-invert max-w-none text-left">
                <ReactMarkdown>{rationale}</ReactMarkdown>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// HireabilityHeader — exported component
// ---------------------------------------------------------------------------

export function HireabilityHeader({ roleId }: HireabilityHeaderProps) {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);

  // Fetch latest analysis
  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch(`/api/roles/${roleId}/analysis`);
      if (res.ok) {
        setData((await res.json()) as AnalysisData);
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [roleId]);

  // Fetch revision history
  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/roles/${roleId}/analysis/history`);
      if (res.ok) {
        const json = (await res.json()) as { revisions?: AnalysisRow[] };
        setRevisions(
          (json.revisions ?? []).map((r: AnalysisRow) => ({
            id: r.id,
            version: r.version,
            hireScore: r.hireScore,
            compensationScore: r.compensationScore,
            usedDefaults: r.usedDefaults,
            analyzedAt: r.analyzedAt,
          })),
        );
      }
    } catch {
      // silent
    }
  }, [roleId]);

  // Fetch a specific analysis by ID
  const fetchAnalysis = useCallback(
    async (analysisId: string) => {
      try {
        const res = await fetch(`/api/roles/${roleId}/analysis/${analysisId}`);
        if (res.ok) {
          setData((await res.json()) as AnalysisData);
        }
      } catch {
        // silent
      }
    },
    [roleId],
  );

  const triggerAnalysis = async () => {
    setAnalyzing(true);
    try {
      await fetch(`/api/roles/${roleId}/analysis`, { method: "POST" });
      // Poll for results
      const pollInterval = setInterval(async () => {
        const res = await fetch(`/api/roles/${roleId}/analysis`);
        if (res.ok) {
          const result = (await res.json()) as AnalysisData;
          if (result.analysis) {
            setData(result);
            setAnalyzing(false);
            clearInterval(pollInterval);
            // Refresh history
            fetchHistory();
          }
        }
      }, 3000);
      // Max poll 2 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        setAnalyzing(false);
      }, 120_000);
    } catch {
      setAnalyzing(false);
    }
  };

  useEffect(() => {
    fetchLatest();
    fetchHistory();
  }, [fetchLatest, fetchHistory]);

  // Navigation helpers
  const currentVersion = data?.analysis.version ?? 0;
  const totalRevisions = revisions.length;
  const isLatest = currentVersion === Math.max(...revisions.map((r) => r.version), 0);
  const currentRevIdx = revisions.findIndex((r) => r.version === currentVersion);

  const goToPrev = () => {
    if (currentRevIdx < revisions.length - 1) {
      fetchAnalysis(revisions[currentRevIdx + 1].id);
    }
  };
  const goToNext = () => {
    if (currentRevIdx > 0) {
      fetchAnalysis(revisions[currentRevIdx - 1].id);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 mb-6">
        <Card className="flex flex-col items-center justify-center min-h-[200px]">
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        </Card>
        <Card className="flex flex-col items-center justify-center min-h-[200px]">
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="mb-6">
        <CardContent className="flex flex-col items-center justify-center py-8 gap-4">
          <p className="text-muted-foreground text-sm">
            No hireability analysis available for this role yet.
          </p>
          <Button variant="outline" onClick={triggerAnalysis} disabled={analyzing}>
            {analyzing ? (
              <>
                <Loader2Icon className="size-4 mr-2 animate-spin" />
                Analyzing…
              </>
            ) : (
              "Run Analysis"
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const analysis = data.analysis;

  return (
    <div className="mb-6 space-y-3">
      {/* Header bar: title, revision nav, buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Hireability Analysis</h3>
          {totalRevisions > 0 && (
            <Badge variant="secondary" className="font-mono text-xs">
              v{currentVersion}
              {isLatest ? " — Latest" : ""}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <AnalysisConfigModal
            version={analysis.version}
            analyzedAt={analysis.analyzedAt}
            configNotebooklmPrompt={analysis.configNotebooklmPrompt}
            configCompensationBaseline={analysis.configCompensationBaseline}
            configCareerStories={analysis.configCareerStories}
            usedDefaults={analysis.usedDefaults}
          />
          <Button variant="outline" size="sm" onClick={triggerAnalysis} disabled={analyzing}>
            {analyzing ? (
              <Loader2Icon className="size-4 animate-spin mr-1.5" />
            ) : (
              <RefreshCcwIcon className="size-4 mr-1.5" />
            )}
            Re-analyze Role
          </Button>
        </div>
      </div>

      {/* Revision navigation */}
      {totalRevisions > 1 && (
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground flex-1">
            {totalRevisions} analysis revision{totalRevisions !== 1 ? "s" : ""} available. Viewing v
            {currentVersion} of {totalRevisions}.
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={goToPrev}
            disabled={currentRevIdx >= revisions.length - 1}
            className="h-7 px-2"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={goToNext}
            disabled={currentRevIdx <= 0}
            className="h-7 px-2"
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      )}

      {/* Fallback warning */}
      {analysis.usedDefaults && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-sm text-amber-400">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <div>
            <p>
              This analysis used default configuration values because no custom config was saved.{" "}
              <a href="/config" className="underline underline-offset-2 hover:text-amber-300">
                Update your config
              </a>{" "}
              with your career stories and compensation details, then click{" "}
              <strong>Re-analyze Role</strong> to generate updated scores using your custom prompts.
            </p>
          </div>
        </div>
      )}

      {/* Radial score cards — single column */}
      <div className="grid grid-cols-1 gap-4">
        <RadialScoreCard
          title="Hire Likelihood"
          description="Overall fit assessment"
          score={analysis.hireScore}
          rationale={analysis.hireRationale}
        />
        <RadialScoreCard
          title="Compensation Score"
          description="Relative to baseline"
          score={analysis.compensationScore}
          rationale={analysis.compensationRationale}
        />
      </div>

      {/* Strategic Insights */}
      <StrategicInsights
        theHook={analysis.theHook}
        strategicRecommendation={analysis.strategicRecommendation}
        counterPositioning={analysis.counterPositioning}
      />
    </div>
  );
}
