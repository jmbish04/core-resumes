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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { BulletRow } from "./ResumeBulletsEditor";

// ── Types ────────────────────────────────────────────────────────────────

export type BulletFormData = {
  content: string;
  category: "Strategic" | "Technical" | "Impact" | "Collaboration";
  impactMetric: string;
  tags: string;
  notes: string;
};

type BulletFormModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: BulletRow | null;
  onSubmit: (data: BulletFormData) => Promise<void>;
};

const CATEGORIES = ["Strategic", "Technical", "Impact", "Collaboration"] as const;

// ── Component ────────────────────────────────────────────────────────────

/**
 * Modal dialog for creating or editing a resume bullet point.
 *
 * When `initial` is provided, the form is pre-populated for editing.
 * On submit, the parent component decides whether to POST (create) or
 * PUT (edit → creates revision) via the `onSubmit` callback.
 */
export function BulletFormModal({ open, onOpenChange, initial, onSubmit }: BulletFormModalProps) {
  const isEditing = !!initial;

  const [content, setContent] = useState(initial?.content ?? "");
  const [category, setCategory] = useState<BulletFormData["category"]>(
    (initial?.category as BulletFormData["category"]) ?? "Strategic",
  );
  const [impactMetric, setImpactMetric] = useState(initial?.impactMetric ?? "");
  const [tags, setTags] = useState(initial?.tags ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  // Reset form when modal opens with new initial data
  function resetToInitial() {
    setContent(initial?.content ?? "");
    setCategory((initial?.category as BulletFormData["category"]) ?? "Strategic");
    setImpactMetric(initial?.impactMetric ?? "");
    setTags(initial?.tags ?? "");
    setNotes(initial?.notes ?? "");
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!content.trim()) return;

    setSaving(true);

    try {
      await onSubmit({ content, category, impactMetric, tags, notes });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) resetToInitial();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent onClose={() => onOpenChange(false)} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Bullet" : "Add Bullet"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Editing creates a new version. The original is preserved in the revision history."
              : "Add a verified career accomplishment for Colby to use when drafting."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-4 py-2">
          {/* Content */}
          <div className="grid gap-1.5">
            <Label htmlFor="bullet-content">
              Content <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="bullet-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Describe a specific, quantified accomplishment…"
              rows={4}
              required
            />
          </div>

          {/* Category + Impact Metric (side by side) */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="bullet-category">Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as BulletFormData["category"])}
              >
                <SelectTrigger id="bullet-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="bullet-impact">Impact Metric</Label>
              <Input
                id="bullet-impact"
                value={impactMetric}
                onChange={(e) => setImpactMetric(e.target.value)}
                placeholder='e.g. "$16M Savings"'
              />
            </div>
          </div>

          {/* Tags */}
          <div className="grid gap-1.5">
            <Label htmlFor="bullet-tags">Tags</Label>
            <Input
              id="bullet-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Comma-separated: AI, SQL, Leadership"
            />
          </div>

          {/* Notes */}
          <div className="grid gap-1.5">
            <Label htmlFor="bullet-notes">Notes (agent-only context)</Label>
            <Textarea
              id="bullet-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal context for the AI agent — not shown to employers."
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !content.trim()}>
              {saving ? "Saving…" : isEditing ? "Save New Version" : "Add Bullet"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
