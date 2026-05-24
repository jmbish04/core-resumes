/**
 * @fileoverview Live D1 schema viewer — fetches PRAGMA data from /api/docs/schema
 * and renders each table as an expandable card.
 */

import { ChevronDown, ChevronRight, Database, KeyRound, Link2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";

type Column = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
  description: string;
};

type ForeignKey = {
  id: number;
  seq: number;
  table: string;
  from: string;
  to: string;
  on_update: string;
  on_delete: string;
};

type TableInfo = {
  name: string;
  description: string;
  columns: Column[];
  foreignKeys: ForeignKey[];
};

export function SchemaViewer() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/docs/schema", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = (await res.json()) as { tables: TableInfo[] };
        setTables(data.tables);
        // Expand all by default
        setExpandedTables(new Set(data.tables.map((t: TableInfo) => t.name)));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function toggleTable(name: string) {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-6 text-sm text-muted-foreground">
        <Database className="size-4 animate-pulse" />
        Loading live schema from D1…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load schema: {error}
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {tables.map((table) => {
        const isExpanded = expandedTables.has(table.name);
        return (
          <div key={table.name} className="rounded-lg border border-border/60 bg-card">
            <button
              type="button"
              onClick={() => toggleTable(table.name)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/30"
            >
              {isExpanded ? (
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              )}
              <Database className="size-4 shrink-0 text-primary" />
              <span className="font-mono text-sm font-semibold">{table.name}</span>
              <Badge variant="secondary" className="ml-auto text-xs">
                {table.columns.length} cols
              </Badge>
            </button>

            {isExpanded && (
              <div className="border-t border-border/40 px-4 pb-4 pt-3">
                {table.description && (
                  <p className="mb-3 text-sm text-muted-foreground">{table.description}</p>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <th className="px-2 py-1.5">Column</th>
                        <th className="px-2 py-1.5">Type</th>
                        <th className="px-2 py-1.5">Description</th>
                        <th className="px-2 py-1.5">Constraints</th>
                        <th className="px-2 py-1.5">Default</th>
                      </tr>
                    </thead>
                    <tbody>
                      {table.columns.map((col) => {
                        const fk = table.foreignKeys.find((f) => f.from === col.name);
                        return (
                          <tr key={col.cid} className="border-b border-border/20 last:border-0">
                            <td className="px-2 py-1.5 font-mono text-xs">
                              <span className="flex items-center gap-1.5">
                                {col.pk === 1 && (
                                  <KeyRound
                                    className="size-3 text-amber-500"
                                    aria-label="Primary Key"
                                  />
                                )}
                                {fk && (
                                  <Link2
                                    className="size-3 text-blue-400"
                                    aria-label={`FK → ${fk.table}.${fk.to}`}
                                  />
                                )}
                                {col.name}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">
                              {col.type || "—"}
                            </td>
                            <td className="max-w-[220px] px-2 py-1.5 text-xs text-muted-foreground">
                              {col.description || "—"}
                            </td>
                            <td className="flex flex-wrap gap-1 px-2 py-1.5">
                              {col.pk === 1 && (
                                <Badge variant="outline" className="text-[10px]">
                                  PK
                                </Badge>
                              )}
                              {col.notnull === 1 && (
                                <Badge variant="outline" className="text-[10px]">
                                  NOT NULL
                                </Badge>
                              )}
                              {fk && (
                                <Badge variant="outline" className="text-[10px] text-blue-400">
                                  FK → {fk.table}.{fk.to} ({fk.on_delete})
                                </Badge>
                              )}
                            </td>
                            <td className="px-2 py-1.5 font-mono text-xs text-muted-foreground">
                              {col.dflt_value != null ? String(col.dflt_value) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
