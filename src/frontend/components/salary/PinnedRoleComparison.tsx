/**
 * @fileoverview Pinned role comparison cards — shows side-by-side salary data
 * for roles the user has pinned for cross-comparison.
 */

import { Pin, X, DollarSign } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type PinnedRole = {
  id: number;
  roleId: string;
  roleTitle: string;
  companyName: string;
  salaryMin: number | null;
  salaryMax: number | null;
};

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

const COLORS = [
  "border-emerald-500/30 bg-emerald-500/5",
  "border-sky-500/30 bg-sky-500/5",
  "border-amber-500/30 bg-amber-500/5",
  "border-violet-500/30 bg-violet-500/5",
  "border-rose-500/30 bg-rose-500/5",
];

export function PinnedRoleComparison({
  pinnedRoles,
  onUnpin,
  marketStats,
}: {
  pinnedRoles: PinnedRole[];
  onUnpin: (id: number) => void;
  marketStats: any[];
}) {
  if (pinnedRoles.length === 0) return null;

  // Get national median for comparison
  const nationalMedians = marketStats
    .filter((s: any) => s.metricKey === "national")
    .map((s: any) => s.median);
  const avgNational =
    nationalMedians.length > 0
      ? Math.round(nationalMedians.reduce((a: number, b: number) => a + b, 0) / nationalMedians.length)
      : null;

  return (
    <Card className="border-border/40 bg-card/60 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Pin className="size-4 text-sky-400" />
          <h3 className="text-sm font-semibold">Pinned Role Comparison</h3>
          <Badge variant="secondary" className="text-[10px]">
            {pinnedRoles.length} pinned
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {pinnedRoles.map((role, i) => {
          const midpoint =
            role.salaryMin && role.salaryMax
              ? Math.round((role.salaryMin + role.salaryMax) / 2)
              : role.salaryMin || role.salaryMax;
          const vsNational =
            midpoint && avgNational
              ? Math.round(((midpoint - avgNational) / avgNational) * 100)
              : null;

          return (
            <div
              key={role.id}
              className={`rounded-lg border p-3 ${COLORS[i % COLORS.length]} transition-all`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{role.companyName}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{role.roleTitle}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onUnpin(role.id)}
                >
                  <X className="size-3" />
                </Button>
              </div>

              <div className="mt-3 flex items-baseline gap-1.5">
                <DollarSign className="size-3 text-muted-foreground" />
                {role.salaryMin || role.salaryMax ? (
                  <span className="text-sm font-bold tabular-nums">
                    {role.salaryMin ? fmt(role.salaryMin) : "?"} – {role.salaryMax ? fmt(role.salaryMax) : "?"}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground italic">No salary data</span>
                )}
              </div>

              {vsNational !== null && (
                <div className="mt-2">
                  <span
                    className={`text-[10px] font-semibold ${vsNational >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                  >
                    {vsNational >= 0 ? "+" : ""}
                    {vsNational}% vs national median
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
