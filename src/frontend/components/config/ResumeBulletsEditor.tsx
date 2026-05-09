import { ChevronDown, ChevronRight, History, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQueryParam } from "@/hooks/use-query-param";
import { apiGet, apiPatch, apiPost, apiPut, toast } from "@/lib/api-client";

import { BulletFormModal, type BulletFormData } from "./BulletFormModal";

// ── Types ────────────────────────────────────────────────────────────────

export type BulletRow = {
  id: number;
  content: string;
  category: string;
  impactMetric: string | null;
  tags: string | null;
  notes: string | null;
  isActive: boolean;
  usageCount: number;
  replacedBy: number | null;
  timeRevised: string | null;
  timeDeleted: string | null;
  createdAt: string;
  updatedAt: string;
};

type RevisionEntry = {
  bulletId: number;
  activeContent: BulletRow;
  history: BulletRow[];
};

type BulletListResponse = {
  active: BulletRow[];
  inactive: BulletRow[];
  revisions: RevisionEntry[];
};

const CATEGORIES = ["All", "Strategic", "Technical", "Impact", "Collaboration"] as const;

const categoryColors: Record<string, string> = {
  Strategic: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  Technical: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  Impact: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Collaboration: "bg-violet-500/15 text-violet-400 border-violet-500/30",
};

// ── Component ────────────────────────────────────────────────────────────

/**
 * Resume Bullets management dashboard.
 *
 * Displays active, inactive, and revision-tracked bullets fetched from
 * `GET /api/bullets`. Supports:
 *  - Category filter
 *  - Active/Inactive toggle (soft-delete)
 *  - Add new bullet (modal)
 *  - Edit existing bullet (creates revision, modal)
 *  - Expandable revision history per bullet
 */
export function ResumeBulletsEditor() {
  const [data, setData] = useState<BulletListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useQueryParam("filter", "All");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBullet, setEditingBullet] = useState<BulletRow | null>(null);

  // Revision expansion state
  const [expandedRevisions, setExpandedRevisions] = useState<Set<number>>(new Set());

  async function fetchBullets() {
    setLoading(true);

    try {
      const result = await apiGet<BulletListResponse>("/api/bullets");
      setData(result);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchBullets();
  }, []);

  async function handleToggle(id: number, isActive: boolean) {
    await apiPatch(`/api/bullets/${id}/toggle`, { isActive });
    toast({
      title: isActive ? "Bullet activated" : "Bullet deactivated",
    });
    await fetchBullets();
  }

  async function handleCreate(formData: BulletFormData) {
    await apiPost("/api/bullets", formData);
    toast({ title: "Bullet created" });
    await fetchBullets();
  }

  async function handleEdit(formData: BulletFormData) {
    if (!editingBullet) return;
    await apiPut(`/api/bullets/${editingBullet.id}`, formData);
    toast({ title: "New version saved" });
    setEditingBullet(null);
    await fetchBullets();
  }

  function openCreate() {
    setEditingBullet(null);
    setModalOpen(true);
  }

  function openEdit(bullet: BulletRow) {
    setEditingBullet(bullet);
    setModalOpen(true);
  }

  function toggleRevision(bulletId: number) {
    setExpandedRevisions((prev) => {
      const next = new Set(prev);
      if (next.has(bulletId)) {
        next.delete(bulletId);
      } else {
        next.add(bulletId);
      }
      return next;
    });
  }

  // Get revision history for a specific bullet
  function getRevisions(bulletId: number): BulletRow[] {
    return data?.revisions.find((r) => r.bulletId === bulletId)?.history ?? [];
  }

  // Filter helper
  function filterBullets(bullets: BulletRow[]): BulletRow[] {
    if (filter === "All") return bullets;
    return bullets.filter((b) => b.category === filter);
  }

  const activeBullets = filterBullets(data?.active ?? []);
  const inactiveBullets = filterBullets(data?.inactive ?? []);

  return (
    <>
      <Card className="rounded-lg">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Resume Bullets</CardTitle>
              <CardDescription>
                Verified accomplishments Colby uses as "Historical Performance Truths" when
                drafting.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={filter} onValueChange={(val) => setFilter(val || "All")}>
                <SelectTrigger className="w-36">
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
              <Button type="button" onClick={openCreate}>
                <Plus className="size-4" />
                Add Bullet
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading bullets…</p>
          ) : activeBullets.length === 0 && inactiveBullets.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No resume bullets found. Add your first accomplishment to get started.
              </p>
            </div>
          ) : (
            <div className="grid gap-6">
              {/* Active Bullets */}
              {activeBullets.length > 0 && (
                <BulletTable
                  title="Active"
                  subtitle={`${activeBullets.length} bullet${activeBullets.length !== 1 ? "s" : ""} — visible to the agent`}
                  bullets={activeBullets}
                  onToggle={handleToggle}
                  onEdit={openEdit}
                  expandedRevisions={expandedRevisions}
                  onToggleRevision={toggleRevision}
                  getRevisions={getRevisions}
                />
              )}

              {/* Inactive Bullets */}
              {inactiveBullets.length > 0 && (
                <BulletTable
                  title="Inactive"
                  subtitle={`${inactiveBullets.length} muted bullet${inactiveBullets.length !== 1 ? "s" : ""} — hidden from the agent`}
                  bullets={inactiveBullets}
                  onToggle={handleToggle}
                  onEdit={openEdit}
                  expandedRevisions={expandedRevisions}
                  onToggleRevision={toggleRevision}
                  getRevisions={getRevisions}
                  dimmed
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create / Edit Modal */}
      <BulletFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        initial={editingBullet}
        onSubmit={editingBullet ? handleEdit : handleCreate}
      />
    </>
  );
}

// ── Sub-component: BulletTable ────────────────────────────────────────────

type BulletTableProps = {
  title: string;
  subtitle: string;
  bullets: BulletRow[];
  onToggle: (id: number, isActive: boolean) => void;
  onEdit: (bullet: BulletRow) => void;
  expandedRevisions: Set<number>;
  onToggleRevision: (bulletId: number) => void;
  getRevisions: (bulletId: number) => BulletRow[];
  dimmed?: boolean;
};

function BulletTable({
  title,
  subtitle,
  bullets,
  onToggle,
  onEdit,
  expandedRevisions,
  onToggleRevision,
  getRevisions,
  dimmed,
}: BulletTableProps) {
  return (
    <div>
      <div className="mb-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[45%]">Content</TableHead>
              <TableHead className="w-[100px]">Category</TableHead>
              <TableHead className="w-[120px]">Impact</TableHead>
              <TableHead className="w-[60px] text-center">Active</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {bullets.map((bullet) => {
              const revisions = getRevisions(bullet.id);
              const hasRevisions = revisions.length > 0;
              const isExpanded = expandedRevisions.has(bullet.id);

              return (
                <>
                  <TableRow key={bullet.id} className={dimmed ? "opacity-60" : undefined}>
                    <TableCell>
                      <div className="flex items-start gap-1.5">
                        {hasRevisions && (
                          <button
                            type="button"
                            onClick={() => onToggleRevision(bullet.id)}
                            className="mt-0.5 shrink-0 text-muted-foreground transition hover:text-foreground"
                            title="Show revision history"
                          >
                            {isExpanded ? (
                              <ChevronDown className="size-3.5" />
                            ) : (
                              <ChevronRight className="size-3.5" />
                            )}
                          </button>
                        )}
                        <span className="line-clamp-2 text-sm">{bullet.content}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={categoryColors[bullet.category] ?? ""}>
                        {bullet.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {bullet.impactMetric || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={bullet.isActive}
                        onCheckedChange={(checked) => void onToggle(bullet.id, checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onEdit(bullet)}
                        title="Edit bullet"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>

                  {/* Revision history rows */}
                  {hasRevisions &&
                    isExpanded &&
                    revisions.map((rev) => (
                      <TableRow key={`rev-${rev.id}`} className="bg-muted/30 opacity-50">
                        <TableCell>
                          <div className="flex items-start gap-1.5 pl-5">
                            <History className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                            <span className="line-clamp-2 text-xs italic">{rev.content}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", categoryColors[rev.category] ?? "")}
                          >
                            {rev.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-[10px] text-muted-foreground">
                            {rev.impactMetric || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-[10px] text-muted-foreground">
                          Revised
                        </TableCell>
                        <TableCell>
                          <span className="text-[10px] text-muted-foreground">
                            {rev.timeRevised ? new Date(rev.timeRevised).toLocaleDateString() : "—"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Utility ──────────────────────────────────────────────────────────────

function cn(...classes: (string | undefined | false)[]) {
  return classes.filter(Boolean).join(" ");
}
