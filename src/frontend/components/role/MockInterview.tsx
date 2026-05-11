import {
  Loader2Icon,
  MessageSquareIcon,
  RefreshCcwIcon,
  SparklesIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QAPair {
  interviewer: string;
  candidate: string;
  insight: string;
}

interface MockInterviewData {
  interview: {
    id: string;
    roleId: string;
    analysisId: string | null;
    version: number;
    qaPairs: QAPair[];
    generatedAt: string;
  };
  totalRevisions: number;
}

interface MockInterviewProps {
  roleId: string;
}

// ---------------------------------------------------------------------------
// MockInterview — exported component
// ---------------------------------------------------------------------------

export function MockInterview({ roleId }: MockInterviewProps) {
  const [data, setData] = useState<MockInterviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch(`/api/roles/${roleId}/interview`);
      if (res.ok) {
        setData((await res.json()) as MockInterviewData);
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [roleId]);

  const triggerGeneration = async () => {
    setGenerating(true);

    // Clear any existing poll
    if (pollRef.current) clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    try {
      await fetch(`/api/roles/${roleId}/interview`, { method: "POST" });
      // Poll for results
      pollRef.current = setInterval(async () => {
        const res = await fetch(`/api/roles/${roleId}/interview`);
        if (res.ok) {
          const result = (await res.json()) as MockInterviewData;
          if (result.interview) {
            setData(result);
            setGenerating(false);
            if (pollRef.current) clearInterval(pollRef.current);
          }
        }
      }, 3000);
      // Max poll 3 minutes (interview generation involves NotebookLM)
      timeoutRef.current = setTimeout(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        setGenerating(false);
      }, 180_000);
    } catch {
      setGenerating(false);
    }
  };

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8 gap-4">
          <MessageSquareIcon className="size-10 text-muted-foreground" />
          <p className="text-muted-foreground text-sm text-center max-w-md">
            No mock interview has been generated yet. Generate one to practice with tough,
            role-specific questions mapped to your career metrics.
          </p>
          <Button variant="outline" onClick={triggerGeneration} disabled={generating}>
            {generating ? (
              <>
                <Loader2Icon className="size-4 mr-2 animate-spin" />
                Generating Interview…
              </>
            ) : (
              <>
                <MessageSquareIcon className="size-4 mr-2" />
                Generate Mock Interview
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { interview, totalRevisions } = data;
  const qaPairs = interview.qaPairs as QAPair[];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">Mock Interview</h3>
          <Badge variant="secondary" className="font-mono text-xs">
            v{interview.version}
          </Badge>
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {qaPairs.length} questions
          </Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={triggerGeneration}
          disabled={generating}
        >
          {generating ? (
            <Loader2Icon className="size-4 animate-spin mr-1.5" />
          ) : (
            <RefreshCcwIcon className="size-4 mr-1.5" />
          )}
          Regenerate
        </Button>
      </div>

      {/* Q&A Pairs */}
      <Accordion
        type="single"
        collapsible
        defaultValue="q-0"
        className="space-y-2"
      >
        {qaPairs.map((pair, i) => (
          <AccordionItem
            key={i}
            value={`q-${i}`}
            className="border rounded-lg bg-card px-1"
          >
            <AccordionTrigger className="hover:no-underline py-3 px-3">
              <div className="flex items-center gap-3 text-left">
                <Badge
                  variant="outline"
                  className="font-mono text-xs shrink-0 min-w-[32px] justify-center"
                >
                  Q{i + 1}
                </Badge>
                <span className="text-sm font-medium line-clamp-2">
                  {pair.interviewer}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-4 space-y-4">
              {/* Interviewer question — full text */}
              <div className="flex gap-3">
                <div className="shrink-0 mt-0.5">
                  <div className="size-7 rounded-full bg-muted flex items-center justify-center">
                    <UsersIcon className="size-3.5 text-muted-foreground" />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1">
                    Interviewer
                  </p>
                  <p className="text-sm text-foreground leading-relaxed italic">
                    &ldquo;{pair.interviewer}&rdquo;
                  </p>
                </div>
              </div>

              {/* Candidate answer */}
              <div className="flex gap-3">
                <div className="shrink-0 mt-0.5">
                  <div className="size-7 rounded-full bg-chart-1/10 flex items-center justify-center">
                    <UserIcon className="size-3.5 text-chart-1" />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-chart-1 mb-1">
                    Justin
                  </p>
                  <div className="text-sm text-foreground leading-relaxed bg-muted/50 rounded-lg p-3 border border-border/50">
                    {pair.candidate}
                  </div>
                </div>
              </div>

              {/* Coaching insight */}
              <div className="flex gap-3 bg-chart-1/5 border border-chart-1/10 rounded-lg p-3">
                <SparklesIcon className="size-4 text-chart-1 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-chart-1 mb-1">
                    Strategy Insight
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {pair.insight}
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
