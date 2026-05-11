"use client";

import { ChevronDownIcon, BrainIcon } from "lucide-react";
import { useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

/**
 * Reasoning — displays AI reasoning/thinking in a collapsible section.
 */
export function Reasoning({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
        <BrainIcon className="size-3.5" />
        <span>Thinking</span>
        <ChevronDownIcon className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 p-3 rounded-md bg-muted/30 border border-border/50 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
          {text}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * ReasoningGroup — wraps multiple reasoning steps.
 */
export function ReasoningGroup({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1 mb-2">{children}</div>;
}
