import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiPost, toast } from "@/lib/api-client";

import type { DocumentRow } from "../dashboard/types";

export function DocumentsList({ roleId }: { roleId: string }) {
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchDocs = () => {
    setLoading(true);
    apiGet<DocumentRow[]>(`/api/documents?roleId=${encodeURIComponent(roleId)}`)
      .then(setRows)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDocs();
    // Scan-on-open
    handleSync(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleId]);

  async function handleSync(silent = false) {
    if (!silent) setSyncing(true);
    try {
      const result = await apiPost<{ synced: number; total: number }>(
        `/api/documents/sync/${encodeURIComponent(roleId)}`,
        {},
      );
      if (result.synced > 0) {
        if (!silent) {
          toast({
            title: "Drive sync complete",
            description: `Found ${result.synced} new document${result.synced > 1 ? "s" : ""} (${result.total} total in folder).`,
          });
        }
        fetchDocs(); // Refresh the list
      } else {
        if (!silent) {
          toast({
            title: "Already in sync",
            description: `All ${result.total} documents in the Drive folder are already tracked.`,
          });
        }
      }
    } catch (err) {
      if (!silent) {
        toast({
          title: "Sync failed",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    } finally {
      if (!silent) setSyncing(false);
    }
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Documents</CardTitle>
            <CardDescription>
              Generated and manually linked Google Docs for this role.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => handleSync(false)}
            disabled={syncing}
          >
            {syncing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            {syncing ? "Syncing…" : "Sync from Drive"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-24 rounded-md bg-muted/50" />
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            No documents are linked yet. {syncing ? "Scanning folder..." : "Click \"Sync from Drive\" to import files from the Google Drive folder."}
          </p>
        ) : (
          <div className="grid gap-2">
            {rows.map((document) => (
              <div
                key={document.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{document.name}</div>
                  <div className="mt-1 flex gap-2">
                    <Badge variant="secondary">{document.type}</Badge>
                    <Badge variant="outline">v{document.version}</Badge>
                  </div>
                </div>
                <a
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-border bg-background px-2.5 text-sm font-medium transition hover:bg-muted"
                  href={`https://docs.google.com/document/d/${document.gdocId}/edit`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-4" />
                  Open
                </a>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
