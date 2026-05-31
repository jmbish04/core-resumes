import React from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface FindingProps {
  benchmark: string;
  status: "below" | "at" | "above" | "insufficient_data";
  confidence: "high" | "medium" | "low";
  magnitude: number | null;
  caveats?: string[];
  reason?: string;
}

export function BenchmarkFindingsPanel({ findings, title = "Market Findings" }: { findings: FindingProps[], title?: string }) {
  if (!findings || findings.length === 0) {
    return null;
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "above": return <TrendingUp className="h-5 w-5 text-green-500" />;
      case "below": return <TrendingDown className="h-5 w-5 text-red-500" />;
      case "at": return <Minus className="h-5 w-5 text-yellow-500" />;
      default: return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const formatBenchmarkName = (name: string) => {
    return name.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Role-specific market positioning benchmarks.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {findings.map((f, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getStatusIcon(f.status)}
                <h4 className="font-semibold">{formatBenchmarkName(f.benchmark)}</h4>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Confidence:</span>
                <span className={`font-medium ${
                  f.confidence === 'high' ? 'text-green-500' : 
                  f.confidence === 'medium' ? 'text-yellow-500' : 'text-red-500'
                }`}>
                  {f.confidence.toUpperCase()}
                </span>
              </div>
            </div>

            {f.status === "insufficient_data" ? (
              <Alert variant="destructive" className="mt-2 bg-destructive/10 text-destructive border-none">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Insufficient Data</AlertTitle>
                <AlertDescription>{f.reason || "Not enough data points to compute this benchmark."}</AlertDescription>
              </Alert>
            ) : (
              <div className="mt-2">
                <div className="text-sm">
                  <span className="font-medium text-foreground">Verdict: </span>
                  {f.status.toUpperCase()} Market
                  {f.magnitude !== null && (
                    <span className="ml-1 text-muted-foreground">
                      ({f.magnitude > 0 ? "+" : ""}{(f.magnitude * 100).toFixed(1)}%)
                    </span>
                  )}
                </div>
                {f.caveats && f.caveats.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {f.caveats.map((c, j) => (
                      <li key={j} className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="mt-0.5">•</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
