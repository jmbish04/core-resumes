"use client";

import { useState, useMemo } from "react";
import { Clock, Train, Car, Bus, BrainCircuit, ChevronUp, ChevronDown } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CommuteRow = {
  departureTime: string;
  mode: string;
  durationMinutes: number | null;
  monthlyCost: number | null;
};

// ---------------------------------------------------------------------------
// Mode display config — icon + color mapping
// ---------------------------------------------------------------------------

const MODE_CONFIG: Record<string, { icon: typeof Train; color: string; chartVar: string }> = {
  "BART + Walk": { icon: Train, color: "text-emerald-500", chartVar: "var(--chart-1)" },
  "Driving": { icon: Car, color: "text-violet-500", chartVar: "var(--chart-2)" },
  // "Driving": { icon: Car, color: "text-violet-500", chartVar: "var(--chart-2)" },
  "Muni + Walk": { icon: Bus, color: "text-amber-500", chartVar: "var(--chart-3)" },
};

function getModeConfig(mode: string) {
  return MODE_CONFIG[mode] ?? { icon: Bus, color: "text-muted-foreground", chartVar: "var(--chart-4)" };
}

// ---------------------------------------------------------------------------
// CommuteModal
// ---------------------------------------------------------------------------

export function CommuteModal({ commuteData }: { commuteData: CommuteRow[] }) {
  const [open, setOpen] = useState(false);
  const [isInsightExpanded, setIsInsightExpanded] = useState(false);

  // ---- Unique modes ----
  const modes = useMemo(() => {
    const set = new Set<string>();
    commuteData.forEach((r) => set.add(r.mode));
    return Array.from(set);
  }, [commuteData]);

  // ---- Mode stats (min/mean/max/cost) for the summary table ----
  const modeStats = useMemo(() => {
    const map = new Map<string, { durations: number[]; cost: number | null }>();

    commuteData.forEach((row) => {
      if (!map.has(row.mode)) {
        map.set(row.mode, { durations: [], cost: row.monthlyCost });
      }
      if (row.durationMinutes != null) {
        map.get(row.mode)!.durations.push(row.durationMinutes);
      }
      if (row.monthlyCost != null && map.get(row.mode)!.cost == null) {
        map.get(row.mode)!.cost = row.monthlyCost;
      }
    });

    return Array.from(map.entries()).map(([mode, data]) => {
      const sorted = [...data.durations].sort((a, b) => a - b);
      const min = sorted[0] ?? null;
      const max = sorted[sorted.length - 1] ?? null;
      const mean = sorted.length
        ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length)
        : null;
      return { mode, min, max, mean, cost: data.cost };
    });
  }, [commuteData]);

  // ---- Departure times sorted + split AM/PM ----
  const departureTimes = useMemo(() => {
    const set = new Set<string>();
    commuteData.forEach((r) => {
      if (typeof r.departureTime === "string" && r.departureTime) {
        set.add(r.departureTime);
      }
    });
    // Sort chronologically: parse time strings like "9:00 AM", "4:30 PM" into comparable minutes
    return Array.from(set).sort((a, b) => {
      const parseTime = (t: string): number => {
        const match = t.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
        if (!match) return 0;
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const period = match[3].toUpperCase();
        if (period === "PM" && hours !== 12) hours += 12;
        if (period === "AM" && hours === 12) hours = 0;
        return hours * 60 + minutes;
      };
      return parseTime(a) - parseTime(b);
    });
  }, [commuteData]);

  // ---- Build chart data for morning (AM) ----
  const morningData = useMemo(() => {
    return departureTimes
      .filter((t) => t.toLowerCase().includes("am"))
      .map((time) => {
        const point: Record<string, string | number | null> = { time };
        modes.forEach((mode) => {
          const match = commuteData.find(
            (x) => x.mode === mode && x.departureTime === time,
          );
          point[mode] = match?.durationMinutes ?? null;
        });
        return point;
      });
  }, [departureTimes, modes, commuteData]);

  // ---- Build chart data for evening (PM) ----
  const eveningData = useMemo(() => {
    return departureTimes
      .filter((t) => t.toLowerCase().includes("pm"))
      .map((time) => {
        const point: Record<string, string | number | null> = { time };
        modes.forEach((mode) => {
          const match = commuteData.find(
            (x) => x.mode === mode && x.departureTime === time,
          );
          point[mode] = match?.durationMinutes ?? null;
        });
        return point;
      });
  }, [departureTimes, modes, commuteData]);

  // ---- Chart config (shadcn pattern) ----
  const chartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    modes.forEach((mode, index) => {
      config[mode] = { label: mode, color: `hsl(var(--chart-${index + 1}))` };
    });
    return config satisfies ChartConfig;
  }, [modes]);

  // ---- Render a single line chart ----
  function renderLineChart(
    data: Record<string, string | number | null>[],
    title: string,
    timeRange: string,
  ) {
    if (data.length === 0) {
      return (
        <div className="flex items-center justify-center h-[300px] border rounded-lg bg-muted/10">
          <p className="text-sm text-muted-foreground">No {title.toLowerCase()} data available</p>
        </div>
      );
    }

    return (
      <div className="border rounded-lg p-5 bg-muted/5">
        <h3 className="text-sm font-medium text-muted-foreground mb-6 text-center">
          {title} ({timeRange})
        </h3>
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <LineChart
            accessibilityLayer
            data={data}
            margin={{ left: 12, right: 12, top: 5, bottom: 5 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="time"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) =>
                typeof value === "string" ? value.replace(/:00\s/, " ") : value
              }
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}m`}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent />}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              formatter={(value: string) => <span className="text-sm text-muted-foreground">{value}</span>}
            />
            {modes.map((mode, index) => (
              <Line
                key={mode}
                dataKey={mode}
                type="monotone"
                stroke={`hsl(var(--chart-${index + 1}))`}
                strokeWidth={2}
                dot={{ r: 4, strokeWidth: 2 }}
                activeDot={{ r: 6 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ChartContainer>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {/* ---- Summary Table (always visible) ---- */}
      <h4 className="text-sm font-semibold mb-3">Commute Options</h4>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-medium">Mode</TableHead>
              <TableHead className="font-medium">Min Duration</TableHead>
              <TableHead className="font-medium">Mean Duration</TableHead>
              <TableHead className="font-medium">Max Duration</TableHead>
              <TableHead className="font-medium">Est. Monthly Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modeStats.map((stat) => {
              const mc = getModeConfig(stat.mode);
              const ModeIcon = mc.icon;
              return (
                <TableRow key={stat.mode}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      <ModeIcon className={`size-4 ${mc.color}`} />
                      {stat.mode}
                    </span>
                  </TableCell>
                  <TableCell>{stat.min != null ? `${stat.min}m` : "—"}</TableCell>
                  <TableCell>{stat.mean != null ? `${stat.mean}m` : "—"}</TableCell>
                  <TableCell
                    className={
                      stat.max != null && stat.max >= 60
                        ? "text-red-400 font-medium"
                        : ""
                    }
                  >
                    {stat.max != null ? `${stat.max}m` : "—"}
                  </TableCell>
                  <TableCell>
                    {stat.cost != null ? `$${stat.cost.toLocaleString()}/mo` : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ---- Open Modal Button ---- */}
      <Button variant="outline" className="w-full mt-3" onClick={() => setOpen(true)}>
        <Clock className="size-4 mr-2" />
        View Commute Details
      </Button>

      {/* ---- Detail Modal ---- */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-5xl max-h-[85vh] overflow-auto p-0"
          onClose={() => setOpen(false)}
        >
          {/* Header */}
          <DialogHeader className="p-6 pb-0">
            <div className="flex items-center gap-3">
              <Clock className="size-5 text-muted-foreground" />
              <DialogTitle className="text-xl font-semibold tracking-tight">
                Commute Analysis Details
              </DialogTitle>
            </div>
          </DialogHeader>

          {/* Charts — side by side on xl, stacked on mobile */}
          <div className="p-6">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {renderLineChart(morningData, "Morning Commute Duration", "7 AM – 10 AM")}
              {renderLineChart(eveningData, "Evening Commute Duration", "3 PM – 6 PM")}
            </div>
          </div>

          {/* Pivot Table — Mode × Departure Time (duration only, no cost) */}
          <div className="px-6 pb-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-3">
              Duration Breakdown by Departure Time
            </h3>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-medium">Mode</TableHead>
                    {departureTimes.map((t) => (
                      <TableHead key={t} className="text-right font-medium">
                        {t}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {modes.map((mode) => {
                    const mc = getModeConfig(mode);
                    const ModeIcon = mc.icon;
                    return (
                      <TableRow key={mode}>
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-2">
                            <ModeIcon className={`size-4 ${mc.color}`} />
                            {mode}
                          </span>
                        </TableCell>
                        {departureTimes.map((t) => {
                          const match = commuteData.find(
                            (x) => x.mode === mode && x.departureTime === t,
                          );
                          return (
                            <TableCell key={t} className="text-right">
                              {match?.durationMinutes != null
                                ? `${match.durationMinutes}m`
                                : "—"}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* AI Assessment Footer (Expandable) */}
          <div className="border-t bg-muted/20 p-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0 mt-0.5">
                <BrainCircuit className="size-5 text-primary" />
              </div>
              <div className="flex-1">
                <div
                  className="flex items-center justify-between cursor-pointer group"
                  onClick={() => setIsInsightExpanded(!isInsightExpanded)}
                >
                  <h4 className="font-semibold">AI Assessment: Commute Feasibility</h4>
                  <button className="text-muted-foreground group-hover:text-foreground transition-colors bg-muted/50 p-1 rounded-md">
                    {isInsightExpanded ? (
                      <ChevronUp className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                  </button>
                </div>

                {/* Always-visible headline */}
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  <strong className="text-foreground">Summary:</strong>{" "}
                  {modeStats.length > 0
                    ? `${modeStats.length} commute mode${modeStats.length > 1 ? "s" : ""} analyzed. ` +
                      `Fastest option: ${modeStats.reduce((a, b) => ((a.min ?? 999) < (b.min ?? 999) ? a : b)).mode} ` +
                      `at ${modeStats.reduce((a, b) => ((a.min ?? 999) < (b.min ?? 999) ? a : b)).min}m. ` +
                      `Most affordable: ${modeStats.reduce((a, b) => ((a.cost ?? 999) < (b.cost ?? 999) ? a : b)).mode} ` +
                      `at $${modeStats.reduce((a, b) => ((a.cost ?? 999) < (b.cost ?? 999) ? a : b)).cost?.toLocaleString()}/mo.`
                    : "No commute data available for assessment."}
                </p>

                {/* Expandable details */}
                {isInsightExpanded && (
                  <div className="mt-4 pt-4 border-t border-border/50 text-sm text-muted-foreground space-y-3 leading-relaxed">
                    {modeStats.map((stat) => {
                      const mc = getModeConfig(stat.mode);
                      const ModeIcon = mc.icon;
                      return (
                        <p key={stat.mode}>
                          <span className="inline-flex items-center gap-1.5">
                            <ModeIcon className={`size-3.5 ${mc.color}`} />
                            <strong className="text-foreground">{stat.mode}:</strong>
                          </span>{" "}
                          {stat.min === stat.max
                            ? `Consistent ${stat.min}m commute regardless of departure time.`
                            : `Ranges from ${stat.min}m to ${stat.max}m depending on departure time (avg ${stat.mean}m).`}
                          {stat.cost != null && ` Estimated monthly cost: $${stat.cost.toLocaleString()}.`}
                        </p>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
