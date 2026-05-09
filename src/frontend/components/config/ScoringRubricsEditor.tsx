import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiDelete, apiGet, apiPost, apiPut, toast } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScoringRubric = {
  id: number;
  type: string;
  criteria: string;
  scoreRangeMin: number;
  scoreRangeMax: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

const RUBRIC_TYPE_LABELS: Record<string, { label: string; description: string }> = {
  location: {
    label: "Location",
    description: "Criteria for scoring roles based on commute, WFH policy, and geographic fit.",
  },
  compensation: {
    label: "Compensation",
    description:
      "Criteria for scoring roles against historical Google TC and negotiation potential.",
  },
  combined: {
    label: "Combined Value",
    description:
      "Criteria for the holistic score synthesizing location and compensation dimensions.",
  },
};

const RUBRIC_TYPE_ORDER = ["location", "compensation", "combined"];

// ---------------------------------------------------------------------------
// Add / Edit Modal
// ---------------------------------------------------------------------------

function RubricModal({
  open,
  onClose,
  onSaved,
  rubricType,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  rubricType: string;
  existing?: ScoringRubric;
}) {
  const isEdit = !!existing;
  const [criteria, setCriteria] = useState(existing?.criteria ?? "");
  const [min, setMin] = useState(existing?.scoreRangeMin ?? 0);
  const [max, setMax] = useState(existing?.scoreRangeMax ?? 100);
  const [sortOrder, setSortOrder] = useState(existing?.sortOrder ?? 0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCriteria(existing?.criteria ?? "");
      setMin(existing?.scoreRangeMin ?? 0);
      setMax(existing?.scoreRangeMax ?? 100);
      setSortOrder(existing?.sortOrder ?? 0);
    }
  }, [open, existing]);

  async function save() {
    if (!criteria.trim()) return;
    setSaving(true);
    try {
      if (isEdit) {
        await apiPut(`/api/scoring-rubrics/${existing.id}`, {
          criteria,
          scoreRangeMin: min,
          scoreRangeMax: max,
          sortOrder,
        });
        toast({ title: "Rubric updated" });
      } else {
        await apiPost("/api/scoring-rubrics", {
          type: rubricType,
          criteria,
          scoreRangeMin: min,
          scoreRangeMax: max,
          sortOrder,
        });
        toast({ title: "Rubric created" });
      }
      onSaved();
      onClose();
    } catch {
      toast({
        title: "Failed to save rubric",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md" onClose={onClose}>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit" : "Add"} Rubric Criteria</DialogTitle>
          <DialogDescription>
            {RUBRIC_TYPE_LABELS[rubricType]?.label ?? rubricType} scoring criteria
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor="rubric-criteria">
              Criteria Description
            </label>
            <Input
              id="rubric-criteria"
              value={criteria}
              onChange={(e) => setCriteria(e.target.value)}
              placeholder="e.g. Full remote / WFH"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="rubric-min">
                Score Min
              </label>
              <Input
                id="rubric-min"
                type="number"
                min={0}
                max={100}
                value={min}
                onChange={(e) => setMin(Number(e.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="rubric-max">
                Score Max
              </label>
              <Input
                id="rubric-max"
                type="number"
                min={0}
                max={100}
                value={max}
                onChange={(e) => setMax(Number(e.target.value))}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="rubric-order">
                Sort Order
              </label>
              <Input
                id="rubric-order"
                type="number"
                min={0}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Score range visual */}
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
            <span className="text-xs text-muted-foreground">Range preview:</span>
            <div className="relative h-3 flex-1 rounded-full bg-muted">
              <div
                className="absolute h-full rounded-full bg-primary/60"
                style={{
                  left: `${min}%`,
                  width: `${Math.max(0, max - min)}%`,
                }}
              />
            </div>
            <span className="text-xs font-mono tabular-nums text-muted-foreground">
              {min}–{max}
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!criteria.trim() || saving} onClick={() => void save()}>
            {saving ? "Saving…" : isEdit ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Section per rubric type
// ---------------------------------------------------------------------------

function RubricTypeSection({
  type,
  rubrics,
  onReload,
}: {
  type: string;
  rubrics: ScoringRubric[];
  onReload: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScoringRubric | undefined>();
  const meta = RUBRIC_TYPE_LABELS[type] ?? { label: type, description: "" };

  const sorted = [...rubrics].sort((a, b) => a.sortOrder - b.sortOrder);

  async function handleDelete(id: number) {
    try {
      await apiDelete(`/api/scoring-rubrics/${id}`);
      toast({ title: "Rubric removed" });
      onReload();
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  }

  return (
    <Card className="rounded-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{meta.label}</CardTitle>
            <CardDescription className="mt-0.5 text-xs">{meta.description}</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(undefined);
              setModalOpen(true);
            }}
          >
            + Add
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center">
            <p className="text-sm text-muted-foreground">
              No criteria defined. Click "+ Add" to create one.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead>Criteria</TableHead>
                <TableHead className="w-[120px] text-center">Score Range</TableHead>
                <TableHead className="w-[120px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {r.sortOrder}
                  </TableCell>
                  <TableCell className="text-sm">{r.criteria}</TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-mono tabular-nums">
                      {r.scoreRangeMin}–{r.scoreRangeMax}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setEditing(r);
                          setModalOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        onClick={() => void handleDelete(r.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <RubricModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditing(undefined);
          }}
          onSaved={onReload}
          rubricType={type}
          existing={editing}
        />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Editor
// ---------------------------------------------------------------------------

export function ScoringRubricsEditor() {
  const [rubrics, setRubrics] = useState<ScoringRubric[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<ScoringRubric[]>("/api/scoring-rubrics");
      setRubrics(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function seed() {
    setSeeding(true);
    try {
      const result = await apiPost<{ seeded: boolean; count: number }>(
        "/api/scoring-rubrics/seed",
        {},
      );
      if (result.seeded) {
        toast({ title: "Seeded", description: `${result.count} rubrics created.` });
      } else {
        toast({
          title: "Already seeded",
          description: `${result.count} rubrics exist. No changes made.`,
        });
      }
      await load();
    } catch {
      toast({ title: "Seed failed", variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  }

  const grouped: Record<string, ScoringRubric[]> = {};
  for (const type of RUBRIC_TYPE_ORDER) {
    grouped[type] = rubrics.filter((r) => r.type === type);
  }

  const hasAny = rubrics.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Scoring Rubrics</h3>
          <p className="text-sm text-muted-foreground">
            Define the scoring criteria AI uses to rate roles. Each type has its own table.
          </p>
        </div>
        {!hasAny && !loading && (
          <Button variant="outline" size="sm" disabled={seeding} onClick={() => void seed()}>
            {seeding ? "Seeding…" : "Seed Defaults"}
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading rubrics…</p>
      ) : (
        <div className="space-y-4">
          {RUBRIC_TYPE_ORDER.map((type) => (
            <RubricTypeSection
              key={type}
              type={type}
              rubrics={grouped[type] ?? []}
              onReload={() => void load()}
            />
          ))}
        </div>
      )}
    </div>
  );
}
