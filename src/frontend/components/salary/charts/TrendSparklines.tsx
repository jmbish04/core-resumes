/**
 * @fileoverview Trend sparklines — small multiples showing salary movement
 * across snapshots for each role type.
 */

import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

import { Card } from "@/components/ui/card";

const LINE_COLORS = [
  "hsl(152, 60%, 50%)",
  "hsl(199, 89%, 48%)",
  "hsl(45, 93%, 47%)",
  "hsl(280, 60%, 55%)",
  "hsl(350, 70%, 55%)",
];

const fmt = (v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`);

export function TrendSparklines({ data, roleTypes }: { data: any[]; roleTypes: string[] }) {
  const sparklines = useMemo(() => {
    if (!data || data.length < 2) return [];

    return roleTypes.slice(0, 5).map((role, i) => {
      const points = data
        .map((snap) => {
          // Find national median for this role in this snapshot
          const roleData = snap.roles?.[role];
          const national = roleData?.national;
          if (!national) return null;

          return {
            ts: new Date(snap.timestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            median: national.median,
          };
        })
        .filter(Boolean) as { ts: string; median: number }[];

      const first = points[0]?.median ?? 0;
      const last = points[points.length - 1]?.median ?? 0;
      const change = first > 0 ? Math.round(((last - first) / first) * 100) : 0;

      return {
        role,
        points,
        change,
        color: LINE_COLORS[i % LINE_COLORS.length],
        latest: last,
      };
    }).filter((s) => s.points.length >= 2);
  }, [data, roleTypes]);

  if (sparklines.length === 0) {
    return (
      <Card className="border-border/40 bg-card/60 p-5">
        <h3 className="text-sm font-semibold mb-1">Salary Trends Over Time</h3>
        <p className="text-xs text-muted-foreground">
          Need ≥ 2 snapshots to show trends. Data populates on each sync run.
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-border/40 bg-card/60 p-5">
      <h3 className="text-sm font-semibold">Salary Trends Over Time</h3>
      <p className="mt-0.5 text-xs text-muted-foreground mb-4">
        National median movement across {data.length} snapshots
      </p>

      <div className="grid gap-4">
        {sparklines.map((spark) => (
          <div key={spark.role} className="flex items-center gap-4">
            {/* Label */}
            <div className="w-28 shrink-0">
              <p className="text-xs font-medium capitalize truncate">{spark.role}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] tabular-nums font-bold">{fmt(spark.latest)}</span>
                <span
                  className={`text-[10px] font-semibold ${spark.change >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                >
                  {spark.change >= 0 ? "↑" : "↓"} {Math.abs(spark.change)}%
                </span>
              </div>
            </div>

            {/* Sparkline */}
            <div className="flex-1 h-10">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={spark.points} margin={{ top: 2, right: 4, bottom: 2, left: 4 }}>
                  <Line
                    type="monotone"
                    dataKey="median"
                    stroke={spark.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3, fill: spark.color, stroke: "none" }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded bg-popover/95 border border-border px-2 py-1 text-[10px] shadow-lg">
                          <span className="text-muted-foreground">{payload[0].payload.ts}: </span>
                          <span className="font-bold">{fmt(payload[0].value as number)}</span>
                        </div>
                      );
                    }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
