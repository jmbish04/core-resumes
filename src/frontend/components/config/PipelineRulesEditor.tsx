import { Filter, Loader2, Save, Tag } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPut } from "@/lib/api-client";

export function PipelineRulesEditor() {
  const [pipelineA, setPipelineA] = useState<{ keywords: string[] }>({ keywords: [] });
  const [pipelineB, setPipelineB] = useState<{ minSalary: number; locations: string[] }>({
    minSalary: 0,
    locations: [],
  });

  const [loading, setLoading] = useState(true);
  const [savingA, setSavingA] = useState(false);
  const [savingB, setSavingB] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const [resA, resB] = await Promise.all([
        apiGet<any>("/api/config/pipeline_a_rules"),
        apiGet<any>("/api/config/pipeline_b_rules"),
      ]);
      setPipelineA(resA.value || { keywords: [] });
      setPipelineB(resB.value || { minSalary: 0, locations: [] });
    } catch {
      /* noop */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const handleSaveA = async () => {
    setSavingA(true);
    try {
      await apiPut("/api/config/pipeline_a_rules", { value: pipelineA });
    } catch {
      /* noop */
    }
    setSavingA(false);
  };

  const handleSaveB = async () => {
    setSavingB(true);
    try {
      await apiPut("/api/config/pipeline_b_rules", { value: pipelineB });
    } catch {
      /* noop */
    }
    setSavingB(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/60">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Tag className="size-5 text-indigo-400" />
                Pipeline A (Aggregator Exception Rules)
              </CardTitle>
              <CardDescription>
                Rules for filtering the thousands of jobs tracked in the upstream Github repository.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={handleSaveA}
                disabled={savingA}
                variant="outline"
                className="gap-1.5"
              >
                {savingA ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                Save Keywords
              </Button>
              <Button size="sm" onClick={handleSaveB} disabled={savingB} className="gap-1.5">
                {savingB ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                Save Exceptions
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Keyword Filter (Comma-separated)</Label>
            <Textarea
              className="font-mono text-sm h-20"
              value={pipelineA.keywords.join(", ")}
              onChange={(e) =>
                setPipelineA({
                  ...pipelineA,
                  keywords: e.target.value
                    .split(",")
                    .map((k) => k.trim())
                    .filter(Boolean),
                })
              }
              placeholder="software engineer, frontend, backend..."
            />
            <p className="text-xs text-muted-foreground">
              Only pull in data for jobs from the upstream Github repository that match these
              keywords.
            </p>
          </div>

          <div className="rounded-lg border border-border/50 bg-muted/20 p-4 space-y-4">
            <div>
              <h4 className="text-sm font-medium">Deep Processing Exceptions</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Of the jobs matching the keywords above, fully process them through Pipeline B (AI
                analysis, etc.) if they ALSO match the following salary and location criteria:
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Minimum Salary Threshold ($)</Label>
                <Input
                  type="number"
                  value={pipelineB.minSalary}
                  onChange={(e) =>
                    setPipelineB({ ...pipelineB, minSalary: Number(e.target.value) })
                  }
                  className="font-mono text-sm h-8"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Target Locations (Comma-separated)</Label>
                <Input
                  value={pipelineB.locations.join(", ")}
                  onChange={(e) =>
                    setPipelineB({
                      ...pipelineB,
                      locations: e.target.value
                        .split(",")
                        .map((k) => k.trim())
                        .filter(Boolean),
                    })
                  }
                  className="font-mono text-sm h-8"
                  placeholder="Remote, New York, San Francisco..."
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Filter className="size-5 text-pink-400" />
                Pipeline B (Tracked Companies)
              </CardTitle>
              <CardDescription>
                Pipeline B loops through the Greenhouse board associated with all active companies
                setup on our official company table list. It will scan all open positions for those
                companies and process them normally.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Manage your official company list in the "Pipeline Companies" configuration below, or
            promote companies found via Pipeline A's aggregator.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
