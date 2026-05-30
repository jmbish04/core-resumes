"use client";

import { SparklesIcon, TargetIcon, ZapIcon, ShieldAlertIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StrategicInsightsProps {
  theHook: string | null;
  strategicRecommendation: string | null;
  counterPositioning: string | null;
}

/**
 * Normalize AI-generated text that contains inline numbered lists
 * (e.g. "...text. 2. Next item 3. Another") into proper markdown
 * with line breaks before each numbered item.
 */
function normalizeMarkdownList(text: string): string {
  return text.replace(/([.!?:;])(\s+)(\d+\.\s)/g, "$1\n\n$3");
}

// ---------------------------------------------------------------------------
// StrategicInsights — renders the AI-generated narrative strategy
// ---------------------------------------------------------------------------

export function StrategicInsights({
  theHook,
  strategicRecommendation,
  counterPositioning,
}: StrategicInsightsProps) {
  // Don't render if no strategic data is available
  if (!theHook && !strategicRecommendation && !counterPositioning) {
    return null;
  }

  return (
    <Card className="border-chart-1/20 bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <SparklesIcon className="size-4 text-chart-1" />
          Strategic Narrative
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Accordion type="multiple" defaultValue={["hook", "strategy", "positioning"]}>
          {/* The Hook */}
          {theHook && (
            <AccordionItem value="hook">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ZapIcon className="size-4 text-chart-1" />
                  The Hook (Opening Pitch)
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <blockquote className="border-l-4 border-chart-1 pl-4 py-2 italic text-chart-1 text-base leading-relaxed">
                  &ldquo;{theHook}&rdquo;
                </blockquote>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Strategic Recommendation */}
          {strategicRecommendation && (
            <AccordionItem value="strategy">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <TargetIcon className="size-4 text-chart-1" />
                  To Win This Role
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="prose prose-sm dark:prose-invert max-w-none text-left">
                  <ReactMarkdown>{normalizeMarkdownList(strategicRecommendation)}</ReactMarkdown>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Counter-Positioning (JD Trap) */}
          {counterPositioning && (
            <AccordionItem value="positioning">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ShieldAlertIcon className="size-4 text-chart-1" />
                  Counter-Positioning (JD Trap)
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="prose prose-sm dark:prose-invert max-w-none text-left">
                  <ReactMarkdown>{normalizeMarkdownList(counterPositioning)}</ReactMarkdown>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      </CardContent>
    </Card>
  );
}
