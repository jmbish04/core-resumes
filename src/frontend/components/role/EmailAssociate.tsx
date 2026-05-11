import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiPost, toast } from "@/lib/api-client";

import type { EmailRow, RoleRow } from "../dashboard/types";

export function EmailAssociate({ email }: { email: EmailRow & { body?: string } }) {
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [selected, setSelected] = useState<string | null>(email.roleId);
  const activeRoles = useMemo(
    () => roles.filter((role) => role.status === "applied" || role.status === "interviewing"),
    [roles],
  );

  useEffect(() => {
    apiGet<RoleRow[]>("/api/roles").then(setRoles);
  }, []);

  async function associate(roleId: string) {
    const updated = await apiPost<EmailRow>(`/api/emails/${email.id}/associate`, { roleId });
    setSelected(updated.roleId);
    toast({ title: "Email associated" });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[24rem_1fr]">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>{email.subject}</CardTitle>
          <CardDescription>{email.sender}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <Badge variant={email.processedStatus === "unmatched" ? "destructive" : "secondary"}>
              {email.processedStatus}
            </Badge>
          </div>
          <p className="rounded-md border border-border/60 p-3 text-muted-foreground">
            {(email.body ?? "").slice(0, 200) || "No body text was parsed."}
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Associate Role</CardTitle>
          <CardDescription>Active applied and interviewing roles are eligible.</CardDescription>
        </CardHeader>
        <CardContent>
          {activeRoles.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
              No active roles are available for association.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {activeRoles.map((role) => (
                <div key={role.id} className="grid gap-3 rounded-md border border-border/60 p-4">
                  <div>
                    <div className="font-medium">{role.companyName}</div>
                    <div className="text-sm text-muted-foreground">{role.jobTitle}</div>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant="secondary">{role.status}</Badge>
                    <Button
                      type="button"
                      size="sm"
                      disabled={selected === role.id}
                      onClick={() => void associate(role.id)}
                    >
                      {selected === role.id ? "Associated" : "Associate"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
