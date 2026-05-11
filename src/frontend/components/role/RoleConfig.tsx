import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiPatch, toast } from "@/lib/api-client";

import type { RoleRow } from "../dashboard/types";

export function RoleConfig({ role }: { role: RoleRow & { roleInstructions?: string | null } }) {
  const [value, setValue] = useState(role.roleInstructions ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);

    try {
      await apiPatch<RoleRow>(`/api/roles/${role.id}`, { roleInstructions: value || null });
      toast({ title: "Role instructions saved" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Role Instructions</CardTitle>
        <CardDescription>Overrides that Colby should apply only for this role.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Textarea value={value} onChange={(event) => setValue(event.target.value)} rows={8} />
        <div className="flex justify-end">
          <Button type="button" disabled={saving} onClick={() => void save()}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
