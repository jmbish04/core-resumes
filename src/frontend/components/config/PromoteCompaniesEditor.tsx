import { ArrowRight, Loader2, Search, X, Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { apiGet, apiPost, toast } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface ApiCompany {
  id: number;
  name: string | null;
  jobBoardToken: string;
  system: string;
  isActive: boolean;
  isRecommended: boolean;
  recommendationReason: string | null;
}

interface BoardToken {
  id: number;
  token: string;
}

export function PromoteCompaniesEditor() {
  const [apiCompanies, setApiCompanies] = useState<ApiCompany[]>([]);
  const [boardTokens, setBoardTokens] = useState<BoardToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [apiCompRes, tokensRes] = await Promise.all([
        apiGet<{ companies: ApiCompany[] }>("/api/pipeline/api-companies"),
        apiGet<{ tokens: BoardToken[] }>("/api/pipeline/board-tokens"),
      ]);
      setApiCompanies(apiCompRes.companies);
      setBoardTokens(tokensRes.tokens);
    } catch {
      toast({ title: "Failed to load aggregator data", variant: "destructive" });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const availableToPromote = useMemo(() => {
    const trackedTokens = new Set(boardTokens.map((t) => t.token));
    return apiCompanies.filter((c) => !trackedTokens.has(c.jobBoardToken));
  }, [apiCompanies, boardTokens]);

  const recommendedCompanies = useMemo(() => {
    return availableToPromote.filter((c) => c.isRecommended);
  }, [availableToPromote]);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return availableToPromote;
    const q = searchQuery.toLowerCase();
    return availableToPromote.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        c.jobBoardToken.toLowerCase().includes(q) ||
        c.system.toLowerCase().includes(q),
    );
  }, [availableToPromote, searchQuery]);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((c) => c.id)));
    }
  }, [filtered, selectedIds]);

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handlePromote = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setPromoting(true);

    const companiesToPromote = apiCompanies.filter((c) => selectedIds.has(c.id));

    try {
      let successCount = 0;
      for (const comp of companiesToPromote) {
        await apiPost("/api/pipeline/board-tokens", {
          token: comp.jobBoardToken,
          companyName: comp.name || comp.jobBoardToken,
          isActive: true,
        });
        successCount++;
      }

      toast({ title: `Promoted ${successCount} companies to Tracker` });
      setSelectedIds(new Set());
      await fetchData(); // Refresh lists
    } catch {
      toast({ title: "Failed to promote some companies", variant: "destructive" });
    } finally {
      setPromoting(false);
    }
  }, [apiCompanies, selectedIds, fetchData]);

  const handleAcceptAllRecommendations = useCallback(async () => {
    if (recommendedCompanies.length === 0) return;
    setPromoting(true);
    try {
      let successCount = 0;
      for (const comp of recommendedCompanies) {
        await apiPost("/api/pipeline/board-tokens", {
          token: comp.jobBoardToken,
          companyName: comp.name || comp.jobBoardToken,
          isActive: true,
        });
        successCount++;
      }
      toast({ title: `Promoted all ${successCount} recommended companies to Tracker` });
      await fetchData();
    } catch {
      toast({ title: "Failed to promote some recommended companies", variant: "destructive" });
    } finally {
      setPromoting(false);
    }
  }, [recommendedCompanies, fetchData]);

  const handleRejectAll = useCallback(async () => {
    try {
      const res = await apiPost<{ success: boolean }>("/api/pipeline/api-companies/reject-all", {});
      if (res.success) {
        toast({ title: "Dismissed all recommended companies" });
        await fetchData();
      }
    } catch {
      toast({ title: "Failed to dismiss recommendations", variant: "destructive" });
    }
  }, [fetchData]);

  const handleRejectIndividual = useCallback(async (id: number) => {
    try {
      const res = await apiPost<{ success: boolean }>(`/api/pipeline/api-companies/${id}/reject`, {});
      if (res.success) {
        toast({ title: "Dismissed recommendation" });
        await fetchData();
      }
    } catch {
      toast({ title: "Failed to dismiss recommendation", variant: "destructive" });
    }
  }, [fetchData]);

  const handlePromoteIndividual = useCallback(async (comp: ApiCompany) => {
    try {
      await apiPost("/api/pipeline/board-tokens", {
        token: comp.jobBoardToken,
        companyName: comp.name || comp.jobBoardToken,
        isActive: true,
      });
      toast({ title: `Promoted ${comp.name || comp.jobBoardToken} to Tracker` });
      await fetchData();
    } catch {
      toast({ title: "Failed to promote company", variant: "destructive" });
    }
  }, [fetchData]);

  if (loading) {
    return (
      <Card className="rounded-lg">
        <CardContent className="flex items-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" /> Loading upstream discovery data…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">Aggregator Discovery (Pipeline A)</CardTitle>
            <CardDescription>
              {availableToPromote.length.toLocaleString()} companies discovered upstream. Promote them to official
              Tracker (Pipeline B).
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-[240px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search upstream..."
                className="pl-9 h-8 text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              disabled={selectedIds.size === 0 || promoting}
              onClick={handlePromote}
            >
              {promoting ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 size-4" />
              )}
              Promote {selectedIds.size > 0 ? `(${selectedIds.size.toLocaleString()})` : ""}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Recommendation Highlights Ribbon */}
        {recommendedCompanies.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                  <h4 className="text-sm font-semibold text-amber-400">
                    Job Match Recommendations ({recommendedCompanies.length.toLocaleString()})
                  </h4>
                </div>
                <p className="text-xs text-muted-foreground max-w-xl">
                  These companies have active job postings in remote and/or San Francisco locations that match your specified job search keywords (e.g. software engineer, fullstack, frontend).
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <AlertDialog>
                  <AlertDialogTrigger className="inline-flex items-center justify-center rounded-md border border-destructive/30 hover:bg-destructive/10 text-destructive-foreground h-8 px-3 text-xs font-medium bg-transparent cursor-pointer transition-colors">
                    Deny All ({recommendedCompanies.length})
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will dismiss the recommendations for all {recommendedCompanies.length} currently matching companies. They will remain in the aggregator discovery list but will no longer be highlighted.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleRejectAll} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                        Yes, Dismiss All
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                
                <Button size="sm" onClick={handleAcceptAllRecommendations} disabled={promoting} className="bg-amber-500 text-zinc-950 hover:bg-amber-400 h-8 text-xs font-semibold">
                  {promoting ? <Loader2 className="size-3 animate-spin mr-1.5" /> : <Check className="size-3.5 mr-1.5" />}
                  Promote All ({recommendedCompanies.length})
                </Button>
              </div>
            </div>
            
            {/* Quick recommendation cards list */}
            <div className="mt-3 grid gap-2 sm:grid-cols-2 max-h-36 overflow-y-auto pr-1">
              {recommendedCompanies.map((comp) => (
                <div key={comp.id} className="flex items-center justify-between rounded-lg border border-border/40 bg-zinc-950/40 p-2.5 transition hover:border-amber-500/20">
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-zinc-200 truncate">{comp.jobBoardToken}</span>
                      <Badge variant="outline" className="text-[10px] py-0 px-1 font-mono uppercase bg-zinc-900 border-zinc-800 shrink-0">
                        {comp.system}
                      </Badge>
                    </div>
                    {comp.recommendationReason && (
                      <p className="text-[10px] text-amber-500/70 truncate mt-0.5" title={comp.recommendationReason}>
                        {comp.recommendationReason}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon-sm" onClick={() => handleRejectIndividual(comp.id)} className="text-muted-foreground hover:text-destructive hover:bg-destructive/10" aria-label="Dismiss recommendation">
                      <X className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => handlePromoteIndividual(comp)} className="text-muted-foreground hover:text-amber-400 hover:bg-amber-500/10" aria-label="Accept & promote">
                      <Check className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {availableToPromote.length === 0
              ? "All upstream companies are already tracked!"
              : "No companies match your search."}
          </p>
        ) : (
          <div className="overflow-auto rounded-md border border-border/60 max-h-[400px]">
            <Table>
              <TableHeader className="sticky top-0 bg-background/95 backdrop-blur z-10">
                <TableRow>
                  <TableHead className="w-[50px] text-center">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-gray-300 text-primary focus:ring-primary"
                      checked={selectedIds.size === filtered.length && filtered.length > 0}
                      onChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Board Token</TableHead>
                  <TableHead>System</TableHead>
                  <TableHead>Known Name / Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((comp) => {
                  const isRec = comp.isRecommended;
                  return (
                    <TableRow 
                      key={comp.id} 
                      className={cn(
                        selectedIds.has(comp.id) ? "bg-muted/50" : "",
                        isRec ? "bg-amber-500/5 hover:bg-amber-500/10 border-l-2 border-l-amber-500/40" : ""
                      )}
                    >
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-gray-300 text-primary focus:ring-primary"
                          checked={selectedIds.has(comp.id)}
                          onChange={() => toggleSelect(comp.id)}
                          aria-label={`Select ${comp.jobBoardToken}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{comp.jobBoardToken}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {comp.system}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {isRec && comp.recommendationReason ? (
                          <div className="flex flex-col">
                            <span className="text-foreground">{comp.name || "—"}</span>
                            <span className="text-[10px] text-amber-500 font-medium">{comp.recommendationReason}</span>
                          </div>
                        ) : (
                          comp.name || "—"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
