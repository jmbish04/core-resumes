/**
 * @fileoverview Skeleton loading placeholders for the Salary Intelligence
 * dashboard — matches the exact grid layout so content doesn't shift on load.
 */

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// ---------------------------------------------------------------------------
// Individual chart skeletons
// ---------------------------------------------------------------------------

/** KPI insight cards — 4 metric cards in a responsive grid. */
export function KPICardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="border-border/40 bg-card/60 p-4 space-y-3">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-3 w-16" />
        </Card>
      ))}
    </div>
  );
}

/** Generic chart card with pulsing bar placeholders. */
export function ChartCardSkeleton({ height = "h-[280px]" }: { height?: string }) {
  return (
    <Card className="border-border/40 bg-card/60 p-5 space-y-4">
      {/* Title */}
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56" />
      </div>
      {/* Chart area */}
      <div className={`${height} flex items-end gap-2 px-4 pt-4`}>
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t-md"
            style={{ height: `${30 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    </Card>
  );
}

/** Map-style skeleton for the geographic chart. */
export function MapSkeleton() {
  return (
    <Card className="border-border/40 bg-card/60 p-5 space-y-4">
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-64" />
      </div>
      <div className="h-[380px] relative rounded-lg overflow-hidden">
        <Skeleton className="absolute inset-0" />
        {/* Fake marker dots */}
        <div className="absolute inset-0 flex items-center justify-center gap-8 opacity-30">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton
              key={i}
              className="size-6 rounded-full"
              style={{
                position: "absolute",
                top: `${20 + Math.random() * 50}%`,
                left: `${15 + Math.random() * 60}%`,
              }}
            />
          ))}
        </div>
      </div>
    </Card>
  );
}

/** Full-width heatmap skeleton. */
export function HeatmapSkeleton() {
  return (
    <Card className="border-border/40 bg-card/60 p-5 space-y-4">
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-3 w-60" />
      </div>
      <div className="grid grid-cols-6 gap-1.5 h-[200px]">
        {Array.from({ length: 30 }).map((_, i) => (
          <Skeleton
            key={i}
            className="rounded-sm"
            style={{ opacity: 0.3 + Math.random() * 0.5 }}
          />
        ))}
      </div>
    </Card>
  );
}

/** AI Insights card skeleton. */
export function AIInsightsSkeleton() {
  return (
    <Card className="border-border/40 bg-card/60 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="size-5 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-4/6" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Composed dashboard skeleton — mirrors the full grid layout
// ---------------------------------------------------------------------------

/**
 * Full dashboard skeleton that replaces the old `<Loader2>` spinner.
 * Matches the exact layout of `SalaryIntelligenceDashboard` chart rows.
 */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="size-6 rounded" />
            <Skeleton className="h-7 w-56" />
          </div>
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>

      {/* Filter bar skeleton */}
      <Card className="border-border/50 bg-card/50 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-8 w-40 rounded-md" />
          <Skeleton className="h-6 w-px" />
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-8" />
            <Skeleton className="h-7 w-48 rounded-md" />
          </div>
          <Skeleton className="h-6 w-px" />
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-10" />
            <Skeleton className="h-7 w-28 rounded-md" />
          </div>
          <Skeleton className="h-6 w-px" />
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-3 w-8" />
            <Skeleton className="h-7 w-24 rounded-md" />
          </div>
        </div>
      </Card>

      {/* KPI Cards */}
      <KPICardsSkeleton />

      {/* Row 1: Percentile Range + Remote Discount */}
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCardSkeleton height="h-[300px]" />
        <ChartCardSkeleton height="h-[300px]" />
      </div>

      {/* Row 2: Top Companies + Geographic */}
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCardSkeleton height="h-[380px]" />
        <MapSkeleton />
      </div>

      {/* Row 3: Company Heatmap (full width) */}
      <HeatmapSkeleton />

      {/* Row 4: Seniority Ladder + Trend Sparklines */}
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCardSkeleton height="h-[280px]" />
        <ChartCardSkeleton height="h-[200px]" />
      </div>

      {/* Row 5: AI Insights */}
      <AIInsightsSkeleton />
    </div>
  );
}
