/**
 * @fileoverview StatusTransitionModal — prompts for optional rich-text notes
 * when transitioning to a status that has `requires_notes_prompt` set.
 *
 * Uses a simple textarea for now. TipTap integration will be layered on
 * once the tiptap-shadcn components are installed.
 */

import { ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";

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
import { apiPost, toast } from "@/lib/api-client";

import type { RoleRow } from "../dashboard/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatusTransitionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: RoleRow;
  fromStatus: string;
  toStatus: string;
  toStatusLabel: string;
  onTransitionComplete: (updatedRole: RoleRow) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StatusTransitionModal({
  open,
  onOpenChange,
  role,
  fromStatus,
  toStatus,
  toStatusLabel,
  onTransitionComplete,
}: StatusTransitionModalProps) {
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(includeNotes: boolean) {
    setIsSubmitting(true);
    try {
      await apiPost(`/api/roles/${role.id}/status-transition`, {
        newStatus: toStatus,
        notes: includeNotes ? notes || undefined : undefined,
        trigger: "user",
      });

      toast({
        title: "Status updated",
        description: `Transitioned to ${toStatusLabel}`,
      });

      // Update parent with new status
      onTransitionComplete({ ...role, status: toStatus });
      onOpenChange(false);
      setNotes("");
    } catch (err) {
      toast({
        title: "Transition failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const fromLabel = fromStatus.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Status Transition</DialogTitle>
          <DialogDescription className="flex items-center gap-2 pt-1">
            <span className="font-medium text-foreground">{fromLabel}</span>
            <ArrowRight className="size-4 text-muted-foreground" />
            <span className="font-medium text-foreground">{toStatusLabel}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div>
            <label htmlFor="transition-notes" className="text-sm font-medium text-foreground">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              id="transition-notes"
              placeholder="Add context about this transition... e.g. interview scheduled for next week, offer details, reason for withdrawal"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1.5 min-h-[120px] resize-none"
              disabled={isSubmitting}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => void handleSubmit(false)} disabled={isSubmitting}>
            Skip Notes
          </Button>
          <Button onClick={() => void handleSubmit(true)} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Save & Transition
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
