/**
 * @fileoverview RoleActionsDialog — sidebar-13 inspired command menu for
 * triggering agentic tasks on a role (resume, cover letter, drive, analysis, etc).
 */

import {
  BarChart3,
  BookOpen,
  FileText,
  HardDrive,
  Loader2,
  Mic,
  Settings,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiPost, toast } from "@/lib/api-client";

import type { RoleRow } from "../dashboard/types";

// ---------------------------------------------------------------------------
// Action definitions
// ---------------------------------------------------------------------------

type ActionCategory = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  actions: ActionItem[];
};

type ActionItem = {
  id: string;
  label: string;
  description: string;
  handler: (role: RoleRow, setRole: (r: RoleRow) => void) => Promise<void>;
};

function buildCategories(
  setGenerating: (id: string | null) => void,
): ActionCategory[] {
  return [
    {
      label: "Documents",
      icon: FileText,
      actions: [
        {
          id: "generate_resume",
          label: "Create Resume",
          description: "Generate an AI-drafted resume tailored to this role",
          handler: async (role) => {
            setGenerating("generate_resume");
            try {
              await apiPost(`/api/roles/${role.id}/generate`, { type: "resume" });
              toast({
                title: "Resume generation started",
                description: "Check the Pipeline tab for progress.",
              });
            } finally {
              setGenerating(null);
            }
          },
        },
        {
          id: "generate_cover_letter",
          label: "Create Cover Letter",
          description: "Generate an AI-drafted cover letter for this role",
          handler: async (role) => {
            setGenerating("generate_cover_letter");
            try {
              await apiPost(`/api/roles/${role.id}/generate`, {
                type: "cover_letter",
              });
              toast({
                title: "Cover letter generation started",
                description: "Check the Pipeline tab for progress.",
              });
            } finally {
              setGenerating(null);
            }
          },
        },
      ],
    },
    {
      label: "Drive",
      icon: HardDrive,
      actions: [
        {
          id: "open_drive",
          label: "Open Drive Folder",
          description: "Open this role's Google Drive folder",
          handler: async (role) => {
            if (role.driveFolderId) {
              window.open(
                `https://drive.google.com/drive/folders/${role.driveFolderId}`,
                "_blank",
              );
            } else {
              toast({
                title: "No Drive folder",
                description: "Create one first using the action below.",
                variant: "destructive",
              });
            }
          },
        },
        {
          id: "create_drive",
          label: "Create Drive Folder",
          description: "Create a Google Drive folder for this role's documents",
          handler: async (role, setRole) => {
            setGenerating("create_drive");
            try {
              const res = await apiPost<{ driveFolderId: string }>(
                `/api/roles/${role.id}/drive`,
                {},
              );
              setRole({ ...role, driveFolderId: res.driveFolderId });
              toast({ title: "Folder created", description: "Drive folder ready." });
              window.open(
                `https://drive.google.com/drive/folders/${res.driveFolderId}`,
                "_blank",
              );
            } finally {
              setGenerating(null);
            }
          },
        },
      ],
    },
    {
      label: "Analysis",
      icon: BarChart3,
      actions: [
        {
          id: "run_analysis",
          label: "Run Hireability Analysis",
          description: "Execute the full AI hireability scoring pipeline",
          handler: async (role) => {
            setGenerating("run_analysis");
            try {
              await apiPost(`/api/roles/${role.id}/analysis`, {});
              toast({
                title: "Analysis started",
                description: "Hireability scoring is in progress.",
              });
            } finally {
              setGenerating(null);
            }
          },
        },
        {
          id: "run_ats",
          label: "Run ATS Score",
          description: "Score the latest resume against job requirements",
          handler: async (role) => {
            setGenerating("run_ats");
            try {
              await apiPost(`/api/roles/${role.id}/ats-score`, {});
              toast({
                title: "ATS scoring started",
                description: "Check the ATS tab for results.",
              });
            } finally {
              setGenerating(null);
            }
          },
        },
      ],
    },
    {
      label: "NotebookLM",
      icon: BookOpen,
      actions: [
        {
          id: "sync_notebook",
          label: "Sync Notebook",
          description: "Synchronize sources with NotebookLM",
          handler: async (role) => {
            setGenerating("sync_notebook");
            try {
              await apiPost(`/api/roles/${role.id}/reprocess`, {});
              toast({
                title: "Sync started",
                description: "NotebookLM sources are being updated.",
              });
            } finally {
              setGenerating(null);
            }
          },
        },
      ],
    },
    {
      label: "Interview",
      icon: Mic,
      actions: [
        {
          id: "mock_interview",
          label: "Generate Mock Interview",
          description: "Create a practice interview based on this role's requirements",
          handler: async (role) => {
            setGenerating("mock_interview");
            try {
              await apiPost(`/api/roles/${role.id}/reprocess`, {
                taskId: "mock_interview",
              });
              toast({
                title: "Mock interview generation started",
                description: "Check the Interview tab for results.",
              });
            } finally {
              setGenerating(null);
            }
          },
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  role: RoleRow;
  onRoleUpdate: (role: RoleRow) => void;
}

export function RoleActionsDialog({ role, onRoleUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState(0);

  const categories = buildCategories(setGenerating);

  async function handleAction(action: ActionItem) {
    try {
      await action.handler(role, onRoleUpdate);
    } catch (err) {
      toast({
        title: "Action failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  const activeCategory = categories[selectedCategory]!;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Settings className="size-4" />
          <span className="hidden sm:inline">Actions</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-[700px] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-base">
            Actions — {role.companyName}
          </DialogTitle>
        </DialogHeader>
        <div className="flex min-h-[350px]">
          {/* Sidebar nav */}
          <nav className="flex w-44 shrink-0 flex-col gap-0.5 border-r border-border bg-muted/30 p-2">
            {categories.map((cat, i) => {
              const CatIcon = cat.icon;
              return (
                <button
                  key={cat.label}
                  className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    i === selectedCategory
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  }`}
                  onClick={() => setSelectedCategory(i)}
                >
                  <CatIcon className="size-4" />
                  {cat.label}
                </button>
              );
            })}
          </nav>

          {/* Action list */}
          <div className="flex flex-1 flex-col gap-1 p-3">
            {activeCategory.actions.map((action) => {
              const isRunning = generating === action.id;
              return (
                <button
                  key={action.id}
                  className="flex flex-col gap-0.5 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-accent/30 disabled:opacity-50"
                  onClick={() => void handleAction(action)}
                  disabled={generating !== null}
                >
                  <div className="flex items-center gap-2">
                    {isRunning ? (
                      <Loader2 className="size-4 animate-spin text-blue-400" />
                    ) : null}
                    <span className="text-sm font-medium">{action.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {action.description}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
