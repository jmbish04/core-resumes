import { useEffect, useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { apiGet } from "@/lib/api-client";

import type { SalaryChartRow } from "./types";

type SalaryPoint = SalaryChartRow & { midpoint: number | null };

const chartConfig = {
  min: {
    label: "Minimum",
    color: "var(--chart-2)",
  },
  midpoint: {
    label: "Midpoint",
    color: "var(--chart-1)",
  },
  max: {
    label: "Maximum",
    color: "var(--chart-3)",
  },
} satisfies ChartConfig;

export function SalaryRangeChart() {
  const [rows, setRows] = useState<SalaryChartRow[]>([]);
  const [loading, setLoading] = useState(true);

  const points = useMemo<SalaryPoint[]>(
    () =>
      rows.map((row) => ({
        ...row,
        midpoint:
          row.min !== null && row.max !== null
            ? Math.round((row.min + row.max) / 2)
            : (row.min ?? row.max),
      })),
    [rows],
  );

  const hasSalary = points.some((point) => point.midpoint !== null || point.min !== null || point.max !== null);

  useEffect(() => {
    apiGet<SalaryChartRow[]>("/api/dashboard/by-salary")
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card className="rounded-lg flex flex-col">
      <CardHeader>
        <CardTitle>Salary Range</CardTitle>
        <CardDescription>Minimum, midpoint, and maximum compensation.</CardDescription>
      </CardHeader>
      <CardContent className="h-72 flex-1 pb-0">
        {loading ? (
          <div className="h-full rounded-md bg-muted/50" />
        ) : !hasSalary ? (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
            No salary data has been captured yet.
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-full w-full">
            <LineChart
              accessibilityLayer
              data={points}
              margin={{
                left: 12,
                right: 12,
                top: 8,
              }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => value.length > 20 ? value.slice(0, 20) + "..." : value}
              />
              <YAxis
                tickFormatter={(value) => `$${Number(value) / 1000}k`}
                tickLine={false}
                axisLine={false}
              />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Line
                dataKey="min"
                type="monotone"
                stroke="var(--color-min)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                dataKey="midpoint"
                type="monotone"
                stroke="var(--color-midpoint)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                dataKey="max"
                type="monotone"
                stroke="var(--color-max)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
      <CardFooter>
        <div className="flex w-full items-start gap-2 text-sm mt-4">
          <div className="grid gap-2">
            <div className="flex items-center gap-2 leading-none font-medium">
              Compensation breakdown across tracked roles <TrendingUp className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2 leading-none text-muted-foreground">
              Showing salary boundaries and derived midpoints
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
