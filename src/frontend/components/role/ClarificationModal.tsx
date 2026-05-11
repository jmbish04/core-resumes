"use client";

import { useEffect, useState } from "react";
import { MessageSquarePlusIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface ClarificationModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  bulletId: number;
  bulletContent: string;
  initialClarification: string;
  onSave: (clarification: string) => void;
}

export function ClarificationModal({
  isOpen,
  onOpenChange,
  bulletContent,
  initialClarification,
  onSave,
}: ClarificationModalProps) {
  const [value, setValue] = useState(initialClarification);

  // Sync state when opened with a new bullet
  useEffect(() => {
    if (isOpen) {
      setValue(initialClarification);
    }
  }, [isOpen, initialClarification]);

  function handleSave() {
    onSave(value);
    onOpenChange(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlusIcon className="size-5 text-muted-foreground" />
            Provide Clarifying Context
          </DialogTitle>
          <DialogDescription className="pt-2">
            The AI scored this bullet lower than 90. Provide additional context, examples, or metrics from your career to help the AI better understand your fit for this requirement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground border border-border/50">
            <span className="font-semibold text-foreground">Requirement: </span>
            {bulletContent}
          </div>

          <div className="space-y-2">
            <Textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. While I don't have this exact tool, I built a similar internal system that scaled to 5M DAU..."
              className="min-h-[120px] resize-none"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Clarification</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
