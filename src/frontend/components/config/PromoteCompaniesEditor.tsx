import { ArrowRight, Loader2, Search } from "lucide-react";
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
import { apiGet, apiPost, toast } from "@/lib/api-client";

interface ApiCompany {
  id: number;
  name: string | null;
  jobBoardToken: string;
  system: string;
  isActive: boolean;
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
              {availableToPromote.length} companies discovered upstream. Promote them to official
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
              Promote {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
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
                  <TableHead>Known Name</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((comp) => (
                  <TableRow key={comp.id} className={selectedIds.has(comp.id) ? "bg-muted/50" : ""}>
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
                      {comp.name || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
