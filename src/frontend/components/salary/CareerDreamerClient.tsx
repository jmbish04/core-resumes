/**
 * @fileoverview Client-side React wrapper for the Career Dreamer page.
 * Extracted from inline <script> to fix esbuild JSX parsing in .astro files.
 */

import React, { useEffect, useState } from "react";
import { PivotTrajectoryChart } from "./PivotTrajectoryChart";
import { BenchmarkFindingsPanel } from "./BenchmarkFindingsPanel";
import { LeverageScoreCard } from "./LeverageScoreCard";

export function CareerDreamerClient() {
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/pipeline/salary/analyze-aggregate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: {
              currentRoleTitle: "Software Engineer",
              currentSalary: 150000,
              targetRoleTitle: "Engineering Manager",
              projectionYears: 5,
            },
          }),
        });

        if (!res.ok) throw new Error("Failed to fetch aggregate insights");

        const data = (await res.json()) as { result: unknown };
        setResults(data.result);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-64 w-full rounded-xl bg-muted animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-80 w-full rounded-xl bg-muted animate-pulse" />
          <div className="h-80 w-full rounded-xl bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Failed to load career data.</p>
        {error && <p className="text-sm mt-2">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {results.pivotTrajectory?.payload?.curves && (
        <PivotTrajectoryChart curves={results.pivotTrajectory.payload.curves} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BenchmarkFindingsPanel
          title="Macro Insights"
          findings={[
            results.industryCompTrends,
            results.roleDemandHeat,
            results.remoteDiscountIndex,
            results.geoPremiumDeltas,
          ].filter(Boolean)}
        />

        <LeverageScoreCard
          score="moderate"
          primaryLevers={["High demand for your role"]}
          vulnerabilities={["Remote discount"]}
          caveats={["Based on aggregate market data."]}
        />
      </div>
    </div>
  );
}
