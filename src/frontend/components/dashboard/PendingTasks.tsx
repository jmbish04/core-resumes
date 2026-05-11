import { Bot } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/api-client";

import type { PendingTask } from "./types";

export function PendingTasks() {
  const [rows, setRows] = useState<PendingTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<PendingTask[]>("/api/dashboard/pending-tasks")
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card size="sm" className="rounded-lg">
      <CardHeader>
        <CardTitle>Pending Agent Tasks</CardTitle>
        <CardDescription>Queued work visible from the Worker API.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-24 rounded-md bg-muted/50" />
        ) : rows.length === 0 ? (
          <div className="flex items-center gap-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            <Bot className="size-4" />
            No pending Colby tasks.
          </div>
        ) : (
          <div className="grid gap-2">
            {rows.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between rounded-md border border-border/60 p-3 text-sm"
              >
                <span>
                  <span className="block font-medium">{task.type.replaceAll("_", " ")}</span>
                  {task.roleId && <span className="text-muted-foreground">{task.roleId}</span>}
                </span>
                <Badge variant="outline">{task.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
