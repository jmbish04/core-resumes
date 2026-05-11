import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/api-client";

import type { CompanyChartRow } from "./types";

export function JobsByCompanyChart() {
  const [rows, setRows] = useState<CompanyChartRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<CompanyChartRow[]>("/api/dashboard/by-company")
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Jobs by Company</CardTitle>
        <CardDescription>Tracked roles grouped by company.</CardDescription>
      </CardHeader>
      <CardContent className="h-72">
        {loading ? (
          <ChartSkeleton />
        ) : rows.length === 0 ? (
          <EmptyChart label="No roles have been added yet." />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="name"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "currentColor", fontSize: 12 }}
              />
              <YAxis
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "currentColor", fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{
                  background: "var(--popover)",
                  borderColor: "var(--border)",
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="value" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return <div className="h-full rounded-md bg-muted/50" />;
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
      {label}
    </div>
  );
}
