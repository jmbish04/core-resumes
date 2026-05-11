import { BriefcaseBusiness, CircleCheck, Clock3, Send } from "lucide-react";
import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/api-client";

import type { DashboardSummary } from "./types";

const cards = [
  { key: "total", label: "Total", icon: BriefcaseBusiness },
  { key: "preparing", label: "Preparing", icon: Clock3 },
  { key: "applied", label: "Applied", icon: Send },
  { key: "interviewing", label: "Interviewing", icon: CircleCheck },
] as const;

export function StatCards() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<DashboardSummary>("/api/dashboard/summary")
      .then(setSummary)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const value = summary?.[card.key] ?? 0;

        return (
          <Card key={card.key} size="sm" className="rounded-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm text-muted-foreground">{card.label}</CardTitle>
              <Icon className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold tabular-nums">
                {loading ? <span className="inline-block h-7 w-12 rounded bg-muted" /> : value}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
