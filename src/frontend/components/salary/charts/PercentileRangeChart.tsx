/**
 * @fileoverview Percentile range chart — horizontal bars showing P25-P50-P75
 * salary ranges for each role type across metric categories.
 */

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, LabelList } from "recharts";

import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { PercentileInfoButton } from "../PercentileInfoModal";

const COLORS = {
  p25: "hsl(152, 60%, 45%)",
  median: "hsl(152, 70%, 55%)",
  p75: "hsl(152, 50%, 65%)",
  range: "hsl(152, 60%, 50%)",
};

const chartConfig = {
  p25: { label: "P25", color: COLORS.p25 },
  median: { label: "Median", color: COLORS.median },
  p75: { label: "P75", color: COLORS.p75 },
} satisfies ChartConfig;

const fmt = (v: number) =>
  v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`;

export function PercentileRangeChart({ data }: { data: any[] }) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Group by metricLabel and show ranges
    const grouped: Record<string, { p25: number; median: number; p75: number; samples: number; label: string }> = {};

    for (const stat of data) {
      const key = stat.metricLabel || stat.metricKey;
      if (!grouped[key]) {
        grouped[key] = { p25: 0, median: 0, p75: 0, samples: 0, label: key };
      }
      grouped[key].p25 += stat.p25 * stat.sampleSize;
      grouped[key].median += stat.median * stat.sampleSize;
      grouped[key].p75 += stat.p75 * stat.sampleSize;
      grouped[key].samples += stat.sampleSize;
    }

    return Object.values(grouped)
      .map((g) => ({
        name: g.label,
        p25: Math.round(g.p25 / g.samples),
        median: Math.round(g.median / g.samples),
        p75: Math.round(g.p75 / g.samples),
        range: Math.round(g.p75 / g.samples) - Math.round(g.p25 / g.samples),
        samples: g.samples,
      }))
      .sort((a, b) => b.median - a.median);
  }, [data]);

  if (chartData.length === 0) {
    return (
      <Card className="border-border/40 bg-card/60 p-5">
        <h3 className="text-sm font-semibold mb-1">Salary Percentile Ranges</h3>
        <p className="text-xs text-muted-foreground">No percentile data available</p>
      </Card>
    );
  }

  return (
    <Card className="border-border/40 bg-card/60 p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Salary Percentile Ranges</h3>
          <p className="mt-0.5 text-xs text-muted-foreground mb-4">
            P25 → Median → P75 by market segment ({chartData.reduce((s, d) => s + d.samples, 0).toLocaleString()} samples)
          </p>
        </div>
        <PercentileInfoButton label="What do these mean?" />
      </div>

      <ChartContainer config={chartConfig} className="h-[280px] w-full">
        <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 80, bottom: 4, left: 0 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 12, fill: "#E5E7EB" }}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => [fmt(value as number), name]}
              />
            }
          />
          <Bar dataKey="p25" fill={COLORS.p25} radius={[4, 0, 0, 4]} barSize={16} name="P25">
            <LabelList
              dataKey="p25"
              position="insideLeft"
              fill="#FFFFFF"
              fontSize={10}
              formatter={(v: unknown) => fmt(Number(v))}
            />
          </Bar>
          <Bar dataKey="median" fill={COLORS.median} barSize={16} name="Median" stackId="range">
            <LabelList
              dataKey="median"
              position="center"
              fill="#FFFFFF"
              fontSize={10}
              fontWeight={700}
              formatter={(v: unknown) => fmt(Number(v))}
            />
          </Bar>
          <Bar dataKey="p75" fill={COLORS.p75} radius={[0, 4, 4, 0]} barSize={16} name="P75">
            <LabelList
              dataKey="p75"
              position="right"
              fill="#E5E7EB"
              fontSize={11}
              formatter={(v: unknown) => fmt(Number(v))}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </Card>
  );
}
