import { ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/api-client";

import type { RoleRow } from "./types";

export function PreparingList() {
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<RoleRow[]>("/api/dashboard/preparing")
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card size="sm" className="rounded-lg">
      <CardHeader>
        <CardTitle>Preparing to Apply</CardTitle>
        <CardDescription>Roles that still need application assets.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid gap-2">
            <div className="h-10 rounded-md bg-muted/50" />
            <div className="h-10 rounded-md bg-muted/50" />
          </div>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            No roles are currently in preparation.
          </p>
        ) : (
          <div className="grid gap-2">
            {rows.map((role) => (
              <a
                key={role.id}
                href={`/roles/${role.id}`}
                className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3 text-sm transition hover:bg-muted/60"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{role.companyName}</span>
                  <span className="block truncate text-muted-foreground">{role.jobTitle}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary">{role.status}</Badge>
                  <ArrowUpRight className="size-4 text-muted-foreground" />
                </span>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
