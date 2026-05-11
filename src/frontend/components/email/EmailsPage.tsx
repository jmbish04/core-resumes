/**
 * @fileoverview Global Emails page — aggregates all inbound emails across all
 * roles. Shows stats cards at the top and the reusable EmailInbox widget below.
 */

import {
  AlertTriangle,
  Bot,
  Inbox,
  Link2,
  Loader2,
  MailOpen,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { apiGet, toast } from "@/lib/api-client";

import { EmailInbox } from "./EmailInbox";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EmailStats = {
  total: number;
  unread: number;
  byStatus: Record<string, number>;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmailsPage() {
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const data = await apiGet<EmailStats>("/api/emails/stats");
      setStats(data);
    } catch {
      toast({ title: "Failed to load email stats", variant: "destructive" });
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <div className="grid gap-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Emails</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All inbound recruiting emails. Associate orphaned emails with roles or triage unmatched messages.
        </p>
      </div>

      {/* Stats cards */}
      {statsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="rounded-lg">
              <CardContent className="p-4">
                <div className="h-10 rounded-md bg-muted/50 animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : stats ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Total"
            value={stats.total}
            icon={<Inbox className="size-4 text-muted-foreground" />}
          />
          <StatCard
            label="Needs Attention"
            value={stats.unread}
            icon={<AlertTriangle className="size-4 text-amber-400" />}
            highlight={stats.unread > 0}
          />
          <StatCard
            label="Associated"
            value={stats.byStatus["associated"] ?? 0}
            icon={<Link2 className="size-4 text-emerald-400" />}
          />
          <StatCard
            label="Actioned"
            value={stats.byStatus["action_taken"] ?? 0}
            icon={<Bot className="size-4 text-blue-400" />}
          />
          <StatCard
            label="Responded"
            value={stats.byStatus["responded"] ?? 0}
            icon={<MailOpen className="size-4 text-blue-400" />}
          />
        </div>
      ) : null}

      {/* Inbox widget — global (no filter) */}
      <EmailInbox showForwardBanner maxHeight="calc(100vh - 340px)" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

function StatCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <Card className={`rounded-lg ${highlight ? "border-amber-400/40 bg-amber-400/5" : ""}`}>
      <CardContent className="flex items-center gap-3 p-4">
        {icon}
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
