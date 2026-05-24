/**
 * @fileoverview RoleStatusLog — vertical timeline of status transitions
 * and activity logs for a role.
 */

import {
  AlertTriangle,
  Archive,
  Award,
  Bot,
  CheckCircle2,
  Clock,
  Handshake,
  LogOut,
  Mail,
  Mic,
  Monitor,
  Send,
  Timer,
  User,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatusLogEntry {
  id: number;
  roleId: string;
  previousStatus: string | null;
  newStatus: string;
  trigger: string;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface ActivityLogEntry {
  id: string;
  roleId: string | null;
  category: string;
  action: string;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Status icon/color mapping
// ---------------------------------------------------------------------------

const STATUS_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  preparing: Clock,
  processing_error: AlertTriangle,
  posting_expired: Timer,
  applied: Send,
  interviewing: Mic,
  offer: CheckCircle2,
  negotiating: Handshake,
  accepted: Award,
  rejected: XCircle,
  withdrawn: LogOut,
  archived: Archive,
};

const STATUS_COLORS: Record<string, string> = {
  preparing: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  processing_error: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  posting_expired: "text-zinc-400 bg-zinc-500/10 border-zinc-500/30",
  applied: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
  interviewing: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  offer: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  negotiating: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  accepted: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  rejected: "text-red-400 bg-red-500/10 border-red-500/30",
  withdrawn: "text-slate-400 bg-slate-500/10 border-slate-500/30",
  archived: "text-zinc-500 bg-zinc-500/10 border-zinc-500/30",
};

const TRIGGER_META: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; label: string; color: string }
> = {
  user: { icon: User, label: "Manual", color: "text-blue-400 bg-blue-500/10" },
  agent: { icon: Bot, label: "Agent", color: "text-violet-400 bg-violet-500/10" },
  email_inference: { icon: Mail, label: "Email AI", color: "text-amber-400 bg-amber-500/10" },
  system: { icon: Monitor, label: "System", color: "text-zinc-400 bg-zinc-500/10" },
};

const CATEGORY_COLORS: Record<string, string> = {
  agentic: "text-violet-400 bg-violet-500/10 border-violet-500/30",
  user_action: "text-blue-400 bg-blue-500/10 border-blue-500/30",
  email: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  notebooklm: "text-teal-400 bg-teal-500/10 border-teal-500/30",
  document: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  system: "text-zinc-400 bg-zinc-500/10 border-zinc-500/30",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RoleStatusLog({ roleId }: { roleId: string }) {
  const [statusLog, setStatusLog] = useState<StatusLogEntry[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const [statusRes, activityRes] = await Promise.all([
          fetch(`/api/roles/${roleId}/status-log`),
          fetch(`/api/roles/${roleId}/logs?limit=50`),
        ]);

        if (statusRes.ok) setStatusLog(await statusRes.json());
        if (activityRes.ok) setActivityLog(await activityRes.json());
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, [roleId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  // Merge and sort both logs by createdAt desc
  const mergedEntries = [
    ...statusLog.map((e) => ({
      type: "status" as const,
      id: `status-${e.id}`,
      createdAt: e.createdAt,
      data: e,
    })),
    ...activityLog.map((e) => ({
      type: "activity" as const,
      id: `activity-${e.id}`,
      createdAt: e.createdAt,
      data: e,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (mergedEntries.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No activity recorded yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Activity Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[15px] top-0 bottom-0 w-px bg-border/40" />

            <div className="space-y-3">
              {mergedEntries.map((entry) => {
                if (entry.type === "status") {
                  return <StatusLogItem key={entry.id} entry={entry.data as StatusLogEntry} />;
                }
                return <ActivityLogItem key={entry.id} entry={entry.data as ActivityLogEntry} />;
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status log item
// ---------------------------------------------------------------------------

function StatusLogItem({ entry }: { entry: StatusLogEntry }) {
  const NewIcon = STATUS_ICONS[entry.newStatus] ?? Clock;
  const statusColor = STATUS_COLORS[entry.newStatus] ?? STATUS_COLORS.preparing!;
  const trigger = TRIGGER_META[entry.trigger] ?? TRIGGER_META.system!;
  const TriggerIcon = trigger.icon;
  const prevLabel = entry.previousStatus
    ? entry.previousStatus.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "—";
  const newLabel = entry.newStatus.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="relative flex items-start gap-3 pl-[6px]">
      <div
        className={`z-10 flex size-[20px] shrink-0 items-center justify-center rounded-full border ${statusColor}`}
      >
        <NewIcon className="size-3" />
      </div>
      <div className="flex flex-1 flex-col gap-1 pb-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">
            {prevLabel} → {newLabel}
          </span>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${trigger.color}`}>
            <TriggerIcon className="mr-0.5 size-2.5" />
            {trigger.label}
          </Badge>
        </div>
        {entry.notes && (
          <div
            className="text-xs text-muted-foreground rounded bg-muted/30 px-2 py-1.5"
            dangerouslySetInnerHTML={{ __html: entry.notes }}
          />
        )}
        <span className="text-[10px] text-muted-foreground/60" suppressHydrationWarning>
          {formatTimestamp(entry.createdAt)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity log item
// ---------------------------------------------------------------------------

function ActivityLogItem({ entry }: { entry: ActivityLogEntry }) {
  const catColor = CATEGORY_COLORS[entry.category] ?? CATEGORY_COLORS.system!;

  return (
    <div className="relative flex items-start gap-3 pl-[6px]">
      <div
        className={`z-10 flex size-[20px] shrink-0 items-center justify-center rounded-full border ${catColor}`}
      >
        <div className="size-1.5 rounded-full bg-current" />
      </div>
      <div className="flex flex-1 flex-col gap-0.5 pb-1">
        <div className="flex items-center gap-2">
          <span className="text-sm">{entry.message}</span>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${catColor}`}>
            {entry.category.replace(/_/g, " ")}
          </Badge>
        </div>
        <span className="text-[10px] text-muted-foreground/60" suppressHydrationWarning>
          {formatTimestamp(entry.createdAt)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: string | number): string {
  try {
    const date = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}
