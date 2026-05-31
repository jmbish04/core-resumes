import React from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { ShieldCheck, ShieldAlert, Shield } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface LeverageScoreCardProps {
  score: "strong" | "moderate" | "weak" | "insufficient_data";
  primaryLevers: string[];
  vulnerabilities: string[];
  caveats: string[];
}

export function LeverageScoreCard({ score, primaryLevers, vulnerabilities, caveats }: LeverageScoreCardProps) {
  
  const getScoreDisplay = () => {
    switch (score) {
      case "strong":
        return {
          icon: <ShieldCheck className="h-12 w-12 text-green-500" />,
          label: "Strong Leverage",
          color: "text-green-500",
          bg: "bg-green-500/10"
        };
      case "moderate":
        return {
          icon: <Shield className="h-12 w-12 text-yellow-500" />,
          label: "Moderate Leverage",
          color: "text-yellow-500",
          bg: "bg-yellow-500/10"
        };
      case "weak":
        return {
          icon: <ShieldAlert className="h-12 w-12 text-red-500" />,
          label: "Weak Leverage",
          color: "text-red-500",
          bg: "bg-red-500/10"
        };
      default:
        return {
          icon: <Shield className="h-12 w-12 text-muted-foreground" />,
          label: "Insufficient Data",
          color: "text-muted-foreground",
          bg: "bg-secondary"
        };
    }
  };

  const display = getScoreDisplay();

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Negotiation Leverage</CardTitle>
        <CardDescription>Aggregate negotiation position based on benchmarks.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className={`flex items-center gap-4 rounded-xl p-4 ${display.bg}`}>
          {display.icon}
          <div className="flex flex-col">
            <span className={`text-2xl font-bold ${display.color}`}>{display.label}</span>
          </div>
        </div>

        {score === "insufficient_data" ? (
          <Alert variant="default">
            <AlertTitle>Cannot Compute Leverage</AlertTitle>
            <AlertDescription>
              We don't have enough benchmark data to confidently score your negotiation leverage for this role.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="font-semibold text-green-500 border-b border-border pb-1">Primary Levers</h4>
              <ul className="space-y-2">
                {primaryLevers.length > 0 ? primaryLevers.map((lever, i) => (
                  <li key={i} className="text-sm flex items-start gap-2 text-muted-foreground">
                    <span className="text-green-500 mt-0.5">+</span>
                    {lever}
                  </li>
                )) : <li className="text-sm text-muted-foreground italic">None identified.</li>}
              </ul>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-semibold text-red-500 border-b border-border pb-1">Vulnerabilities</h4>
              <ul className="space-y-2">
                {vulnerabilities.length > 0 ? vulnerabilities.map((vuln, i) => (
                  <li key={i} className="text-sm flex items-start gap-2 text-muted-foreground">
                    <span className="text-red-500 mt-0.5">-</span>
                    {vuln}
                  </li>
                )) : <li className="text-sm text-muted-foreground italic">None identified.</li>}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
      {caveats && caveats.length > 0 && (
        <CardFooter className="bg-muted/30 p-4 border-t border-border flex flex-col items-start gap-1">
          <span className="text-xs font-semibold text-foreground">Caveats:</span>
          <ul className="space-y-1">
            {caveats.map((c, i) => (
              <li key={i} className="text-xs text-muted-foreground">• {c}</li>
            ))}
          </ul>
        </CardFooter>
      )}
    </Card>
  );
}
