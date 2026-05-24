import { Database, Filter, Layers, Loader2, RefreshCw, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Funnel, FunnelChart, LabelList, ResponsiveContainer, Tooltip } from "recharts";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Mock data since endpoint for Pipeline A aggregate stats might not exist yet
const FUNNEL_DATA = [
  { name: "Total GitHub Companies", value: 12500, fill: "#3b82f6" },
  { name: "Active Job Boards", value: 9200, fill: "#6366f1" },
  { name: "Raw Jobs Scraped", value: 45000, fill: "#8b5cf6" },
  { name: "Salary/Title/Location Match", value: 2100, fill: "#a855f7" },
  { name: "Processed in Tracker", value: 1540, fill: "#d946ef" },
];

export function PipelineAAggregatorDocs() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading for now since backend might not have the Pipeline A stats endpoint
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading aggregator data…</span>
      </div>
    );
  }

  // Formats data labels with standard high-contrast descriptions and percentage metrics
  const formatLabel = (name: any) => {
    if (typeof name !== "string") return String(name || "");
    const item = FUNNEL_DATA.find((d) => d.name === name);
    if (!item) return name;
    
    // Format quantity (e.g. 12500 -> 12.5k)
    const formatQuantity = (val: number) => {
      if (val >= 1000) {
        return `${(val / 1000).toFixed(1)}k (${val.toLocaleString()})`;
      }
      return val.toString();
    };

    // Dynamically retrieve denominators from FUNNEL_DATA to avoid hardcoding inconsistencies
    const totalGithubCompanies = FUNNEL_DATA.find((d) => d.name === "Total GitHub Companies")?.value || 12500;
    const rawJobsScraped = FUNNEL_DATA.find((d) => d.name === "Raw Jobs Scraped")?.value || 45000;
    const matchJobs = FUNNEL_DATA.find((d) => d.name === "Salary/Title/Location Match")?.value || 2100;

    // Calculate conversion percentage (e.g. active boards vs total github companies)
    let percentageStr = "";
    if (name === "Active Job Boards") {
      const pct = ((item.value / totalGithubCompanies) * 100).toFixed(1);
      percentageStr = ` · ${pct}%`;
    } else if (name === "Salary/Title/Location Match") {
      const pct = ((item.value / rawJobsScraped) * 100).toFixed(1);
      percentageStr = ` · ${pct}%`;
    } else if (name === "Processed in Tracker") {
      const pct = ((item.value / matchJobs) * 100).toFixed(1);
      percentageStr = ` · ${pct}%`;
    }

    return `${name}: ${formatQuantity(item.value)}${percentageStr}`;
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Database className="size-5 text-blue-400" />
              <CardTitle className="text-base">Upstream Sources</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">12,500</p>
            <p className="text-xs text-muted-foreground mt-1">
              Companies tracked via GitHub aggregator
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Search className="size-5 text-purple-400" />
              <CardTitle className="text-base">Jobs Discovered</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">45,000</p>
            <p className="text-xs text-muted-foreground mt-1">
              Raw postings across all active boards
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Filter className="size-5 text-pink-400" />
              <CardTitle className="text-base">Tracker Matches</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">2,100</p>
            <p className="text-xs text-muted-foreground mt-1">
              Jobs meeting salary/location/title criteria
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-card/50 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="size-5 text-indigo-400" />
            <div>
              <CardTitle className="text-base">Aggregator Funnel</CardTitle>
              <CardDescription>
                Filtering raw GitHub companies down to processed tracking targets
              </CardDescription>
            </div>
          </div>
          <a
            href="/config?tab=pipeline"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <RefreshCw className="mr-2 size-4" />
            Manage & Promote Companies
          </a>
        </CardHeader>
        <CardContent>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <FunnelChart>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: any) => [value.toLocaleString(), "Count"]}
                />
                <Funnel dataKey="value" data={FUNNEL_DATA} isAnimationActive>
                  <LabelList
                    position="right"
                    fill="#e4e4e7" // Zinc-200 high contrast color for dark mode readability
                    stroke="none"
                    dataKey="name"
                    formatter={formatLabel}
                    style={{ fontSize: "11px", fontWeight: 500 }}
                  />
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

