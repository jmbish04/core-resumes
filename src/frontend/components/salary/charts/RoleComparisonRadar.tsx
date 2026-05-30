/**
 * @fileoverview Role comparison radar — multi-axis spider chart comparing
 * pinned roles across salary dimensions.
 */

import { useMemo } from "react";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Tooltip } from "recharts";

import { Card } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

type PinnedRole = {
  id: number;
  roleId: string;
  roleTitle: string;
  companyName: string;
  salaryMin: number | null;
  salaryMax: number | null;
};

const RADAR_COLORS = [
  "hsl(152, 60%, 50%)",
  "hsl(199, 89%, 48%)",
  "hsl(45, 93%, 47%)",
  "hsl(280, 60%, 55%)",
  "hsl(350, 70%, 55%)",
];

const fmt = (v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`);

export function RoleComparisonRadar({
  pinnedRoles,
  marketStats,
}: {
  pinnedRoles: PinnedRole[];
  marketStats: any[];
}) {
  const { chartData, config } = useMemo(() => {
    if (pinnedRoles.length < 2) return { chartData: [], config: {} as ChartConfig };

    // Get national stats for reference
    const nationalMedians = marketStats
      .filter((s: any) => s.metricKey === "national")
      .map((s: any) => s.median);
    const avgNational =
      nationalMedians.length > 0
        ? Math.round(nationalMedians.reduce((a: number, b: number) => a + b, 0) / nationalMedians.length)
        : 100000;

    // Dimensions for the radar
    const dimensions = [
      {
        axis: "Salary Min",
        getValue: (r: PinnedRole) => r.salaryMin || 0,
        max: Math.max(...pinnedRoles.map((r) => r.salaryMin || 0), avgNational),
      },
      {
        axis: "Salary Max",
        getValue: (r: PinnedRole) => r.salaryMax || 0,
        max: Math.max(...pinnedRoles.map((r) => r.salaryMax || 0), avgNational * 1.5),
      },
      {
        axis: "Midpoint",
        getValue: (r: PinnedRole) =>
          r.salaryMin && r.salaryMax ? Math.round((r.salaryMin + r.salaryMax) / 2) : 0,
        max: Math.max(
          ...pinnedRoles.map((r) =>
            r.salaryMin && r.salaryMax ? (r.salaryMin + r.salaryMax) / 2 : 0,
          ),
          avgNational * 1.2,
        ),
      },
      {
        axis: "Range Width",
        getValue: (r: PinnedRole) =>
          r.salaryMin && r.salaryMax ? r.salaryMax - r.salaryMin : 0,
        max: Math.max(...pinnedRoles.map((r) => (r.salaryMax || 0) - (r.salaryMin || 0)), 80000),
      },
      {
        axis: "vs Market",
        getValue: (r: PinnedRole) => {
          const mid = r.salaryMin && r.salaryMax ? (r.salaryMin + r.salaryMax) / 2 : 0;
          return mid > 0 ? Math.round((mid / avgNational) * 100) : 0;
        },
        max: 200,
      },
    ];

    const chartData = dimensions.map((dim) => {
      const point: Record<string, string | number> = { axis: dim.axis, max: dim.max };
      pinnedRoles.forEach((role, i) => {
        const normalized = dim.max > 0 ? Math.round((dim.getValue(role) / dim.max) * 100) : 0;
        point[`role_${i}`] = normalized;
        point[`role_${i}_raw`] = dim.getValue(role);
      });
      return point;
    });

    const config: ChartConfig = {};
    pinnedRoles.forEach((role, i) => {
      config[`role_${i}`] = {
        label: `${role.companyName} — ${role.roleTitle}`,
        color: RADAR_COLORS[i % RADAR_COLORS.length],
      };
    });

    return { chartData, config };
  }, [pinnedRoles, marketStats]);

  if (chartData.length === 0) {
    return null;
  }

  return (
    <Card className="border-border/40 bg-card/60 p-5">
      <h3 className="text-sm font-semibold">Pinned Roles — Radar Comparison</h3>
      <p className="mt-0.5 text-xs text-muted-foreground mb-4">
        Multi-axis comparison of {pinnedRoles.length} pinned roles (normalized to 0–100 scale)
      </p>

      <ChartContainer config={config} className="mx-auto h-[320px] w-full max-w-md">
        <RadarChart data={chartData} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
          <PolarGrid stroke="hsl(var(--border))" strokeOpacity={0.3} />
          <PolarAngleAxis
            dataKey="axis"
            tick={{ fontSize: 10, fill: "#E5E7EB" }}
          />
          <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
          {pinnedRoles.map((_, i) => (
            <Radar
              key={i}
              name={`role_${i}`}
              dataKey={`role_${i}`}
              stroke={RADAR_COLORS[i % RADAR_COLORS.length]}
              fill={RADAR_COLORS[i % RADAR_COLORS.length]}
              fillOpacity={0.1}
              strokeWidth={2}
            />
          ))}
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const axis = payload[0]?.payload?.axis;
              return (
                <div className="rounded bg-popover/95 border border-border px-3 py-2 text-[10px] shadow-lg">
                  <p className="font-semibold text-foreground mb-1">{axis}</p>
                  {pinnedRoles.map((role, i) => {
                    const raw = payload[0]?.payload?.[`role_${i}_raw`];
                    return (
                      <div key={i} className="flex items-center gap-1.5">
                        <span
                          className="inline-block size-2 rounded-full"
                          style={{ backgroundColor: RADAR_COLORS[i % RADAR_COLORS.length] }}
                        />
                        <span className="text-muted-foreground">{role.companyName}:</span>
                        <span className="font-bold">
                          {axis === "vs Market" ? `${raw}%` : typeof raw === "number" ? fmt(raw) : raw}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            }}
          />
        </RadarChart>
      </ChartContainer>

      {/* Direct labels */}
      <div className="mt-3 flex flex-wrap justify-center gap-3">
        {pinnedRoles.map((role, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: RADAR_COLORS[i % RADAR_COLORS.length] }}
            />
            <span className="text-[10px] text-muted-foreground">
              {role.companyName} — {role.roleTitle}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
