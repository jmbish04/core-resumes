/**
 * @fileoverview Shared explainer modal for the p25 / median / p75 statistics.
 *
 * Centralized so both the salary-data explorer and the salary-intelligence
 * dashboard render the exact same definitions. Drop <PercentileInfoButton />
 * next to any chart that surfaces percentile bands. The "Read more" link points
 * at the in-depth docs page (/docs/salary-percentiles).
 */

import { HelpCircle, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const PERCENTILES: { label: string; tone: string; blurb: string }[] = [
  {
    label: "P25 — 25th percentile",
    tone: "text-sky-300",
    blurb:
      "A quarter of the market is paid at or below this number. Treat it as the low end of a fair range — an offer here usually has room to negotiate up.",
  },
  {
    label: "Median — 50th percentile",
    tone: "text-blue-300",
    blurb:
      "The exact middle of the market: half of comparable roles pay more, half pay less. This is the most robust single anchor — it ignores outliers that drag an average around.",
  },
  {
    label: "P75 — 75th percentile",
    tone: "text-indigo-300",
    blurb:
      "Only a quarter of the market is paid above this. A strong, competitive offer. Reaching P75 typically requires leverage: a competing offer, scarce skills, or senior scope.",
  },
];

export function PercentileInfoButton({
  className,
  label = "What do P25 / Median / P75 mean?",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className={"gap-1.5 " + (className ?? "")} />
        }
      >
        <HelpCircle className="size-3.5" />
        {label}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Reading percentile salary bands</DialogTitle>
          <DialogDescription>
            Percentiles describe where a number sits within the full distribution of
            comparable salaries — they are far more honest than a single average.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {PERCENTILES.map((p) => (
            <div key={p.label} className="rounded-lg border border-border/50 bg-card/40 p-3">
              <p className={"text-sm font-semibold " + p.tone}>{p.label}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.blurb}</p>
            </div>
          ))}

          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
            <p className="text-sm leading-relaxed text-blue-100">
              <span className="font-semibold">The spread matters.</span> A wide P25→P75 gap
              means pay is highly variable (negotiation has high stakes); a narrow gap means
              the market is tightly clustered and there is little room to move.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-blue-300 hover:text-blue-200"
            render={<a href="/docs/salary-percentiles" />}
          >
            Read more
            <ExternalLink className="size-3.5" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
