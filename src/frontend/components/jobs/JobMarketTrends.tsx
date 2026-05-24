import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";

export function JobMarketTrends({ apiCompanies, salaryData, pipelineStats }: any) {
  // Process salary data for chart if available
  const salaryHistogram = React.useMemo(() => {
    if (!salaryData || Object.keys(salaryData).length === 0) return [];

    // Group salaries into buckets
    const buckets: Record<string, number> = {
      "<$50k": 0,
      "$50k-$100k": 0,
      "$100k-$150k": 0,
      "$150k-$200k": 0,
      "$200k+": 0,
    };

    // salaryData is presumably { "title": [salaries], ... } or similar
    // We will attempt to flatten and bucket it
    Object.values(salaryData).forEach((item: any) => {
      // Very naive extraction based on common shapes
      const amount =
        typeof item === "number" ? item : item.min ? (item.min + (item.max || item.min)) / 2 : 0;

      if (amount > 0 && amount < 50000) buckets["<$50k"]++;
      else if (amount >= 50000 && amount < 100000) buckets["$50k-$100k"]++;
      else if (amount >= 100000 && amount < 150000) buckets["$100k-$150k"]++;
      else if (amount >= 150000 && amount < 200000) buckets["$150k-$200k"]++;
      else if (amount >= 200000) buckets["$200k+"]++;
    });

    return Object.keys(buckets)
      .map((k) => ({ range: k, count: buckets[k] }))
      .filter((b) => b.count > 0);
  }, [salaryData]);

  const activeCompanies = apiCompanies.filter((c: any) => c.isActive).length;
  const inactiveCompanies = apiCompanies.filter((c: any) => !c.isActive).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl font-bold">{apiCompanies.length}</CardTitle>
            <CardDescription>Total Companies Tracked</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between text-sm">
              <span className="text-green-500">{activeCompanies} Active</span>
              <span className="text-muted-foreground">{inactiveCompanies} Inactive</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl font-bold">
              ${Math.round((pipelineStats?.avgSalary?.overall || 0) / 1000)}k
            </CardTitle>
            <CardDescription>Average Local Salary</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              Across {pipelineStats?.totalSnapshots || 0} local job snapshots
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-2xl font-bold">{Object.keys(salaryData).length}</CardTitle>
            <CardDescription>Upstream Salary Data Points</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">Sourced from global aggregator</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Upstream Salary Distribution</CardTitle>
            <CardDescription>Distribution of salaries from upstream data</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {salaryHistogram.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={salaryHistogram}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="range" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                No salary distribution data available.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Local Pipeline Analytics</CardTitle>
            <CardDescription>Pipeline processing stats</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">Verdict Distribution</p>
                {pipelineStats?.verdictDistribution?.map((v: any) => (
                  <div
                    key={v.verdict}
                    className="flex justify-between text-sm py-1 border-b last:border-0 border-border/50"
                  >
                    <span className="capitalize">{v.verdict.replace(/_/g, " ")}</span>
                    <span className="font-mono">{v.count}</span>
                  </div>
                ))}
                {(!pipelineStats?.verdictDistribution ||
                  pipelineStats.verdictDistribution.length === 0) && (
                  <p className="text-sm text-muted-foreground">No verdict data yet.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
