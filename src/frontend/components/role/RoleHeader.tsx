import {
  AlertTriangle,
  Archive,
  Award,
  CheckCircle2,
  ChevronDown,
  Clock,

  ExternalLink,
  FileText,
  Handshake,
  Loader2,
  LogOut,
  Mic,
  Send,
  Timer,
  Trash2,
  XCircle,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Stepper, StepperItem } from "@/components/ui/stepper";
import { apiDelete, apiGet, apiPatch, apiPost, toast } from "@/lib/api-client";

const GREENHOUSE_PATTERN =
  /^https?:\/\/(?:job-boards|boards)\.greenhouse\.io\/(?:embed\/job_app\?.*?(?:token=([^&]+).*?id=([^&]+)|id=([^&]+).*?token=([^&]+))|([^/]+)\/jobs\/(\d+))/i;

function parseGreenhouseToken(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(GREENHOUSE_PATTERN);
  if (!match) return null;
  if (match[5]) return match[5];
  return match[1] || match[4] || null;
}

import type { RoleRow } from "../dashboard/types";

import { RoleActionsDialog } from "./RoleActionsDialog";
import { StatusTransitionModal } from "./StatusTransitionModal";

// ---------------------------------------------------------------------------
// Status metadata — icon, color, label, and workflow group
// ---------------------------------------------------------------------------

type StatusMeta = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  badgeClass: string;
  group: "active" | "terminal" | "system";
};

const STATUS_META: Record<string, StatusMeta> = {
  preparing: {
    label: "Preparing",
    icon: Clock,
    color: "text-blue-400",
    badgeClass: "border-blue-500/40 bg-blue-500/10 text-blue-400",
    group: "active",
  },
  processing_error: {
    label: "Processing Error",
    icon: AlertTriangle,
    color: "text-orange-400",
    badgeClass: "border-orange-500/40 bg-orange-500/10 text-orange-400",
    group: "system",
  },
  posting_expired: {
    label: "Posting Expired",
    icon: Timer,
    color: "text-zinc-400",
    badgeClass: "border-zinc-500/40 bg-zinc-500/10 text-zinc-400",
    group: "terminal",
  },
  applied: {
    label: "Applied",
    icon: Send,
    color: "text-cyan-400",
    badgeClass: "border-cyan-500/40 bg-cyan-500/10 text-cyan-400",
    group: "active",
  },
  interviewing: {
    label: "Interviewing",
    icon: Mic,
    color: "text-amber-400",
    badgeClass: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    group: "active",
  },
  offer: {
    label: "Offer",
    icon: CheckCircle2,
    color: "text-emerald-400",
    badgeClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    group: "active",
  },
  negotiating: {
    label: "Negotiating",
    icon: Handshake,
    color: "text-violet-400",
    badgeClass: "border-violet-500/40 bg-violet-500/10 text-violet-400",
    group: "active",
  },
  accepted: {
    label: "Accepted",
    icon: Award,
    color: "text-emerald-400",
    badgeClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    group: "terminal",
  },
  rejected: {
    label: "Rejected",
    icon: XCircle,
    color: "text-red-400",
    badgeClass: "border-red-500/40 bg-red-500/10 text-red-400",
    group: "terminal",
  },
  withdrawn: {
    label: "Withdrawn",
    icon: LogOut,
    color: "text-slate-400",
    badgeClass: "border-slate-500/40 bg-slate-500/10 text-slate-400",
    group: "terminal",
  },
  archived: {
    label: "Archived",
    icon: Archive,
    color: "text-zinc-500",
    badgeClass: "border-zinc-500/40 bg-zinc-500/10 text-zinc-500",
    group: "terminal",
  },
};

const ACTIVE_STATUSES = Object.entries(STATUS_META).filter(([, m]) => m.group === "active");
const TERMINAL_STATUSES = Object.entries(STATUS_META).filter(([, m]) => m.group === "terminal");

// Stepper progression (happy path)
const STEPPER_STEPS = ["preparing", "applied", "interviewing", "offer", "negotiating", "accepted"];

// Statuses that require notes prompt
const NOTES_REQUIRED_STATUSES = new Set([
  "interviewing",
  "offer",
  "negotiating",
  "accepted",
  "rejected",
  "withdrawn",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getScoreTextColor(score: number): string {
  if (score >= 75) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

function formatCompactSalary(min: number | null, max: number | null, _currency = "USD"): string {
  if (min === null && max === null) return "—";

  const format = (n: number) => {
    if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
    return `$${n}`;
  };

  if (min !== null && max !== null) {
    return `${format(min)}–${format(max)}`;
  }
  return format(min ?? max ?? 0);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RoleHeader({ role }: { role: RoleRow }) {
  const [current, setCurrent] = useState(role);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [transitionModal, setTransitionModal] = useState<{
    toStatus: string;
    toLabel: string;
  } | null>(null);

  const [trackedTokens, setTrackedTokens] = useState<Set<string>>(new Set());
  const [promotingToken, setPromotingToken] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalysis() {
      try {
        const res = await fetch(`/api/roles/${current.id}/analysis`);
        if (res.ok) {
          setAnalysisData(await res.json());
        }
      } catch {
        // silent
      }
    }
    fetchAnalysis();

    apiGet<{ tokens: { token: string }[] }>("/api/pipeline/board-tokens")
      .then((res) => {
        const tokens = new Set(res.tokens.map((t) => t.token));
        setTrackedTokens(tokens);
      })
      .catch(() => {});
  }, [current.id]);

  const handleRoleUpdate = useCallback((updated: RoleRow) => {
    setCurrent(updated);
  }, []);

  async function updateStatus(status: string) {
    if (status === current.status || isUpdating) return;

    // Check if this status requires a notes prompt
    if (NOTES_REQUIRED_STATUSES.has(status)) {
      const meta = STATUS_META[status];
      setTransitionModal({
        toStatus: status,
        toLabel: meta?.label ?? status,
      });
      return;
    }

    // Direct transition for non-notes statuses
    setIsUpdating(true);
    try {
      const next = await apiPatch<RoleRow>(`/api/roles/${current.id}`, { status });
      setCurrent(next);
    } finally {
      setIsUpdating(false);
    }
  }

  const meta = STATUS_META[current.status] ?? STATUS_META.preparing!;
  const StatusIcon = meta.icon;

  // Compute stepper active index
  const stepperActiveIdx = STEPPER_STEPS.indexOf(current.status);
  const isTerminal = meta.group === "terminal" || meta.group === "system";

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await apiDelete(`/api/roles/${current.id}`);
      toast({
        title: "Role deleted",
        description: `${current.companyName} — ${current.jobTitle} has been removed.`,
      });
      window.location.href = "/roles";
    } catch (err) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      {/* Row 1: Company name + Pipeline badge */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="truncate text-2xl font-semibold tracking-tight">
          {current.companyName}
        </h1>
        {current.source === "pipeline_scan" && (
          <Badge
            variant="outline"
            className="border-blue-500/30 text-blue-400 bg-blue-500/10 text-xs flex items-center"
          >
            Pipeline Scan
          </Badge>
        )}
      </div>

      {/* Row 2: Role title + View links */}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-lg text-muted-foreground">{current.jobTitle}</p>
        {current.jobUrl && (
          <a
            href={current.jobUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-400 transition-colors hover:text-blue-300"
          >
            <ExternalLink className="size-3.5" />
            View Posting
          </a>
        )}
        {current.jobPostingPdfUrl && (
          <a
            href={current.jobPostingPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-emerald-400 transition-colors hover:text-emerald-300"
          >
            <FileText className="size-3.5" />
            PDF Snapshot
          </a>
        )}
      </div>

      {/* Row 3: Score KPIs */}
      {analysisData?.analysis && (
        <div className="flex flex-wrap items-stretch gap-4 border-t border-border/30 pt-3">
          <StatBlock
            value={analysisData.analysis.hireScore}
            label="Hire Likelihood"
            colorClass={getScoreTextColor(analysisData.analysis.hireScore)}
          />
          <StatBlock
            value={analysisData.analysis.compensationScore}
            label="Comp. Score"
            colorClass={getScoreTextColor(analysisData.analysis.compensationScore)}
          />
          <StatBlock
            value={formatCompactSalary(
              current.salaryMin,
              current.salaryMax,
              current.salaryCurrency ?? "USD",
            )}
            label="Salary Range"
            colorClass="text-foreground"
          />
        </div>
      )}

      {/* Row 4: Actions + Status + Delete */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/30 pt-3">
        {(() => {
          const token = parseGreenhouseToken(current.jobUrl);
          if (token && !trackedTokens.has(token)) {
            return (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-amber-500/30 text-amber-500 hover:bg-amber-500/10 font-medium transition-colors"
                disabled={promotingToken === token}
                onClick={async () => {
                  setPromotingToken(token);
                  try {
                    await apiPost("/api/pipeline/board-tokens", {
                      token,
                      companyName: current.companyName,
                      isActive: true,
                    });
                    setTrackedTokens((prev) => {
                      const next = new Set(prev);
                      next.add(token);
                      return next;
                    });
                    toast({
                      title: "Tracking Activated",
                      description: `Added '${current.companyName}' to active scans in Pipeline B tracker.`,
                    });
                  } catch (err) {
                    toast({
                      title: "Promotion Failed",
                      description: err instanceof Error ? err.message : "Unknown error",
                      variant: "destructive",
                    });
                  } finally {
                    setPromotingToken(null);
                  }
                }}
              >
                {promotingToken === token ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Award className="size-4" />
                )}
                Track Company in Pipeline B
              </Button>
            );
          }
          return null;
        })()}

        {/* Actions menu */}
        <RoleActionsDialog role={current} onRoleUpdate={handleRoleUpdate} />

        {/* View Report */}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => (window.location.href = `/roles/${current.id}/report`)}
        >
          <FileText className="size-4" />
          <span className="hidden sm:inline">Report</span>
        </Button>

        {/* Status dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" className="gap-1.5" disabled={isUpdating}>
                <StatusIcon className={`size-4 ${meta.color}`} />
                {isUpdating ? "Updating…" : meta.label}
                <ChevronDown className="size-3.5 opacity-50" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-48">
            {ACTIVE_STATUSES.map(([key, m]) => {
              const Icon = m.icon;
              return (
                <DropdownMenuItem
                  key={key}
                  className={`gap-2 ${current.status === key ? "bg-accent" : ""}`}
                  onClick={() => void updateStatus(key)}
                >
                  <Icon className={`size-4 ${m.color}`} />
                  {m.label}
                  {current.status === key && (
                    <span className="ml-auto text-xs text-muted-foreground">Current</span>
                  )}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            {TERMINAL_STATUSES.map(([key, m]) => {
              const Icon = m.icon;
              return (
                <DropdownMenuItem
                  key={key}
                  className={`gap-2 ${current.status === key ? "bg-accent" : ""}`}
                  onClick={() => void updateStatus(key)}
                >
                  <Icon className={`size-4 ${m.color}`} />
                  {m.label}
                  {current.status === key && (
                    <span className="ml-auto text-xs text-muted-foreground">Current</span>
                  )}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setShowDeleteDialog(true)}
        >
          <Trash2 className="size-4" />
          <span className="hidden sm:inline">Delete</span>
        </Button>
      </div>

      {/* Row 2: Stepper */}
      <div className="border-t border-border/50 pt-3">
        {isTerminal ? (
          // Terminal / system status — show badge instead of stepper
          <div className="flex items-center justify-center gap-2">
            <Badge variant="outline" className={`${meta.badgeClass} px-4 py-1.5 text-sm`}>
              <StatusIcon className="mr-1.5 size-4" />
              {meta.label}
            </Badge>
            {current.status === "processing_error" && (
              <span className="text-xs text-muted-foreground">
                Tasks require attention — check the Pipeline tab
              </span>
            )}
          </div>
        ) : (
          <Stepper activeStep={stepperActiveIdx} className="justify-center">
            {STEPPER_STEPS.map((step, idx) => {
              const stepMeta = STATUS_META[step]!;
              const StepIcon = stepMeta.icon;
              return (
                <StepperItem
                  key={step}
                  index={idx}
                  label={stepMeta.label}
                  icon={<StepIcon className="size-3" />}
                  isLast={idx === STEPPER_STEPS.length - 1}
                />
              );
            })}
          </Stepper>
        )}
      </div>

      {/* Status Transition Modal */}
      {transitionModal && (
        <StatusTransitionModal
          open={!!transitionModal}
          onOpenChange={(open) => !open && setTransitionModal(null)}
          role={current}
          fromStatus={current.status}
          toStatus={transitionModal.toStatus}
          toStatusLabel={transitionModal.toLabel}
          onTransitionComplete={(updated) => {
            setCurrent(updated);
            setTransitionModal(null);
          }}
        />
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Role</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <strong>
                {current.companyName} — {current.jobTitle}
              </strong>
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatBlock — compact score / value display
// ---------------------------------------------------------------------------

function StatBlock({
  value,
  label,
  colorClass,
  icon,
}: {
  value: number | string;
  label: string;
  colorClass: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-3">
      <div className="flex items-center gap-1">
        {icon}
        <span className={`text-2xl font-bold tabular-nums ${colorClass}`}>{value}</span>
      </div>
      <span className="mt-0.5 whitespace-nowrap text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
