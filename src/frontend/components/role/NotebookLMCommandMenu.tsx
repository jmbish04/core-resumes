/**
 * @fileoverview NotebookLM Command Menu — 3-state modal flow for triggering
 * on-demand NotebookLM actions (podcast, mind map, report, etc.) for a role.
 *
 * Flow: Command Palette → Confirm (read-only prompt) → Edit (textarea) → Confirm → Execute
 *
 * State machine:
 *   1. "confirm" — shows hydrated prompt read-only with Cancel/Edit/Submit
 *   2. "edit"    — textarea with template tag docs, Cancel/Save & Review
 *   3. "confirm" (isModified=true) — shows modified prompt, Cancel has guard
 */

import {
  BookOpen,
  Brain,
  Check,
  FileText,
  FlaskConical,
  Image,
  Layers,
  Loader2,
  Mic,
  Pencil,
  Presentation,
  Search,
  Table2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPost, toast } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type NotebookLMAction =
  | "create_podcast"
  | "create_mind_map"
  | "create_report"
  | "create_quiz"
  | "create_flashcards"
  | "create_infographic"
  | "create_slide_deck"
  | "create_data_table"
  | "deep_research";

type ActionItem = {
  action: NotebookLMAction;
  label: string;
  description: string;
  icon: React.ReactNode;
};

type ModalView = "confirm" | "edit";

type PromptResponse = {
  prompt: string;
  isDefault: boolean;
  configKey: string;
  templateTags: Array<{ tag: string; description: string }>;
};

// ---------------------------------------------------------------------------
// Action definitions
// ---------------------------------------------------------------------------

const ARTIFACT_ACTIONS: ActionItem[] = [
  {
    action: "create_podcast",
    label: "Create Podcast",
    description: "Generate a NotebookLM podcast about this role",
    icon: <Mic className="size-4" />,
  },
  {
    action: "create_mind_map",
    label: "Create Mind Map",
    description: "Generate a visual mind map of key role aspects",
    icon: <Brain className="size-4" />,
  },
  {
    action: "create_report",
    label: "Create Report",
    description: "Generate a detailed analysis report",
    icon: <FileText className="size-4" />,
  },
  {
    action: "create_quiz",
    label: "Create Quiz",
    description: "Generate interview-prep quiz questions",
    icon: <FlaskConical className="size-4" />,
  },
  {
    action: "create_flashcards",
    label: "Create Flashcards",
    description: "Generate study flashcards for this role",
    icon: <Layers className="size-4" />,
  },
  {
    action: "create_infographic",
    label: "Create Infographic",
    description: "Generate a visual infographic summary",
    icon: <Image className="size-4" />,
  },
  {
    action: "create_slide_deck",
    label: "Create Slide Deck",
    description: "Generate a presentation about this role",
    icon: <Presentation className="size-4" />,
  },
  {
    action: "create_data_table",
    label: "Create Data Table",
    description: "Generate a comparative data table",
    icon: <Table2 className="size-4" />,
  },
];

const RESEARCH_ACTIONS: ActionItem[] = [
  {
    action: "deep_research",
    label: "Deep Research",
    description: "Run deep web research about the company and role",
    icon: <Search className="size-4" />,
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotebookLMCommandMenu({ roleId }: { roleId: string }) {
  // ── Command palette state ──
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ── 3-state modal state ──
  const [modalOpen, setModalOpen] = useState(false);
  const [modalView, setModalView] = useState<ModalView>("confirm");
  const [pendingAction, setPendingAction] = useState<ActionItem | null>(null);

  // ── Prompt state ──
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [activePrompt, setActivePrompt] = useState("");
  const [editingPrompt, setEditingPrompt] = useState("");
  const [isModified, setIsModified] = useState(false);
  const [templateTags, setTemplateTags] = useState<PromptResponse["templateTags"]>([]);
  const [promptLoading, setPromptLoading] = useState(false);

  // ── Execution state ──
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Discard guard ──
  const [showDiscardGuard, setShowDiscardGuard] = useState(false);

  // ── Fetch hydrated prompt from backend ──
  const fetchPrompt = useCallback(
    async (action: string) => {
      setPromptLoading(true);
      try {
        const data = await apiGet<PromptResponse>(
          `/api/roles/${encodeURIComponent(roleId)}/notebooklm/prompt/${action}`,
        );
        setDefaultPrompt(data.prompt);
        setActivePrompt(data.prompt);
        setTemplateTags(data.templateTags);
      } catch {
        const fallback = `Generate content for this role.`;
        setDefaultPrompt(fallback);
        setActivePrompt(fallback);
        setTemplateTags([]);
      } finally {
        setPromptLoading(false);
      }
    },
    [roleId],
  );

  // ── Reset modal state ──
  const resetModal = useCallback(() => {
    setModalOpen(false);
    setModalView("confirm");
    setPendingAction(null);
    setDefaultPrompt("");
    setActivePrompt("");
    setEditingPrompt("");
    setIsModified(false);
    setShowDiscardGuard(false);
  }, []);

  // ── Handle action selection from command palette ──
  const handleSelect = useCallback(
    (item: ActionItem) => {
      setPaletteOpen(false);
      setPendingAction(item);
      setIsModified(false);
      setModalView("confirm");
      setModalOpen(true);
      void fetchPrompt(item.action);
    },
    [fetchPrompt],
  );

  // ── Handle cancel in confirm view ──
  const handleCancel = useCallback(() => {
    if (isModified) {
      setShowDiscardGuard(true);
    } else {
      resetModal();
    }
  }, [isModified, resetModal]);

  // ── Handle entering edit mode ──
  const handleEnterEdit = useCallback(() => {
    setEditingPrompt(activePrompt);
    setModalView("edit");
  }, [activePrompt]);

  // ── Handle saving edits and returning to confirm ──
  const handleSaveEdit = useCallback(() => {
    setActivePrompt(editingPrompt);
    setIsModified(editingPrompt !== defaultPrompt);
    setModalView("confirm");
  }, [editingPrompt, defaultPrompt]);

  // ── Handle cancel from edit (discard edits) ──
  const handleCancelEdit = useCallback(() => {
    // Discard edits — revert to what activePrompt was before editing
    setEditingPrompt("");
    setModalView("confirm");
  }, []);

  // ── Execute the action ──
  const handleSubmit = useCallback(async () => {
    if (!pendingAction) return;
    setIsSubmitting(true);
    try {
      await apiPost(
        `/api/roles/${encodeURIComponent(roleId)}/notebooklm/actions`,
        { action: pendingAction.action, prompt: activePrompt },
      );
      toast({
        title: `${pendingAction.label} triggered`,
        description: "The action has been queued for processing.",
      });
      resetModal();
    } catch (err) {
      toast({
        title: "Action failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [pendingAction, roleId, activePrompt, resetModal]);

  // ── Handle dialog close attempt (X button or escape) ──
  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        handleCancel();
      }
    },
    [handleCancel],
  );

  return (
    <>
      {/* Trigger button */}
      <Button
        onClick={() => setPaletteOpen(true)}
        variant="outline"
        size="sm"
        className="gap-1.5"
      >
        <BookOpen className="size-3.5" />
        NotebookLM
      </Button>

      {/* ── Command palette ── */}
      <CommandDialog open={paletteOpen} onOpenChange={setPaletteOpen}>
        <Command>
          <CommandInput placeholder="Search NotebookLM actions..." />
          <CommandList>
            <CommandEmpty>No actions found.</CommandEmpty>

            <CommandGroup heading="Generate Artifacts">
              {ARTIFACT_ACTIONS.map((item) => (
                <CommandItem
                  key={item.action}
                  onSelect={() => handleSelect(item)}
                >
                  {item.icon}
                  <div className="flex flex-col">
                    <span>{item.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandSeparator />

            <CommandGroup heading="Research">
              {RESEARCH_ACTIONS.map((item) => (
                <CommandItem
                  key={item.action}
                  onSelect={() => handleSelect(item)}
                >
                  {item.icon}
                  <div className="flex flex-col">
                    <span>{item.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>

      {/* ── 3-state modal ── */}
      <Dialog open={modalOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {pendingAction?.icon}
              <span>{pendingAction?.label}</span>
              {isModified && (
                <Badge variant="secondary" className="text-[10px]">
                  Modified
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {/* Loading state */}
          {promptLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground justify-center">
              <Loader2 className="size-4 animate-spin" />
              Loading prompt template...
            </div>
          ) : modalView === "confirm" ? (
            /* ── CONFIRM VIEW ── */
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                {pendingAction?.description}. Review the prompt below before
                sending to NotebookLM:
              </p>

              {/* Read-only prompt display */}
              <div className="rounded-md border border-border bg-muted/30 p-4">
                <pre className="whitespace-pre-wrap break-words text-sm font-mono leading-relaxed text-foreground">
                  {activePrompt}
                </pre>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  className="gap-1.5"
                >
                  <X className="size-3.5" />
                  Cancel
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleEnterEdit}
                  className="gap-1.5"
                >
                  <Pencil className="size-3.5" />
                  Edit Prompt
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleSubmit()}
                  disabled={isSubmitting}
                  className="gap-1.5"
                >
                  {isSubmitting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  {isSubmitting ? "Sending..." : "Submit"}
                </Button>
              </div>
            </div>
          ) : (
            /* ── EDIT VIEW ── */
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                Edit the prompt template below. Template tags will be
                hydrated with role data at runtime.
              </p>

              {/* Template tag reference */}
              {templateTags.length > 0 && (
                <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                  <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Available Template Tags
                  </div>
                  <div className="grid gap-1">
                    {templateTags.map((t) => (
                      <div
                        key={t.tag}
                        className="flex items-baseline gap-2 text-sm"
                      >
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-primary">
                          {t.tag}
                        </code>
                        <span className="text-muted-foreground text-xs">
                          {t.description}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Editable textarea */}
              <Textarea
                value={editingPrompt}
                onChange={(e) => setEditingPrompt(e.target.value)}
                rows={8}
                className="font-mono text-sm"
                placeholder="Enter your prompt..."
              />

              {/* Action buttons */}
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelEdit}
                  className="gap-1.5"
                >
                  <X className="size-3.5" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveEdit}
                  className="gap-1.5"
                >
                  <Check className="size-3.5" />
                  Save &amp; Review
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Discard guard alert dialog ── */}
      <AlertDialog open={showDiscardGuard} onOpenChange={setShowDiscardGuard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard modifications?</AlertDialogTitle>
            <AlertDialogDescription>
              Your prompt modifications will be lost. Are you sure you want to
              close?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction onClick={resetModal}>
              Discard &amp; Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
