"use client";

import { SettingsIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AnalysisConfigModalProps {
  version: number;
  analyzedAt: string | Date;
  configNotebooklmPrompt: string | null;
  configCompensationBaseline: string | null;
  configCareerStories: string | null;
  usedDefaults: boolean | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AnalysisConfigModal({
  version,
  analyzedAt,
  configNotebooklmPrompt,
  configCompensationBaseline,
  configCareerStories,
  usedDefaults,
}: AnalysisConfigModalProps) {
  const [open, setOpen] = useState(false);

  const dateLabel =
    analyzedAt instanceof Date
      ? analyzedAt.toLocaleString()
      : new Date(analyzedAt).toLocaleString();

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <SettingsIcon className="mr-1.5 size-4" />
        View AI Config
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          onClose={() => setOpen(false)}
          className="w-[95vw] max-w-3xl max-h-[85vh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>
              <span className="flex items-center gap-2">
                Analysis Configuration
                <Badge variant="secondary" className="font-mono text-xs">
                  v{version}
                </Badge>
                {usedDefaults && (
                  <Badge variant="outline" className="border-amber-500/30 text-amber-400 text-xs">
                    Used Defaults
                  </Badge>
                )}
              </span>
            </DialogTitle>
            <DialogDescription>
              Exact prompts and configuration used during the v{version} analysis on {dateLabel}.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="prompt" className="mt-2">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="prompt">NotebookLM Prompt</TabsTrigger>
              <TabsTrigger value="compensation">Compensation</TabsTrigger>
              <TabsTrigger value="stories">Career Stories</TabsTrigger>
            </TabsList>

            <TabsContent value="prompt" className="mt-3">
              <Textarea
                readOnly
                value={configNotebooklmPrompt || "(No prompt recorded)"}
                rows={8}
                className="font-mono text-xs bg-muted/30 resize-none"
              />
            </TabsContent>

            <TabsContent value="compensation" className="mt-3">
              <Textarea
                readOnly
                value={configCompensationBaseline || "(No compensation baseline recorded)"}
                rows={4}
                className="font-mono text-xs bg-muted/30 resize-none"
              />
            </TabsContent>

            <TabsContent value="stories" className="mt-3">
              <Textarea
                readOnly
                value={configCareerStories || "(No career stories recorded)"}
                rows={10}
                className="font-mono text-xs bg-muted/30 resize-none"
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
