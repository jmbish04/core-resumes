/**
 * @fileoverview Company salary heatmap — table-chart hybrid showing Company × Seniority
 * matrix with color intensity encoding median salaries.
 */

import { useMemo } from "react";

import { Card } from "@/components/ui/card";

const fmt = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

/** Maps a salary to a Tailwind-friendly opacity for the heatmap cell. */
function salaryToIntensity(median: number, min: number, max: number): string {
  if (max === min) return "bg-emerald-500/30";
  const ratio = (median - min) / (max - min);
  if (ratio >= 0.8) return "bg-emerald-500/50 text-emerald-100";
  if (ratio >= 0.6) return "bg-emerald-500/35 text-emerald-200";
  if (ratio >= 0.4) return "bg-emerald-500/20";
  if (ratio >= 0.2) return "bg-emerald-500/10";
  return "bg-muted/30";
}

export function CompanySalaryHeatmap({ data }: { data: any[] }) {
  const { companies, seniorities, grid, minMedian, maxMedian } = useMemo(() => {
    if (!data || data.length === 0)
      return { companies: [], seniorities: [], grid: {} as Record<string, Record<string, number>>, minMedian: 0, maxMedian: 0 };

    // Group by company + seniority
    const grouped: Record<string, Record<string, { sum: number; count: number }>> = {};
    const senSet = new Set<string>();
    let allMedians: number[] = [];

    for (const entry of data) {
      const company = entry.companyName || "unknown";
      const seniority = entry.seniority || "unspecified";
      senSet.add(seniority);

      if (!grouped[company]) grouped[company] = {};
      if (!grouped[company][seniority]) grouped[company][seniority] = { sum: 0, count: 0 };
      grouped[company][seniority].sum += entry.median;
      grouped[company][seniority].count += 1;
    }

    // Compute averages
    const grid: Record<string, Record<string, number>> = {};
    for (const [company, senData] of Object.entries(grouped)) {
      grid[company] = {};
      for (const [sen, agg] of Object.entries(senData)) {
        const avg = Math.round(agg.sum / agg.count);
        grid[company][sen] = avg;
        allMedians.push(avg);
      }
    }

    // Sort companies by overall average median descending
    const companyAvgs = Object.entries(grid).map(([name, senMap]) => {
      const vals = Object.values(senMap);
      return { name, avg: Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) };
    });
    companyAvgs.sort((a, b) => b.avg - a.avg);

    const seniorities = [...senSet].sort();

    return {
      companies: companyAvgs.slice(0, 20).map((c) => c.name),
      seniorities,
      grid,
      minMedian: Math.min(...allMedians),
      maxMedian: Math.max(...allMedians),
    };
  }, [data]);

  if (companies.length === 0) {
    return (
      <Card className="border-border/40 bg-card/60 p-5">
        <h3 className="text-sm font-semibold mb-1">Company × Seniority Heatmap</h3>
        <p className="text-xs text-muted-foreground">No company salary data available</p>
      </Card>
    );
  }

  return (
    <Card className="border-border/40 bg-card/60 p-5">
      <h3 className="text-sm font-semibold">Company × Seniority Heatmap</h3>
      <p className="mt-0.5 text-xs text-muted-foreground mb-4">
        Top {companies.length} companies by median salary — color intensity encodes pay level
      </p>

      <div className="overflow-x-auto -mx-2">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/30">
              <th className="sticky left-0 bg-card/90 px-3 py-2 text-left font-medium text-muted-foreground">
                Company
              </th>
              {seniorities.map((sen) => (
                <th key={sen} className="px-3 py-2 text-center font-medium text-muted-foreground capitalize whitespace-nowrap">
                  {sen}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => (
              <tr key={company} className="border-b border-border/10 hover:bg-muted/10 transition-colors">
                <td className="sticky left-0 bg-card/90 px-3 py-1.5 font-medium capitalize truncate max-w-[160px]">
                  {company}
                </td>
                {seniorities.map((sen) => {
                  const val = grid[company]?.[sen];
                  return (
                    <td key={sen} className="px-1 py-1">
                      {val ? (
                        <div
                          className={`rounded px-2 py-1 text-center tabular-nums font-medium transition-colors ${salaryToIntensity(val, minMedian, maxMedian)}`}
                        >
                          {fmt(val)}
                        </div>
                      ) : (
                        <div className="px-2 py-1 text-center text-muted-foreground/30">—</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
