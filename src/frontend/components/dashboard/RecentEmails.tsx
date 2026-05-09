import { Mail } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/api-client";

import type { EmailRow } from "./types";

export function RecentEmails() {
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<EmailRow[]>("/api/dashboard/recent-emails")
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  return (
    <Card size="sm" className="rounded-lg">
      <CardHeader>
        <CardTitle>Recent Emails</CardTitle>
        <CardDescription>Inbound recruiting messages captured by Email Routing.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-24 rounded-md bg-muted/50" />
        ) : rows.length === 0 ? (
          <div className="flex items-center gap-3 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            <Mail className="size-4" />
            No inbound emails have been processed yet.
          </div>
        ) : (
          <div className="grid gap-2">
            {rows.map((email) => (
              <a
                key={email.id}
                href={email.processedStatus === "unmatched" ? `/email-associate/${email.id}` : "#"}
                className="grid gap-1 rounded-md border border-border/60 p-3 text-sm transition hover:bg-muted/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{email.subject}</span>
                  <Badge
                    variant={email.processedStatus === "unmatched" ? "destructive" : "secondary"}
                  >
                    {email.processedStatus}
                  </Badge>
                </div>
                <div className="truncate text-muted-foreground">{email.sender}</div>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
