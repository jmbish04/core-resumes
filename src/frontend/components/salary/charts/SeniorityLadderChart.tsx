/**
 * @fileoverview Seniority ladder chart — slope/line chart showing salary
 * progression across seniority levels per company.
 */

import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

import { Card } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const SENIORITY_ORDER = ["entry", "junior", "mid", "senior", "staff", "principal", "director", "vp"];

const LINE_COLORS = [
  "hsl(152, 60%, 50%)",
  "hsl(199, 89%, 48%)",
  "hsl(45, 93%, 47%)",
  "hsl(280, 60%, 55%)",
  "hsl(350, 70%, 55%)",
  "hsl(170, 60%, 45%)",
  "hsl(30, 80%, 50%)",
  "hsl(220, 70%, 55%)",
];

const fmt = (v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`);

export function SeniorityLadderChart({ data }: { data: any[] }) {
  const { chartData, companies, config } = useMemo(() => {
    if (!data || data.length === 0) return { chartData: [], companies: [], config: {} as ChartConfig };

    // Group by company, then by seniority
    const byCompany: Record<string, Record<string, number>> = {};
    for (const entry of data) {
      const company = entry.companyName || "unknown";
      const seniority = (entry.seniority || "").toLowerCase();
      if (!SENIORITY_ORDER.includes(seniority)) continue;

      if (!byCompany[company]) byCompany[company] = {};
      if (!byCompany[company][seniority]) byCompany[company][seniority] = 0;
      byCompany[company][seniority] = Math.max(byCompany[company][seniority], entry.median || 0);
    }

    // Only show companies with ≥ 2 seniority levels
    const validCompanies = Object.entries(byCompany)
      .filter(([, sens]) => Object.keys(sens).length >= 2)
      .sort((a, b) => {
        const aMax = Math.max(...Object.values(a[1]));
        const bMax = Math.max(...Object.values(b[1]));
        return bMax - aMax;
      })
      .slice(0, 8)
      .map(([name]) => name);

    if (validCompanies.length === 0) return { chartData: [], companies: [], config: {} as ChartConfig };

    // Build chart data: one entry per seniority level
    const usedSeniorities = new Set<string>();
    for (const company of validCompanies) {
      for (const sen of Object.keys(byCompany[company])) {
        usedSeniorities.add(sen);
      }
    }
    const orderedSeniorities = SENIORITY_ORDER.filter((s) => usedSeniorities.has(s));

    const chartData = orderedSeniorities.map((sen) => {
      const point: Record<string, string | number> = { seniority: sen };
      for (const company of validCompanies) {
        point[company] = byCompany[company]?.[sen] || 0;
      }
      return point;
    });

    const config: ChartConfig = {};
    validCompanies.forEach((company, i) => {
      config[company] = { label: company, color: LINE_COLORS[i % LINE_COLORS.length] };
    });

    return { chartData, companies: validCompanies, config };
  }, [data]);

  if (chartData.length === 0) {
    return (
      <Card className="border-border/40 bg-card/60 p-5">
        <h3 className="text-sm font-semibold mb-1">Seniority Ladder</h3>
        <p className="text-xs text-muted-foreground">
          Need companies with ≥ 2 seniority levels to show progression
        </p>
      </Card>
    );
  }

  return (
    <Card className="border-border/40 bg-card/60 p-5">
      <h3 className="text-sm font-semibold">Seniority Ladder</h3>
      <p className="mt-0.5 text-xs text-muted-foreground mb-4">
        Salary progression across seniority levels — {companies.length} companies
      </p>

      <ChartContainer config={config} className="h-[280px] w-full">
        <LineChart data={chartData} margin={{ top: 8, right: 80, bottom: 4, left: 0 }}>
          <XAxis
            dataKey="seniority"
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
          {companies.map((company, i) => (
            <Line
              key={company}
              type="monotone"
              dataKey={company}
              stroke={LINE_COLORS[i % LINE_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3, fill: LINE_COLORS[i % LINE_COLORS.length], stroke: "none" }}
              connectNulls
            />
          ))}
        </LineChart>
      </ChartContainer>

      {/* Direct labels (Tufte: no legends, label series directly) */}
      <div className="mt-3 flex flex-wrap gap-2">
        {companies.map((company, i) => (
          <div key={company} className="flex items-center gap-1.5">
            <span
              className="inline-block size-2 rounded-full"
              style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }}
            />
            <span className="text-[10px] text-muted-foreground capitalize">{company}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
