import { TrendingUp, Globe, MapPin, Building, Activity, Calendar } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiGet } from "@/lib/api-client";

interface StatItem {
  id: number;
  roleType: string;
  metricKey: string;
  metricLabel: string;
  p25: number;
  median: number;
  p75: number;
  sampleSize: number;
}

interface SnapshotData {
  id: number;
  runTimestamp: string;
  status: string;
  metadata: {
    totalJobsMatched?: number;
    chunksProcessed?: number;
    h1bRowsCount?: number;
  };
}

export function MarketSalaryStatsCard() {
  const [stats, setStats] = useState<StatItem[]>([]);
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Unique role types available
  const [roleTypes, setRoleTypes] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>("");

  useEffect(() => {
    apiGet<{ snapshot: SnapshotData | null; stats: StatItem[] }>("/api/pipeline/api-companies/salary-stats/latest")
      .then((res) => {
        setStats(res.stats);
        setSnapshot(res.snapshot);
        
        // Extract unique roles
        const roles = Array.from(new Set(res.stats.map((s) => s.roleType)));
        setRoleTypes(roles);
        if (roles.length > 0) {
          setSelectedRole(roles[0]);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const selectedStats = stats.filter((s) => s.roleType === selectedRole);

  const getMetricIcon = (key: string) => {
    switch (key) {
      case "remote":
        return <Globe className="size-4 text-sky-400 shrink-0 mt-0.5" />;
      case "local_market":
        return <MapPin className="size-4 text-emerald-400 shrink-0 mt-0.5" />;
      case "top_hubs":
        return <Building className="size-4 text-amber-400 shrink-0 mt-0.5" />;
      default:
        return <Activity className="size-4 text-violet-400 shrink-0 mt-0.5" />;
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(val);
  };

  return (
    <Card className="rounded-lg flex flex-col border-border/60">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="size-5 text-emerald-400" />
              Live Market Salary Statistics
            </CardTitle>
            <CardDescription>
              Real-time aggregated percentiles from 1M+ active job postings.
            </CardDescription>
          </div>
          {roleTypes.length > 1 && (
            <Tabs value={selectedRole} onValueChange={setSelectedRole} className="w-auto">
              <TabsList className="h-8 p-0.5 bg-muted/60">
                {roleTypes.map((role) => (
                  <TabsTrigger key={role} value={role} className="text-xs px-3 h-7 capitalize">
                    {role}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 pb-4">
        {loading ? (
          <div className="space-y-3 py-6">
            <div className="h-10 rounded bg-muted/40 animate-pulse" />
            <div className="h-10 rounded bg-muted/40 animate-pulse" />
            <div className="h-10 rounded bg-muted/40 animate-pulse" />
            <div className="h-10 rounded bg-muted/40 animate-pulse" />
          </div>
        ) : selectedStats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 rounded-md border border-dashed border-border/50 text-muted-foreground text-sm gap-2 bg-muted/10">
            <Activity className="size-8 text-muted-foreground/30" />
            <span>No market salary statistics available yet.</span>
            <p className="text-xs text-muted-foreground/60 max-w-xs text-center">
              Run the "Sync Upstream Companies" workflow in Github Actions to compile the latest salary data.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 mt-1">
            {selectedStats.map((item) => {
              // Calculate percent widths for visualizing range
              const maxScale = 300000; // Cap visual range at $300k
              const p25Percent = Math.min(100, (item.p25 / maxScale) * 100);
              const p75Percent = Math.min(100, (item.p75 / maxScale) * 100);
              const medianPercent = Math.min(100, (item.median / maxScale) * 100);
              
              return (
                <div 
                  key={item.id} 
                  className="group relative rounded-lg border border-border/40 bg-muted/10 p-3 hover:bg-muted/30 transition-all duration-300"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-start gap-2.5">
                      {getMetricIcon(item.metricKey)}
                      <div>
                        <div className="text-sm font-semibold tracking-tight leading-none text-foreground flex items-center gap-1.5 capitalize">
                          {item.metricLabel}
                        </div>
                        <span className="text-xs text-muted-foreground/60 leading-none mt-1 inline-block">
                          Based on {item.sampleSize.toLocaleString()} postings
                        </span>
                      </div>
                    </div>
                    
                    <div className="flex items-baseline gap-1 text-right sm:text-right">
                      <span className="text-xs text-muted-foreground/60">Median:</span>
                      <span className="text-sm font-bold font-mono text-emerald-400">
                        {formatCurrency(item.median)}
                      </span>
                    </div>
                  </div>

                  {/* Range visualizer */}
                  <div className="space-y-1 mt-2">
                    <div className="relative h-1.5 w-full bg-muted/50 rounded-full overflow-hidden">
                      {/* Bar from p25 to p75 */}
                      <div 
                        className="absolute h-full rounded-full bg-emerald-500/20 group-hover:bg-emerald-500/35 transition-all duration-300"
                        style={{
                          left: `${p25Percent}%`,
                          right: `${100 - p75Percent}%`
                        }}
                      />
                      {/* Median pin */}
                      <div 
                        className="absolute h-full w-1 bg-emerald-400 group-hover:scale-y-125 transition-transform"
                        style={{
                          left: `${medianPercent}%`
                        }}
                      />
                    </div>
                    
                    <div className="flex justify-between text-[10px] font-mono text-muted-foreground/60 leading-none pt-0.5">
                      <span>25th: {formatCurrency(item.p25)}</span>
                      <span>75th: {formatCurrency(item.p75)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex-col items-start gap-2 text-xs border-t border-border/40 p-4 bg-muted/10 w-full mt-auto">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Calendar className="size-3.5 shrink-0" />
          {snapshot ? (
            <span>
              Last sync complete:{" "}
              <strong>
                {new Date(snapshot.runTimestamp).toLocaleDateString()}
              </strong>{" "}
              ({snapshot.metadata?.totalJobsMatched?.toLocaleString() || 0} jobs processed).
            </span>
          ) : (
            <span>No sync data recorded.</span>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
