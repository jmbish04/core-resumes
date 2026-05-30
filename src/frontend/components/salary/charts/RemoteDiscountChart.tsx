/**
 * @fileoverview Remote discount chart — grouped bars comparing Remote vs Local
 * median salary for each role type with delta annotations.
 */

import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, LabelList, Cell } from "recharts";

import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const chartConfig = {
  local: { label: "Local (SF)", color: "hsl(199, 89%, 48%)" },
  remote: { label: "Remote", color: "hsl(45, 93%, 47%)" },
} satisfies ChartConfig;

const fmt = (v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`);

export function RemoteDiscountChart({ data, roleTypes }: { data: any[]; roleTypes: string[] }) {
  const chartData = useMemo(() => {
    return roleTypes.map((role) => {
      const local = data.find((s) => s.roleType === role && s.metricKey === "local_market");
      const remote = data.find((s) => s.roleType === role && s.metricKey === "remote");

      const localMedian = local?.median ?? 0;
      const remoteMedian = remote?.median ?? 0;
      const delta =
        localMedian > 0 ? Math.round(((localMedian - remoteMedian) / localMedian) * 100) : 0;

      return {
        role: role.length > 14 ? role.slice(0, 12) + "…" : role,
        fullRole: role,
        local: localMedian,
        remote: remoteMedian,
        delta,
      };
    }).filter((d) => d.local > 0 || d.remote > 0);
  }, [data, roleTypes]);

  if (chartData.length === 0) {
    return (
      <Card className="border-border/40 bg-card/60 p-5">
        <h3 className="text-sm font-semibold mb-1">Remote vs Local Comparison</h3>
        <p className="text-xs text-muted-foreground">
          No remote/local salary data available for comparison
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-border/40 bg-card/60 p-5">
      <h3 className="text-sm font-semibold">Remote vs Local (SF) Median</h3>
      <p className="mt-0.5 text-xs text-muted-foreground mb-4">
        Side-by-side comparison per role type
      </p>

      <ChartContainer config={chartConfig} className="h-[280px] w-full">
        <BarChart data={chartData} margin={{ top: 16, right: 12, bottom: 4, left: 0 }}>
          <XAxis
            dataKey="role"
            tickLine={false}
            axisLine={{ stroke: "hsl(var(--border))", strokeWidth: 0.5 }}
            tick={{ fontSize: 11, fill: "#E5E7EB" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "#E5E7EB" }}
            tickFormatter={(v) => fmt(v)}
            width={50}
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value, name) => [fmt(value as number), name]}
              />
            }
          />
          <Bar dataKey="local" fill="hsl(199, 89%, 48%)" radius={[4, 4, 0, 0]} barSize={18} name="Local (SF)">
            <LabelList
              dataKey="local"
              position="top"
              fill="hsl(199, 89%, 58%)"
              fontSize={10}
              fontWeight={600}
              formatter={(v: unknown) => fmt(Number(v))}
            />
          </Bar>
          <Bar dataKey="remote" fill="hsl(45, 93%, 47%)" radius={[4, 4, 0, 0]} barSize={18} name="Remote">
            <LabelList
              dataKey="delta"
              position="top"
              fill="#E5E7EB"
              fontSize={9}
              formatter={(v: unknown) => { const n = Number(v); return n > 0 ? `-${n}%` : `+${Math.abs(n)}%`; }}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </Card>
  );
}
