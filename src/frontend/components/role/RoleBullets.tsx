"use client";

import {
  AlertTriangleIcon,
  ChevronDownIcon,
  InfoIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrashIcon,
  XIcon,
  CheckIcon,
  RefreshCwIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiPost, toast } from "@/lib/api-client";

import { ClarificationModal } from "./ClarificationModal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FidelityStatus = "verified" | "auto_corrected" | "dom_only" | null;

interface RoleBulletRow {
  id: number;
  roleId: string;
  type: string;
  content: string;
  sortOrder: number;
  aiScore: number | null;
  previousAiScore: number | null;
  aiRationale: string | null;
  revisionNumber: number | null;
  fidelityStatus: FidelityStatus;
}

interface RoleBulletsProps {
  roleId: string;
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
};

const TYPE_ORDER = [
  "KEY_RESPONSIBILITY",
  "REQUIRED_QUALIFICATION",
  "PREFERRED_QUALIFICATION",
  "REQUIRED_SKILL",
  "PREFERRED_SKILL",
  "EDUCATION_REQUIREMENT",
  "BENEFIT",
];

function getScoreTier(score: number | null) {
  if (score === null || score === undefined) {
    return { color: "bg-muted/50 text-muted-foreground border-border", label: "—" };
  }
  if (score >= 75) {
    return {
      color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      label: score.toString(),
    };
  }
  if (score >= 40) {
    return {
      color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      label: score.toString(),
    };
  }
  return {
    color: "bg-red-500/10 text-red-400 border-red-500/20",
    label: score.toString(),
  };
}

function getFidelityIndicator(status: FidelityStatus) {
  switch (status) {
    case "auto_corrected":
      return {
        borderClass: "border-l-2 border-l-amber-500/60",
        icon: <AlertTriangleIcon className="size-3.5 text-amber-400" />,
        tooltip: "Auto-corrected: AI truncated this bullet. Full text restored from DOM.",
      };
    case "dom_only":
      return {
        borderClass: "border-l-2 border-l-red-500/60",
        icon: <InfoIcon className="size-3.5 text-red-400" />,
        tooltip: "Added from DOM: AI missed this bullet entirely. Please verify.",
      };
    case "verified":
      return {
        borderClass: "border-l-2 border-l-emerald-500/30",
        icon: <ShieldCheckIcon className="size-3.5 text-emerald-500/50" />,
        tooltip: "Verified: Matches DOM source.",
      };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// BulletItem — single bullet with score badge + expandable rationale
// ---------------------------------------------------------------------------

function BulletItem({
  bullet,
  roleId,
  pendingClarification,
  isExpanded,
  onExpandedChange,
  onDelete,
  onUpdate,
  onClarify,
}: {
  bullet: RoleBulletRow;
  roleId: string;
  pendingClarification?: string;
  isExpanded: boolean;
  onExpandedChange: (id: number, open: boolean) => void;
  onDelete: (id: number) => void;
  onUpdate: (id: number, content: string) => void;
  onClarify: (id: number, text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [clarifyModalOpen, setClarifyModalOpen] = useState(false);
  const [editValue, setEditValue] = useState(bullet.content);
  const tier = getScoreTier(bullet.aiScore);
  const previousTier =
    bullet.previousAiScore !== null ? getScoreTier(bullet.previousAiScore) : null;

  const needsClarification =
    bullet.aiScore !== null && bullet.aiScore < 90 && !pendingClarification;

  async function handleSave() {
    if (!editValue.trim()) return;
    try {
      await fetch(`/api/roles/${roleId}/bullets/${bullet.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: editValue.trim() }),
      });
      onUpdate(bullet.id, editValue.trim());
      setEditing(false);
    } catch {
      toast({ title: "Update failed", variant: "destructive" });
    }
  }

  async function handleDelete() {
    try {
      await fetch(`/api/roles/${roleId}/bullets/${bullet.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      onDelete(bullet.id);
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    }
  }

  if (editing) {
    return (
      <div className="flex items-start gap-2 py-1.5 px-3">
        <Badge
          variant="outline"
          className={`${tier.color} font-mono text-xs min-w-[44px] justify-center mt-1.5`}
        >
          {tier.label}
        </Badge>
        <Textarea
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className="flex-1 resize-none text-sm min-h-[2.25rem]"
          rows={Math.max(2, Math.ceil(editValue.length / 80))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSave();
            }
            if (e.key === "Escape") {
              setEditValue(bullet.content);
              setEditing(false);
            }
          }}
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-emerald-400"
          onClick={() => void handleSave()}
        >
          <CheckIcon className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground"
          onClick={() => {
            setEditValue(bullet.content);
            setEditing(false);
          }}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
    );
  }

  const fidelityIndicator = getFidelityIndicator(bullet.fidelityStatus);

  return (
    <Collapsible open={isExpanded} onOpenChange={(open) => onExpandedChange(bullet.id, open)}>
      <div className={`group flex items-center gap-1 ${fidelityIndicator?.borderClass ?? ""}`}>
        <CollapsibleTrigger className="flex flex-1 items-center gap-3 py-2 px-3 rounded-md hover:bg-muted/50 transition-colors text-left group/trigger relative">
          <div className="flex flex-col items-center gap-0.5">
            {previousTier && (
              <span className="text-[10px] text-muted-foreground line-through opacity-70">
                {previousTier.label}
              </span>
            )}
            <Badge
              variant="outline"
              className={`font-mono text-xs min-w-[44px] justify-center cursor-pointer transition-transform hover:scale-105 active:scale-95 ${tier.color} ${needsClarification ? "animate-vibrate shadow-[0_0_8px_rgba(251,191,36,0.3)]" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setClarifyModalOpen(true);
              }}
            >
              {tier.label}
            </Badge>
          </div>
          <span className="flex-1 text-sm">
            {bullet.content}
            {pendingClarification && (
              <span className="ml-2 inline-flex items-center rounded-sm bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                Draft Saved
              </span>
            )}
          </span>
          {fidelityIndicator && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="shrink-0 cursor-help">{fidelityIndicator.icon}</span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  {fidelityIndicator.tooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {bullet.aiRationale && (
            <ChevronDownIcon
              className={`size-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          )}
        </CollapsibleTrigger>
        <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            onClick={() => setEditing(true)}
          >
            <PencilIcon className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => void handleDelete()}
          >
            <TrashIcon className="size-3" />
          </Button>
        </div>
      </div>
      {bullet.aiRationale && (
        <CollapsibleContent>
          <div className="pl-14 pr-3 pb-2">
            <p className="text-sm text-muted-foreground leading-relaxed">{bullet.aiRationale}</p>
            {bullet.revisionNumber && bullet.revisionNumber > 1 && (
              <span className="mt-1 inline-block text-xs text-muted-foreground/60">
                Revision #{bullet.revisionNumber}
              </span>
            )}
          </div>
        </CollapsibleContent>
      )}

      <ClarificationModal
        isOpen={clarifyModalOpen}
        onOpenChange={setClarifyModalOpen}
        bulletId={bullet.id}
        bulletContent={bullet.content}
        initialClarification={pendingClarification || ""}
        onSave={(text) => onClarify(bullet.id, text)}
      />
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// BulletTypeSection — group header + items for a single type
// ---------------------------------------------------------------------------

function BulletTypeSection({
  type,
  bullets,
  roleId,
  pendingClarifications,
  expandedBullets,
  onExpandedChange,
  onExpandCategory,
  onDelete,
  onUpdate,
  onAdd,
  onClarify,
}: {
  type: string;
  bullets: RoleBulletRow[];
  roleId: string;
  pendingClarifications: Record<number, string>;
  expandedBullets: Set<number>;
  onExpandedChange: (id: number, open: boolean) => void;
  onExpandCategory: (type: string, expand: boolean) => void;
  onDelete: (id: number) => void;
  onUpdate: (id: number, content: string) => void;
  onAdd: (type: string, content: string) => void;
  onClarify: (id: number, text: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newContent, setNewContent] = useState("");

  // Compute summary stats
  const scored = bullets.filter((b) => b.aiScore !== null);
  const avgScore =
    scored.length > 0
      ? Math.round(scored.reduce((sum, b) => sum + (b.aiScore ?? 0), 0) / scored.length)
      : null;

  const avgTier = getScoreTier(avgScore);

  async function handleAdd() {
    if (!newContent.trim()) return;
    onAdd(type, newContent.trim());
    setNewContent("");
    setAdding(false);
  }

  const allExpanded = bullets.length > 0 && bullets.every((b) => expandedBullets.has(b.id));

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {TYPE_LABELS[type] ?? type}
        </span>
        <Badge variant="secondary" className="text-xs">
          {bullets.length}
        </Badge>
        {avgScore !== null && (
          <Badge variant="outline" className={`${avgTier.color} text-xs ml-1`}>
            avg {avgScore}
          </Badge>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={() => onExpandCategory(type, !allExpanded)}
          >
            {allExpanded ? "Collapse" : "Expand"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setAdding(true)}
          >
            <PlusIcon className="size-3 mr-1" />
            Add
          </Button>
        </div>
      </div>

      <div className="space-y-0.5">
        {bullets.map((bullet) => (
          <BulletItem
            key={bullet.id}
            bullet={bullet}
            roleId={roleId}
            pendingClarification={pendingClarifications[bullet.id]}
            isExpanded={expandedBullets.has(bullet.id)}
            onExpandedChange={onExpandedChange}
            onDelete={onDelete}
            onUpdate={onUpdate}
            onClarify={onClarify}
          />
        ))}
      </div>

      {adding && (
        <div className="flex items-start gap-2 px-3 py-1.5">
          <Textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Enter bullet content…"
            className="flex-1 resize-none text-sm min-h-[2.25rem]"
            rows={Math.max(2, Math.ceil(newContent.length / 80))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleAdd();
              }
              if (e.key === "Escape") {
                setNewContent("");
                setAdding(false);
              }
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void handleAdd()}
          >
            Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => {
              setNewContent("");
              setAdding(false);
            }}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// RoleBullets — exported component
// ---------------------------------------------------------------------------

export function RoleBullets({ roleId }: RoleBulletsProps) {
  const [bullets, setBullets] = useState<RoleBulletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingClarifications, setPendingClarifications] = useState<Record<number, string>>({});
  const [pendingEdits, setPendingEdits] = useState<Record<number, boolean>>({});
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [expandedBullets, setExpandedBullets] = useState<Set<number>>(new Set());

  // Load drafts from localStorage on mount
  useEffect(() => {
    const cached = localStorage.getItem(`clarifications-${roleId}`);
    if (cached) {
      try {
        setPendingClarifications(JSON.parse(cached));
      } catch {
        // ignore
      }
    }
    const editsCached = localStorage.getItem(`edits-${roleId}`);
    if (editsCached) {
      try {
        setPendingEdits(JSON.parse(editsCached));
      } catch {
        // ignore
      }
    }
  }, [roleId]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/roles/${roleId}/bullets`, { credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as { bullets: RoleBulletRow[] };
        setBullets(data.bullets ?? []);
      }
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, [roleId]);

  useEffect(() => {
    load();
  }, [load]);

  function handleDelete(id: number) {
    setBullets((prev) => prev.filter((b) => b.id !== id));
  }

  function handleUpdate(id: number, content: string) {
    setBullets((prev) => prev.map((b) => (b.id === id ? { ...b, content } : b)));
    setPendingEdits((prev) => {
      const next = { ...prev, [id]: true };
      localStorage.setItem(`edits-${roleId}`, JSON.stringify(next));
      return next;
    });
  }

  async function handleAdd(type: string, content: string) {
    try {
      const res = await fetch(`/api/roles/${roleId}/bullets/single`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type, content }),
      });
      if (res.ok) {
        const created = (await res.json()) as RoleBulletRow;
        setBullets((prev) => [
          ...prev,
          {
            ...created,
            aiScore: null,
            previousAiScore: null,
            aiRationale: null,
            revisionNumber: null,
            fidelityStatus: null,
          },
        ]);
      }
    } catch {
      toast({ title: "Failed to add bullet", variant: "destructive" });
    }
  }

  function handleClarify(id: number, text: string) {
    setPendingClarifications((prev) => {
      const next = { ...prev };
      if (!text.trim()) {
        delete next[id];
      } else {
        next[id] = text;
      }
      localStorage.setItem(`clarifications-${roleId}`, JSON.stringify(next));
      return next;
    });
  }

  async function handleReprocess() {
    setIsReprocessing(true);
    try {
      const payload = Object.entries(pendingClarifications).map(([id, text]) => {
        const bullet = bullets.find((b) => b.id === Number(id));
        return {
          bulletId: Number(id),
          content: bullet?.content || "",
          clarification: text,
        };
      });

      await apiPost(`/api/roles/${roleId}/analysis/clarify-and-reprocess`, {
        clarifications: payload,
      });

      toast({ title: "Reprocessing started", description: "The AI is re-analyzing your bullets." });
      setPendingClarifications({});
      setPendingEdits({});
      localStorage.removeItem(`clarifications-${roleId}`);
      localStorage.removeItem(`edits-${roleId}`);
    } catch {
      toast({ title: "Reprocessing failed", variant: "destructive" });
    } finally {
      setIsReprocessing(false);
    }
  }

  function handleExpandedChange(id: number, open: boolean) {
    setExpandedBullets((prev) => {
      const next = new Set(prev);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handleExpandCategory(type: string, expand: boolean) {
    setExpandedBullets((prev) => {
      const next = new Set(prev);
      const categoryBullets = bullets.filter((b) => b.type === type);
      categoryBullets.forEach((b) => {
        if (expand) next.add(b.id);
        else next.delete(b.id);
      });
      return next;
    });
  }

  function handleExpandAll(expand: boolean) {
    if (expand) {
      setExpandedBullets(new Set(bullets.map((b) => b.id)));
    } else {
      setExpandedBullets(new Set());
    }
  }

  function handleExpandUncorrected() {
    const uncorrected = bullets.filter(
      (b) => b.aiScore !== null && b.aiScore < 90 && !pendingClarifications[b.id],
    );
    setExpandedBullets(new Set(uncorrected.map((b) => b.id)));
  }

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState("");

  const handleExportJson = async () => {
    const exportData: Record<string, any[]> = {};
    for (const bullet of bullets) {
      if (!exportData[bullet.type]) exportData[bullet.type] = [];
      exportData[bullet.type].push({
        bullet_id: bullet.id,
        bullet_text: bullet.content,
        ai_score: bullet.aiScore,
        ai_rationale: bullet.aiRationale || "",
        feedback_corrections: pendingClarifications[bullet.id] || "",
      });
    }

    const promptText = `I am analyzing the following job description bullets. Please review my career data in NotebookLM and provide updated scores and rationales, as well as any feedback/corrections to improve my hireability for these bullets.

Return your response as a JSON object in this format:
\`\`\`json
{
  "corrections": [
    {
      "bullet_id": 123,
      "new_score": 95,
      "ai_rationale": "Your updated rationale here",
      "feedback_corrections": "What I should do to improve"
    }
  ]
}
\`\`\`

Here are the bullets:
\`\`\`json
${JSON.stringify(exportData, null, 2)}
\`\`\``;

    await navigator.clipboard.writeText(promptText);
    toast({ title: "Copied to clipboard", description: "Prompt and JSON copied to clipboard." });
  };

  const handleImportJson = () => {
    try {
      const text = importJsonText;
      let jsonStr = text;
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        jsonStr = match[0];
      }

      const parsed = JSON.parse(jsonStr);
      if (parsed.corrections && Array.isArray(parsed.corrections)) {
        const nextClarifications = { ...pendingClarifications };
        let count = 0;
        parsed.corrections.forEach((c: any) => {
          if (c.bullet_id && c.feedback_corrections) {
            nextClarifications[c.bullet_id] = c.feedback_corrections;
            count++;
          }
        });
        setPendingClarifications(nextClarifications);
        localStorage.setItem(`clarifications-${roleId}`, JSON.stringify(nextClarifications));
        toast({
          title: "Import successful",
          description: `Imported ${count} feedback items as drafts.`,
        });
        setImportModalOpen(false);
        setImportJsonText("");
      } else {
        toast({
          title: "Invalid format",
          description: "Missing 'corrections' array in JSON.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Parse error",
        description: "Could not parse JSON. Check format.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (bullets.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-muted-foreground text-sm">
            No role bullets found. Add bullets via the intake form or manually below.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group by type in defined order
  const grouped = new Map<string, RoleBulletRow[]>();
  for (const type of TYPE_ORDER) {
    const items = bullets.filter((b) => b.type === type);
    if (items.length > 0) {
      grouped.set(type, items);
    }
  }
  // Include any types not in TYPE_ORDER
  for (const bullet of bullets) {
    if (!TYPE_ORDER.includes(bullet.type)) {
      const existing = grouped.get(bullet.type) ?? [];
      existing.push(bullet);
      grouped.set(bullet.type, existing);
    }
  }

  const pendingCount = new Set([
    ...Object.keys(pendingClarifications),
    ...Object.keys(pendingEdits),
  ]).size;

  return (
    <div className="space-y-4">
      {pendingCount > 0 && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <h4 className="font-medium text-sm text-foreground">You have pending changes</h4>
            <p className="text-xs text-muted-foreground">
              You've adjusted {pendingCount} bullet{pendingCount > 1 ? "s" : ""} via direct edit or
              clarification. Submit them to recalculate your hireability score.
            </p>
          </div>
          <Button onClick={handleReprocess} disabled={isReprocessing} size="sm">
            {isReprocessing ? (
              <Loader2Icon className="mr-2 size-4 animate-spin" />
            ) : (
              <RefreshCwIcon className="mr-2 size-4" />
            )}
            Reprocess All
          </Button>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-base">Role Bullets</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExpandAll(true)}>
              Expand All
            </Button>
            <Button variant="outline" size="sm" onClick={handleExpandUncorrected}>
              Expand Uncorrected
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportJson}>
              Export Prompt
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportModalOpen(true)}>
              Import JSON
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from(grouped.entries()).map(([type, items]) => (
            <BulletTypeSection
              key={type}
              type={type}
              bullets={items}
              roleId={roleId}
              pendingClarifications={pendingClarifications}
              expandedBullets={expandedBullets}
              onExpandedChange={handleExpandedChange}
              onExpandCategory={handleExpandCategory}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
              onAdd={handleAdd}
              onClarify={handleClarify}
            />
          ))}
        </CardContent>
      </Card>

      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent onClose={() => setImportModalOpen(false)}>
          <DialogHeader>
            <DialogTitle>Import JSON Feedback</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <p className="text-sm text-muted-foreground">
              Paste the JSON response from your AI here, or upload a JSON file. It will be parsed
              and loaded as draft clarifications.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".json"
                className="text-sm text-muted-foreground file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const text = await file.text();
                    setImportJsonText(text);
                  }
                }}
              />
            </div>
            <Textarea
              className="min-h-[200px] font-mono text-xs"
              placeholder='{ "corrections": [ ... ] }'
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setImportModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleImportJson}>Import Feedback</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
