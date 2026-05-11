import { AlertTriangle, Clipboard, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiPost, toast } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProcessingError = {
  taskType: string;
  taskId: string;
  error: string;
  stack?: string;
  occurredAt: string;
};

// ---------------------------------------------------------------------------
// RoleErrors — health-check-style error display + reprocess button
// ---------------------------------------------------------------------------

export function RoleErrors({
  roleId,
  errors,
  onReprocessed,
}: {
  roleId: string;
  errors: ProcessingError[];
  onReprocessed?: () => void;
}) {
  const [reprocessing, setReprocessing] = useState(false);

  async function handleReprocess() {
    setReprocessing(true);
    try {
      await apiPost(`/api/roles/${roleId}/reprocess`);
      toast({
        title: "Reprocessing started",
        description: "The role is being re-processed. This page will refresh.",
      });
      onReprocessed?.();
      // Give the toast a moment to show, then hard-refresh
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      toast({
        title: "Reprocess failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setReprocessing(false);
    }
  }

  async function copyAll() {
    const errorBlocks = errors
      .map(
        (e, idx) =>
          `### Error ${idx + 1}: ${e.taskType}\n\`\`\`\n${e.error}${e.stack ? `\n\n${e.stack}` : ""}\n\`\`\`\nOccurred at: ${e.occurredAt}`,
      )
      .join("\n\n");

    const prompt = `## 🔧 Fix Role Processing Errors

**Role ID:** \`${roleId}\`

The following errors occurred during background processing of this role. Please investigate and fix the root cause of each error.

${errorBlocks}

Please fix all errors above so the role can be reprocessed successfully.`;

    await navigator.clipboard.writeText(prompt);
    toast({ title: "Copied", description: "Error prompt copied to clipboard — paste into your coding agent." });
  }

  if (errors.length === 0) return null;

  return (
    <Card className="rounded-lg border-destructive/40 bg-destructive/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            <CardTitle className="text-destructive">
              Processing Errors ({errors.length})
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={copyAll}>
              <Clipboard className="size-3.5" />
              Copy All
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleReprocess}
              disabled={reprocessing}
            >
              <RefreshCw className={`size-3.5 ${reprocessing ? "animate-spin" : ""}`} />
              {reprocessing ? "Reprocessing…" : "Reprocess Role"}
            </Button>
          </div>
        </div>
        <CardDescription className="text-destructive/70">
          The following errors occurred during background processing. Fix the underlying issue, then
          click "Reprocess Role" to retry.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {errors.map((err, idx) => (
          <div
            key={`${err.taskId}-${idx}`}
            className="rounded-lg border border-destructive/20 bg-black/30 p-4"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="rounded bg-destructive/20 px-2 py-0.5 font-mono text-xs text-destructive">
                {err.taskType}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(err.occurredAt).toLocaleString()}
              </span>
            </div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-sm text-red-300">
              {err.error}
            </pre>
            {err.stack && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                  Stack trace
                </summary>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                  {err.stack}
                </pre>
              </details>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
