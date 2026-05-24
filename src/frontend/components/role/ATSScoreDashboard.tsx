/**
 * @fileoverview ATS Score Dashboard — real-time keyword gap analysis
 * with a "Refresh Score" button that reads live Google Doc text.
 *
 * Rendered inside the Analysis tab of RoleViewport.
 */

import {
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  FileText,
  Target,
  Loader2,
  ChevronDown,
  ChevronUp,
  Lightbulb,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { apiPost, toast } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types — mirrors the backend ATSScoreResult
// ---------------------------------------------------------------------------

interface CategoryScores {
  programmingLanguagesAndFrameworks: number;
  testingAndQuality: number;
  engineeringPractices: number;
  businessDomain: number;
  infrastructureAndDevOps: number;
}

interface SynonymSuggestion {
  missing: string;
  suggestion: string;
}

interface ATSScoreResponse {
  roleId: string;
  gdocId: string;
  scoredAt: string;
  overallMatchPercent: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  synonymSuggestions: SynonymSuggestion[];
  categoryScores: CategoryScores;
  extraction: {
    programmingLanguagesAndFrameworks: string[];
    testingAndQuality: string[];
    engineeringPractices: string[];
    businessDomain: string[];
    infrastructureAndDevOps: string[];
    impliedSkills: string[];
  };
}

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

const CATEGORY_META: {
  key: keyof CategoryScores;
  label: string;
  extractionKey: keyof ATSScoreResponse["extraction"];
  icon: string;
}[] = [
  {
    key: "programmingLanguagesAndFrameworks",
    label: "Languages & Frameworks",
    extractionKey: "programmingLanguagesAndFrameworks",
    icon: "💻",
  },
  {
    key: "testingAndQuality",
    label: "Testing & Quality",
    extractionKey: "testingAndQuality",
    icon: "🧪",
  },
  {
    key: "engineeringPractices",
    label: "Engineering Practices",
    extractionKey: "engineeringPractices",
    icon: "⚙️",
  },
  {
    key: "businessDomain",
    label: "Business Domain",
    extractionKey: "businessDomain",
    icon: "📊",
  },
  {
    key: "infrastructureAndDevOps",
    label: "Infrastructure & DevOps",
    extractionKey: "infrastructureAndDevOps",
    icon: "☁️",
  },
];

// ---------------------------------------------------------------------------
// Score color utility
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 75) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

function scoreBg(score: number): string {
  if (score >= 75) return "bg-emerald-500/20 border-emerald-500/30";
  if (score >= 40) return "bg-amber-500/20 border-amber-500/30";
  return "bg-red-500/20 border-red-500/30";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ATSScoreDashboard({ roleId }: { roleId: string }) {
  const [gdocId, setGdocId] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ATSScoreResponse | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleRefreshScore = async () => {
    if (!gdocId.trim()) {
      toast({
        title: "Google Doc ID required",
        description: "Paste a Google Doc ID or URL to score your resume.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const data = await apiPost<ATSScoreResponse>(`/api/roles/${roleId}/ats-score`, {
        gdocId: gdocId.trim(),
      });
      setResult(data);
      toast({
        title: "ATS Score Refreshed",
        description: `Match: ${data.overallMatchPercent}%`,
        variant: "success",
      });
    } catch {
      // ApiError already toasts via apiPost
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="rounded-lg border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="size-5 text-primary" />
            <CardTitle className="text-base">ATS Keyword Scanner</CardTitle>
          </div>
          {result && (
            <span className="text-xs text-muted-foreground">
              Scored {new Date(result.scoredAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        <CardDescription>
          Real-time keyword gap analysis against your resume document.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Google Doc ID input + Refresh */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <FileText className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Google Doc ID or URL"
              value={gdocId}
              onChange={(e) => setGdocId(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button
            size="sm"
            onClick={handleRefreshScore}
            disabled={loading}
            className="gap-1.5 whitespace-nowrap"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Refresh Score
          </Button>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Overall score hero */}
            <div
              className={`flex items-center justify-between rounded-lg border px-4 py-3 ${scoreBg(result.overallMatchPercent)}`}
            >
              <div>
                <p className="text-sm font-medium text-muted-foreground">Overall ATS Match</p>
                <p className={`text-3xl font-bold ${scoreColor(result.overallMatchPercent)}`}>
                  {result.overallMatchPercent}%
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>{result.matchedKeywords.length} matched</p>
                <p>{result.missingKeywords.length} missing</p>
              </div>
            </div>

            {/* Category breakdown */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-foreground">Category Breakdown</h4>
              {CATEGORY_META.map(({ key, label, extractionKey, icon }) => {
                const score = result.categoryScores[key];
                const keywords = result.extraction[extractionKey];
                const isExpanded = expandedCategories.has(key);

                return (
                  <Collapsible key={key} open={isExpanded}>
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between rounded-md border border-border/40 bg-card px-3 py-2 text-left transition-colors hover:bg-accent/50"
                        onClick={() => toggleCategory(key)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{icon}</span>
                          <span className="text-sm font-medium">{label}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {keywords.length}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${scoreColor(score)}`}>{score}%</span>
                          {isExpanded ? (
                            <ChevronUp className="size-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="size-3.5 text-muted-foreground" />
                          )}
                        </div>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="mt-1 flex flex-wrap gap-1.5 rounded-md border border-border/20 bg-muted/30 px-3 py-2">
                        {keywords.map((kw) => {
                          const isMatched = result.matchedKeywords.includes(kw);
                          return (
                            <Badge
                              key={kw}
                              variant={isMatched ? "default" : "outline"}
                              className={`text-[11px] ${
                                isMatched
                                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                  : "text-muted-foreground border-border/50"
                              }`}
                            >
                              {isMatched ? (
                                <CheckCircle2 className="mr-1 size-3" />
                              ) : (
                                <AlertCircle className="mr-1 size-3" />
                              )}
                              {kw}
                            </Badge>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}

              {/* Implied skills */}
              {result.extraction.impliedSkills.length > 0 && (
                <div className="rounded-md border border-border/40 bg-card px-3 py-2">
                  <div className="mb-2 flex items-center gap-2">
                    <Lightbulb className="size-4 text-amber-400" />
                    <span className="text-sm font-medium">Implied Skills</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {result.extraction.impliedSkills.map((skill) => (
                      <Badge
                        key={skill}
                        variant="secondary"
                        className="text-[11px] bg-amber-500/10 text-amber-400 border-amber-500/20"
                      >
                        {skill}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Synonym suggestions */}
            {result.synonymSuggestions.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-sm font-semibold text-foreground">
                  🔧 Quick Fixes — Synonym Suggestions
                </h4>
                <div className="space-y-1">
                  {result.synonymSuggestions.slice(0, 10).map((s) => (
                    <div
                      key={s.missing}
                      className="flex items-center justify-between rounded-md border border-border/20 bg-muted/20 px-3 py-1.5 text-xs"
                    >
                      <span className="text-red-400 line-through">{s.missing}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-emerald-400 font-medium">{s.suggestion}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
