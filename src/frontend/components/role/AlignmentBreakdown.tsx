"use client";

import {
  CheckCircle2Icon,
  AlertCircleIcon,
  XCircleIcon,
  ChevronDownIcon,
  Loader2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AlignmentScore {
  id: string;
  type: string;
  content: string;
  score: number;
  rationale: string;
  holisticRationale?: string;
}

interface AlignmentGroup {
  type: string;
  strong: AlignmentScore[];
  moderate: AlignmentScore[];
  gap: AlignmentScore[];
}

interface AlignmentBreakdownProps {
  roleId: string;
  analysisId?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  KEY_RESPONSIBILITY: "Key Responsibilities",
  REQUIRED_QUALIFICATION: "Required Qualifications",
  PREFERRED_QUALIFICATION: "Preferred Qualifications",
  REQUIRED_SKILL: "Required Skills",
  PREFERRED_SKILL: "Preferred Skills",
  EDUCATION_REQUIREMENT: "Education Requirements",
  BENEFIT: "Benefits",
  // Legacy labels for backward compatibility
  requirement: "Requirements",
  skill: "Skills",
  desired_trait: "Desired Traits",
  responsibility: "Responsibilities",
};

const TIER_CONFIG = {
  strong: {
    label: "Strong Alignment",
    icon: CheckCircle2Icon,
    color: "text-emerald-400",
    badgeBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    range: "75–100",
  },
  moderate: {
    label: "Moderate Alignment",
    icon: AlertCircleIcon,
    color: "text-amber-400",
    badgeBg: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    range: "40–74",
  },
  gap: {
    label: "Gap Identified",
    icon: XCircleIcon,
    color: "text-red-400",
    badgeBg: "bg-red-500/10 text-red-400 border-red-500/20",
    range: "0–39",
  },
} as const;

// ---------------------------------------------------------------------------
// AlignmentItem — single item within a tier
// ---------------------------------------------------------------------------

function AlignmentItem({ item }: { item: AlignmentScore }) {
  const [open, setOpen] = useState(false);
  const tierKey = item.score >= 75 ? "strong" : item.score >= 40 ? "moderate" : "gap";
  const tier = TIER_CONFIG[tierKey];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-3 w-full text-left py-2 px-3 rounded-md hover:bg-muted/50 transition-colors group">
        <Badge
          variant="outline"
          className={`${tier.badgeBg} font-mono text-xs min-w-[44px] justify-center`}
        >
          {item.score}
        </Badge>
        <span className="flex-1 text-sm">{item.content}</span>
        <ChevronDownIcon
          className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-14 pr-3 pb-2">
          <p className="text-sm text-muted-foreground leading-relaxed">{item.rationale}</p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// TierSection — group of items within a tier
// ---------------------------------------------------------------------------

function TierSection({
  tierKey,
  items,
}: {
  tierKey: "strong" | "moderate" | "gap";
  items: AlignmentScore[];
}) {
  if (items.length === 0) return null;

  const tier = TIER_CONFIG[tierKey];
  const TierIcon = tier.icon;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <TierIcon className={`size-4 ${tier.color}`} />
        <span className={`text-xs font-medium ${tier.color}`}>
          {tier.label} ({tier.range})
        </span>
        <Badge variant="secondary" className="text-xs ml-auto">
          {items.length}
        </Badge>
      </div>
      <div className="space-y-0.5">
        {items.map((item) => (
          <AlignmentItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// HolisticRationale — cross-bullet contextual reasoning
// ---------------------------------------------------------------------------

function HolisticRationale({ items }: { items: AlignmentScore[] }) {
  // Find the first item with holistic rationale (they all share the same one per type)
  const holistic = items.find((i) => i.holisticRationale);
  if (!holistic?.holisticRationale) return null;

  return (
    <div className="rounded-md border border-border/40 bg-muted/30 p-3 mt-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Holistic Assessment
      </span>
      <p className="text-sm text-muted-foreground leading-relaxed mt-1">
        {holistic.holisticRationale}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AlignmentBreakdown — exported component
// ---------------------------------------------------------------------------

export function AlignmentBreakdown({ roleId, analysisId }: AlignmentBreakdownProps) {
  const [groups, setGroups] = useState<AlignmentGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const url = analysisId
          ? `/api/roles/${roleId}/analysis/${analysisId}`
          : `/api/roles/${roleId}/analysis/alignment`;
        const res = await fetch(url);
        
        if (res.ok) {
          const data = (await res.json()) as any;
          if (data.groups && data.groups.length > 0) {
            setGroups(data.groups);
          } else if (data.alignmentScores && data.alignmentScores.length > 0) {
            const grouped: Record<string, AlignmentScore[]> = {};
            for (const score of data.alignmentScores) {
              if (!grouped[score.type]) grouped[score.type] = [];
              grouped[score.type].push(score);
            }
            const tiered = Object.entries(grouped).map(([type, items]) => ({
              type,
              strong: items.filter((s) => s.score >= 75),
              moderate: items.filter((s) => s.score >= 40 && s.score < 75),
              gap: items.filter((s) => s.score < 40),
            }));
            setGroups(tiered);
          } else {
            setGroups([]);
          }
        } else {
            setFetchError(true);
        }
      } catch {
        setFetchError(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [roleId, analysisId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (groups.length === 0 || fetchError) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="flex flex-col items-center gap-2">
            <p className="text-muted-foreground text-sm">
              No alignment data available.
            </p>
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
               Refresh Data
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Alignment Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" defaultValue={groups.map((g) => g.type)}>
          {groups.map((group) => (
            <AccordionItem key={group.type} value={group.type}>
              <AccordionTrigger>
                <div className="flex items-center gap-2">
                  <span>{TYPE_LABELS[group.type] ?? group.type}</span>
                  <Badge variant="secondary" className="text-xs">
                    {group.strong.length + group.moderate.length + group.gap.length}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-4">
                  {group.strong.length + group.moderate.length + group.gap.length === 1 && (
                    // Single-item type — show holistic rationale inline if present
                    <HolisticRationale items={[...group.strong, ...group.moderate, ...group.gap]} />
                  )}
                  <TierSection tierKey="strong" items={group.strong} />
                  <TierSection tierKey="moderate" items={group.moderate} />
                  <TierSection tierKey="gap" items={group.gap} />
                  {group.strong.length + group.moderate.length + group.gap.length > 1 && (
                    <HolisticRationale items={[...group.strong, ...group.moderate, ...group.gap]} />
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}