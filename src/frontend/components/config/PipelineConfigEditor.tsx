/**
 * @fileoverview PipelineConfigEditor — Self-service management of Greenhouse
 * pipeline board tokens (companies).
 *
 * Renders a CRUD table with inline editing for:
 *  - Company name, website, email domain, board token, active status
 *  - Add / edit / delete operations via /api/pipeline/board-tokens
 */

import { Building2, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BoardToken {
  id: number;
  token: string;
  companyName: string | null;
  companyUrl: string | null;
  emailDomain: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PipelineConfigEditor() {
  const [tokens, setTokens] = useState<BoardToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // New token form state
  const [newToken, setNewToken] = useState("");
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newDomain, setNewDomain] = useState("");

  const fetchTokens = useCallback(async () => {
    try {
      const res = await apiGet<{ tokens: BoardToken[] }>("/api/pipeline/board-tokens");
      setTokens(res.tokens);
    } catch {
      /* noop */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  const handleToggle = useCallback(async (id: number, isActive: boolean) => {
    setSaving(id);
    try {
      await apiPut(`/api/pipeline/board-tokens/${id}`, { isActive });
      setTokens((prev) => prev.map((t) => (t.id === id ? { ...t, isActive } : t)));
    } catch {
      /* noop */
    }
    setSaving(null);
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    setSaving(id);
    try {
      await apiDelete(`/api/pipeline/board-tokens/${id}`);
      setTokens((prev) => prev.filter((t) => t.id !== id));
    } catch {
      /* noop */
    }
    setSaving(null);
  }, []);

  const handleAdd = useCallback(async () => {
    if (!newToken.trim()) return;
    setSaving(-1);
    try {
      const created = await apiPost<BoardToken>("/api/pipeline/board-tokens", {
        token: newToken.trim().toLowerCase(),
        companyName: newName.trim() || undefined,
        companyUrl: newUrl.trim() || undefined,
        emailDomain: newDomain.trim() || undefined,
        isActive: true,
      });
      setTokens((prev) => [...prev, created]);
      setNewToken("");
      setNewName("");
      setNewUrl("");
      setNewDomain("");
      setShowAdd(false);
    } catch {
      /* noop */
    }
    setSaving(null);
  }, [newToken, newName, newUrl, newDomain]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Building2 className="size-5" />
            Pipeline Companies
          </CardTitle>
          <CardDescription>
            Manage which Greenhouse job boards the scanner monitors. Each board token maps to a
            company's public Greenhouse job API.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setShowAdd(!showAdd)} className="gap-1.5">
          {showAdd ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
          {showAdd ? "Cancel" : "Add Company"}
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Add form */}
        {showAdd && (
          <div className="rounded-lg border border-dashed border-primary/30 bg-muted/20 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Board Token <span className="text-red-400">*</span>
                </Label>
                <Input
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value)}
                  placeholder="e.g. cloudflare"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Company Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Cloudflare"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Website</Label>
                <Input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://cloudflare.com"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email Domain</Label>
                <Input
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="cloudflare.com"
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={!newToken.trim() || saving === -1}
                className="gap-1.5"
              >
                {saving === -1 ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                Save
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        {tokens.length > 0 ? (
          <div className="rounded-md border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs">Company</TableHead>
                  <TableHead className="text-xs">Board Token</TableHead>
                  <TableHead className="text-xs">Email Domain</TableHead>
                  <TableHead className="text-xs text-center">Active</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((t) => (
                  <TableRow key={t.id} className="text-sm">
                    <TableCell className="font-medium">
                      {t.companyName ?? t.token}
                      {t.companyUrl && (
                        <a
                          href={t.companyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1.5 text-xs text-muted-foreground hover:text-primary"
                        >
                          ↗
                        </a>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {t.token}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t.emailDomain ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={t.isActive}
                        onCheckedChange={(checked) => handleToggle(t.id, checked)}
                        disabled={saving === t.id}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(t.id)}
                        disabled={saving === t.id}
                        className="text-muted-foreground hover:text-red-400"
                      >
                        {saving === t.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border/50 p-8 text-center">
            <Building2 className="mx-auto size-8 text-muted-foreground/40" />
            <p className="mt-2 text-sm text-muted-foreground">
              No companies configured. Click <strong>Add Company</strong> to start tracking a
              Greenhouse job board.
            </p>
          </div>
        )}

        {/* Info callout */}
        <div className="rounded-lg bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          <strong>How it works:</strong> The pipeline reads active board tokens every 6 hours (cron:{" "}
          <code className="rounded bg-muted px-1">0 */6 * * *</code>) and scrapes all open positions
          from each company's Greenhouse job board API. Toggle companies on/off to control which
          boards are scanned.
        </div>
      </CardContent>
    </Card>
  );
}
