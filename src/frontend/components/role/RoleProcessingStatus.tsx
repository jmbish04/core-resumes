/**
 * @fileoverview Real-time processing status panel for the role viewport.
 *
 * Connects to the role-scoped OrchestratorAgent DO via WebSocket using
 * `useAgent` to receive live task progress broadcasts. Also fetches initial
 * state from the processing-status API.
 */

import { useAgent } from "agents/react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { apiGet, apiPost, toast } from "@/lib/api-client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProcessingTask = {
  id: string;
  type: string;
  status: "pending" | "running" | "complete" | "failed";
  stage?: string;
  stagePercent?: number;
  error?: string;
  roleId?: string;
};

type ProcessingStatusResponse = {
  roleId: string;
  tasks: ProcessingTask[];
};

const TASK_LABELS: Record<string, string> = {
  job_extract: "Job Extraction",
  company_analysis: "Company Analysis",
  insight_location: "Location Analysis",
  insight_compensation: "Compensation Analysis",
  insight_combined: "Combined Value Score",
  role_analysis: "Hireability Analysis",
  role_assets: "Role Assets & Podcast",
  resume_review: "Resume Review",
  cover_letter_draft: "Cover Letter Draft",
  email_draft: "Email Draft",
  email_status_inference: "Email Status Inference",
  interview_feedback: "Interview Feedback",
  resume_comment_response: "Comment Response",
  mock_interview: "Mock Interview",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending: <Clock className="size-4 text-muted-foreground" />,
  running: <Loader2 className="size-4 animate-spin text-blue-400" />,
  complete: <CheckCircle2 className="size-4 text-emerald-400" />,
  failed: <AlertTriangle className="size-4 text-destructive" />,
};

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Pending", variant: "outline" },
  running: { label: "Running", variant: "default" },
  complete: { label: "Complete", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RoleProcessingStatus({ roleId }: { roleId: string }) {
  const [tasks, setTasks] = useState<ProcessingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | null>(null);

  // Fetch initial status
  const fetchStatus = useCallback(() => {
    setLoading(true);
    apiGet<ProcessingStatusResponse>(`/api/roles/${roleId}/processing-status`)
      .then((data) => setTasks(data.tasks))
      .catch(() => {
        // No orchestrator state yet — that's ok
        setTasks([]);
      })
      .finally(() => setLoading(false));
  }, [roleId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Live WebSocket updates from orchestrator DO
  useAgent({
    agent: "OrchestratorAgent",
    name: roleId,
    onMessage: (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          type?: string;
          stage?: string;
          task?: ProcessingTask;
          payload?: { roleId?: string; status?: string; percent?: number };
        };

        if (data.type === "task" && data.task) {
          const task = data.task;
          const stage = data.stage;
          const stagePercent = stage ? computeStagePercent(task.type, stage) : undefined;

          setTasks((prev) => {
            const incoming: ProcessingTask = {
              ...task,
              ...(stage ? { stage } : {}),
              ...(stagePercent !== undefined ? { stagePercent } : {}),
            };

            const existing = prev.find((t) => t.id === task.id);
            if (existing) {
              return prev.map((t) =>
                t.id === task.id
                  ? {
                      ...t,
                      status: incoming.status,
                      error: incoming.error,
                      ...(incoming.stage ? { stage: incoming.stage } : {}),
                      ...(incoming.stagePercent !== undefined
                        ? { stagePercent: incoming.stagePercent }
                        : {}),
                    }
                  : t,
              );
            }
            // New task enqueued (e.g. auto-chained after job_extract)
            return [...prev, incoming];
          });
        }

        // Optional: workflow progress broadcast from OrchestratorAgent.handleWorkflowProgress()
        if (data.type === "WORKFLOW_PROGRESS" && data.payload?.roleId === roleId) {
          const percent = typeof data.payload.percent === "number" ? data.payload.percent : undefined;
          if (percent === undefined) return;

          setTasks((prev) =>
            prev.map((t) => {
              if (t.status !== "running") return t;
              if (t.type !== "role_analysis" && t.type !== "role_assets") return t;
              return { ...t, stagePercent: Math.max(0, Math.min(100, percent)) };
            }),
          );
        }
      } catch {
        // non-JSON messages are fine
      }
    },
  });

  // Retry a single task
  const retryTask = async (taskId: string) => {
    setRetrying(taskId);
    try {
      await apiPost(`/api/roles/${roleId}/reprocess`, { taskId });
      toast({ title: "Retrying task", description: "The task has been re-queued." });
    } catch (err) {
      toast({
        title: "Retry failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRetrying(null);
    }
  };

  // Retry all failed tasks
  const retryAllFailed = async () => {
    setRetrying("all");
    try {
      await apiPost(`/api/roles/${roleId}/reprocess`, {});
      toast({ title: "Retrying all failed tasks", description: "All failed tasks have been re-queued." });
    } catch (err) {
      toast({
        title: "Retry failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setRetrying(null);
    }
  };

  if (loading) {
    return (
      <Card className="rounded-lg">
        <CardContent className="flex items-center gap-2 p-6 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading processing status…
        </CardContent>
      </Card>
    );
  }

  if (tasks.length === 0) {
    return (
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-sm">Processing Status</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            No processing tasks found for this role. Tasks are created when a role is submitted
            or reprocessed.
          </p>
        </CardContent>
      </Card>
    );
  }

  const failedCount = tasks.filter((t) => t.status === "failed").length;
  const completeCount = tasks.filter((t) => t.status === "complete").length;
  const runningCount = tasks.filter((t) => t.status === "running").length;

  return (
    <Card className="rounded-lg">
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="text-sm">Processing Status</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {completeCount}/{tasks.length} complete
            {runningCount > 0 && ` · ${runningCount} running`}
            {failedCount > 0 && ` · ${failedCount} failed`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={fetchStatus}>
            <RefreshCw className="mr-1 size-3" /> Refresh
          </Button>
          {failedCount > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={retryAllFailed}
              disabled={retrying === "all"}
            >
              {retrying === "all" ? (
                <Loader2 className="mr-1 size-3 animate-spin" />
              ) : (
                <RotateCcw className="mr-1 size-3" />
              )}
              Retry All Failed
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid gap-1.5">
        {tasks.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            retrying={retrying === task.id}
            onRetry={() => retryTask(task.id)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// TaskRow
// ---------------------------------------------------------------------------

function TaskRow({
  task,
  retrying,
  onRetry,
}: {
  task: ProcessingTask;
  retrying: boolean;
  onRetry: () => void;
}) {
  const badgeInfo = STATUS_BADGES[task.status] ?? STATUS_BADGES.pending;
  const stageLabel =
    task.stage && task.stage !== task.status ? formatStageLabel(task.stage) : undefined;

  return (
    <Collapsible>
      <div
        className={cn(
          "flex items-center gap-3 rounded-md border border-border/60 px-3 py-2 text-sm",
          task.status === "failed" && "border-destructive/30 bg-destructive/5",
          task.status === "running" && "border-blue-400/30 bg-blue-400/5",
          task.status === "complete" && "border-emerald-400/20",
        )}
      >
        {STATUS_ICONS[task.status]}
        <div className="flex-1">
          <div className="font-medium">{TASK_LABELS[task.type] ?? task.type}</div>
          {stageLabel && (
            <div className="text-xs text-muted-foreground">
              {stageLabel}
              {typeof task.stagePercent === "number" && ` · ${Math.round(task.stagePercent)}%`}
            </div>
          )}
          {task.status === "running" && typeof task.stagePercent === "number" && (
            <div className="mt-1 h-1 w-full overflow-hidden rounded bg-muted">
              <div
                className="h-full bg-blue-400"
                style={{ width: `${Math.max(0, Math.min(100, task.stagePercent))}%` }}
              />
            </div>
          )}
        </div>
        <Badge variant={badgeInfo.variant} className="text-xs">
          {badgeInfo.label}
        </Badge>
        {task.status === "failed" && (
          <>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                Details
              </Button>
            </CollapsibleTrigger>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={onRetry}
              disabled={retrying}
            >
              {retrying ? (
                <Loader2 className="mr-1 size-3 animate-spin" />
              ) : (
                <RotateCcw className="mr-1 size-3" />
              )}
              Retry
            </Button>
          </>
        )}
      </div>
      {task.error && (
        <CollapsibleContent>
          <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            {task.error}
          </pre>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

function formatStageLabel(stage: string) {
  return stage.replaceAll("_", " ").replaceAll("-", " ").trim();
}

/**
 * Computes the progress percentage for a given task stage.
 * Only applies to resume and cover letter drafting tasks that have defined stages.
 * Task types match backend definitions in orchestrator/types.ts:
 * - "resume_review" for resume drafting
 * - "cover_letter_draft" for cover letter drafting
 */
function computeStagePercent(taskType: string, stage: string): number | undefined {
  if (taskType !== "resume_review" && taskType !== "cover_letter_draft") return undefined;

  const map: Record<string, number> = {
    planning: 5,
    consulting: 20,
    drafting: 45,
    accuracy_review: 65,
    strategic_review: 75,
    evaluating: 85,
    improving: 92,
    creating_doc: 97,
    complete: 100,
  };

  return map[stage];
}
