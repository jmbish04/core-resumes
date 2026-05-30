/**
 * @fileoverview Top companies chart — sorted horizontal bars showing the
 * highest-paying companies by median salary for the active role filter.
 */

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, LabelList, Cell, ResponsiveContainer } from "recharts";

import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const chartConfig = {
  median: { label: "Median Salary", color: "hsl(152, 60%, 50%)" },
} satisfies ChartConfig;

const fmt = (v: number) =>
  v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`;

export function TopCompaniesChart({ data }: { data: any[] }) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // Group by company, compute average median
    const grouped: Record<string, { sum: number; count: number }> = {};
    for (const entry of data) {
      const company = entry.companyName || "unknown";
      if (!grouped[company]) grouped[company] = { sum: 0, count: 0 };
      grouped[company].sum += entry.median || 0;
      grouped[company].count += 1;
    }

    return Object.entries(grouped)
      .map(([name, agg]) => ({
        company: name.length > 18 ? name.slice(0, 16) + "…" : name,
        fullCompany: name,
        median: Math.round(agg.sum / agg.count),
        count: agg.count,
      }))
      .sort((a, b) => b.median - a.median)
      .slice(0, 15);
  }, [data]);

  if (chartData.length === 0) {
    return (
      <Card className="border-border/40 bg-card/60 p-5">
        <h3 className="text-sm font-semibold mb-1">Top Companies by Salary</h3>
        <p className="text-xs text-muted-foreground">No company salary data available</p>
      </Card>
    );
  }

  const maxMedian = chartData[0]?.median ?? 0;

  return (
    <Card className="border-border/40 bg-card/60 p-5">
      <h3 className="text-sm font-semibold">Top Companies by Median Salary</h3>
      <p className="mt-0.5 text-xs text-muted-foreground mb-4">
        {chartData.length} highest-paying companies for selected role
      </p>

      <ChartContainer config={chartConfig} className="h-[380px] w-full">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 4, right: 80, bottom: 4, left: 0 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="company"
            width={130}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#E5E7EB" }}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => [fmt(value as number), "Median"]}
              />
            }
          />
          <Bar dataKey="median" radius={[0, 4, 4, 0]} barSize={16} name="Median Salary">
            {chartData.map((entry, i) => {
               const ratio = entry.median / maxMedian;
               return (
                 <Cell
                   key={i}
                   fill={
                     ratio >= 0.9
                       ? "hsl(152, 65%, 45%)"
                       : ratio >= 0.75
                         ? "hsl(152, 55%, 50%)"
                         : ratio >= 0.6
                           ? "hsl(152, 45%, 55%)"
                           : "hsl(152, 35%, 60%)"
                   }
                 />
               );
            })}
            <LabelList
              dataKey="median"
              position="right"
              fill="#E5E7EB"
              fontSize={11}
              fontWeight={600}
              formatter={(v: unknown) => fmt(Number(v))}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </Card>
  );
}
