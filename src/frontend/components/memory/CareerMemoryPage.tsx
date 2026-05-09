/**
 * @fileoverview Career Memory management page — browse, search, edit,
 * and delete career memories organized by category.
 */

import {
  Brain,
  ChevronDown,
  ChevronRight,
  Edit3,
  ExternalLink,
  Search,
  Trash2,
  Undo2,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useQueryParam } from "@/hooks/use-query-param";
import { apiDelete, apiGet, apiPatch, toast } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemoryItem {
  id: string;
  query: string;
  answer: string;
  source: string;
  agent: string;
  category: string;
  roleId: string | null;
  references: unknown[] | null;
  metadata: Record<string, unknown> | null;
  isActive: boolean;
  replacedById: string | null;
  createdAt: string;
  deletedAt: string | null;
}

interface CategoryStat {
  category: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  career_fact: "Career Facts",
  role_analysis: "Role Analysis",
  resume_draft: "Resume Drafts",
  cover_letter: "Cover Letters",
  interview_prep: "Interview Prep",
  comment_feedback: "Comment Feedback",
  general: "General",
};

const CATEGORY_COLORS: Record<string, string> = {
  career_fact: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  role_analysis: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  resume_draft: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  cover_letter: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  interview_prep: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  comment_feedback: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  general: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

const SOURCE_LABELS: Record<string, string> = {
  notebooklm: "NotebookLM",
  user_input: "User Input",
  draft_review: "Draft Review",
  comment_response: "Comment Response",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CareerMemoryPage() {
  const [stats, setStats] = useState<CategoryStat[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Filters
  const [selectedCategoryStr, setSelectedCategoryStr] = useQueryParam("category", "");
  const selectedCategory = selectedCategoryStr === "" ? null : selectedCategoryStr;
  const setSelectedCategory = (val: string | null) => setSelectedCategoryStr(val || "");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [page, setPage] = useState(0);
  const limit = 25;

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ query: "", answer: "", category: "" });

  // Expanded items
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // ── Data fetching ───────────────────────────────────────────────────

  const loadStats = useCallback(async () => {
    try {
      const data = await apiGet<CategoryStat[]>(
        `/api/memory/stats?includeDeleted=${includeDeleted}`,
      );
      setStats(data);
    } catch {
      /* toast handled by apiGet */
    }
  }, [includeDeleted]);

  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(page * limit),
      });
      if (selectedCategory) params.set("category", selectedCategory);
      if (includeDeleted) params.set("includeDeleted", "true");

      const data = await apiGet<{ items: MemoryItem[]; total: number }>(`/api/memory?${params}`);
      setMemories(data.items);
      setTotal(data.total);
    } catch {
      /* handled */
    }
    setLoading(false);
  }, [selectedCategory, includeDeleted, page]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadMemories();
      return;
    }
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ q: searchQuery, limit: "20" });
      if (selectedCategory) params.set("category", selectedCategory);
      const data = await apiGet<MemoryItem[]>(`/api/memory/search?${params}`);
      setMemories(data);
      setTotal(data.length);
    } catch {
      /* handled */
    }
    setIsSearching(false);
  };

  useEffect(() => {
    loadStats();
  }, [loadStats]);
  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  // ── Actions ─────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    try {
      await apiDelete(`/api/memory/${id}`);
      toast({ title: "Memory deleted", description: "The memory has been soft-deleted." });
      loadMemories();
      loadStats();
    } catch {
      /* handled */
    }
  };

  const startEdit = (memory: MemoryItem) => {
    setEditingId(memory.id);
    setEditForm({
      query: memory.query,
      answer: memory.answer,
      category: memory.category,
    });
  };

  const handleSave = async () => {
    if (!editingId) return;
    try {
      await apiPatch(`/api/memory/${editingId}`, {
        query: editForm.query,
        answer: editForm.answer,
        category: editForm.category,
      });
      toast({ title: "Memory updated", description: "A new revision has been created." });
      setEditingId(null);
      loadMemories();
      loadStats();
    } catch {
      /* handled */
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const totalMemories = stats.reduce((sum, s) => sum + s.count, 0);

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      {/* Sidebar — Category filters */}
      <aside className="space-y-4">
        <Card className="rounded-lg">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="size-4" />
              Categories
            </CardTitle>
            <CardDescription>{totalMemories} memories total</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <button
              type="button"
              onClick={() => {
                setSelectedCategory(null);
                setPage(0);
              }}
              className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition ${
                !selectedCategory
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              All ({totalMemories})
            </button>
            {stats.map((stat) => (
              <button
                key={stat.category}
                type="button"
                onClick={() => {
                  setSelectedCategory(stat.category);
                  setPage(0);
                }}
                className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition ${
                  selectedCategory === stat.category
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {CATEGORY_LABELS[stat.category] ?? stat.category} ({stat.count})
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardContent className="pt-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeDeleted}
                onChange={(e) => {
                  setIncludeDeleted(e.target.checked);
                  setPage(0);
                }}
                className="rounded border-border"
              />
              <span className="text-muted-foreground">Show deleted</span>
            </label>
          </CardContent>
        </Card>
      </aside>

      {/* Main content */}
      <div className="space-y-4">
        {/* Search bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Semantic search across memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-10"
            />
          </div>
          <Button onClick={handleSearch} disabled={isSearching} variant="secondary">
            {isSearching ? "Searching..." : "Search"}
          </Button>
          {searchQuery && (
            <Button
              variant="ghost"
              onClick={() => {
                setSearchQuery("");
                loadMemories();
              }}
            >
              Clear
            </Button>
          )}
        </div>

        {/* Results header */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {selectedCategory ? `${CATEGORY_LABELS[selectedCategory] ?? selectedCategory} — ` : ""}
            {total} {total === 1 ? "memory" : "memories"}
          </span>
          {total > limit && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ← Prev
              </Button>
              <span>
                Page {page + 1} of {Math.ceil(total / limit)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                disabled={(page + 1) * limit >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </Button>
            </div>
          )}
        </div>

        {/* Memory list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-muted/50" />
            ))}
          </div>
        ) : memories.length === 0 ? (
          <Card className="rounded-lg">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Brain className="size-10 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                {searchQuery
                  ? "No memories match your search."
                  : "No career memories yet. They'll appear here as you interact with the agent."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {memories.map((memory) => (
              <MemoryCard
                key={memory.id}
                memory={memory}
                isExpanded={expandedIds.has(memory.id)}
                isEditing={editingId === memory.id}
                editForm={editForm}
                onToggle={() => toggleExpand(memory.id)}
                onEdit={() => startEdit(memory)}
                onCancelEdit={() => setEditingId(null)}
                onSave={handleSave}
                onDelete={() => handleDelete(memory.id)}
                onEditFormChange={setEditForm}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memory Card
// ---------------------------------------------------------------------------

function MemoryCard({
  memory,
  isExpanded,
  isEditing,
  editForm,
  onToggle,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onEditFormChange,
}: {
  memory: MemoryItem;
  isExpanded: boolean;
  isEditing: boolean;
  editForm: { query: string; answer: string; category: string };
  onToggle: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onDelete: () => void;
  onEditFormChange: (form: { query: string; answer: string; category: string }) => void;
}) {
  const categoryColor = CATEGORY_COLORS[memory.category] ?? CATEGORY_COLORS.general;

  return (
    <Card className={`rounded-lg transition ${!memory.isActive ? "opacity-50" : ""}`}>
      <CardHeader className="cursor-pointer pb-2" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            {isExpanded ? (
              <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm font-medium">{memory.query}</p>
              {!isExpanded && (
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  {memory.answer.slice(0, 150)}...
                </p>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant="outline" className={`text-[10px] ${categoryColor}`}>
              {CATEGORY_LABELS[memory.category] ?? memory.category}
            </Badge>
            <Badge variant="secondary" className="text-[10px]">
              {SOURCE_LABELS[memory.source] ?? memory.source}
            </Badge>
            {memory.replacedById && (
              <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-400">
                Revised
              </Badge>
            )}
            {!memory.isActive && (
              <Badge variant="destructive" className="text-[10px]">
                Deleted
              </Badge>
            )}
          </div>
        </div>

        <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>
            {new Date(memory.createdAt).toLocaleDateString()}{" "}
            {new Date(memory.createdAt).toLocaleTimeString()}
          </span>
          <span>Agent: {memory.agent}</span>
          {memory.roleId && (
            <a
              href={`/roles/${memory.roleId}`}
              className="flex items-center gap-1 text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="size-3" />
              View Role
            </a>
          )}
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          {isEditing ? (
            <EditForm
              form={editForm}
              onChange={onEditFormChange}
              onSave={onSave}
              onCancel={onCancelEdit}
            />
          ) : (
            <>
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Query
                  </p>
                  <p className="whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm">
                    {memory.query}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Answer
                  </p>
                  <p className="whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm">
                    {memory.answer}
                  </p>
                </div>

                {memory.references && (memory.references as unknown[]).length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      References
                    </p>
                    <pre className="max-h-32 overflow-auto rounded-md bg-muted/30 p-3 text-xs">
                      {JSON.stringify(memory.references, null, 2)}
                    </pre>
                  </div>
                )}

                {memory.metadata && Object.keys(memory.metadata).length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Metadata
                    </p>
                    <pre className="max-h-32 overflow-auto rounded-md bg-muted/30 p-3 text-xs">
                      {JSON.stringify(memory.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {memory.isActive && (
                <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-3">
                  <Button size="sm" variant="ghost" onClick={onEdit}>
                    <Edit3 className="mr-1.5 size-3.5" />
                    Edit
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                        />
                      }
                    >
                      <Trash2 className="mr-1.5 size-3.5" />
                      Delete
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Memory</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will soft-delete this memory. It can still be viewed with "Show
                          deleted" enabled. The Vectorize embedding will be removed.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Edit Form
// ---------------------------------------------------------------------------

function EditForm({
  form,
  onChange,
  onSave,
  onCancel,
}: {
  form: { query: string; answer: string; category: string };
  onChange: (form: { query: string; answer: string; category: string }) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Query
        </label>
        <Textarea
          value={form.query}
          onChange={(e) => onChange({ ...form, query: e.target.value })}
          rows={3}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Answer
        </label>
        <Textarea
          value={form.answer}
          onChange={(e) => onChange({ ...form, answer: e.target.value })}
          rows={6}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Category
        </label>
        <select
          value={form.category}
          onChange={(e) => onChange({ ...form, category: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave}>
          Save (creates revision)
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <Undo2 className="mr-1.5 size-3.5" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
