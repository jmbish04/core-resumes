import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiPut, toast } from "@/lib/api-client";

import { readConfig } from "./config-types";

export function AgentRulesEditor() {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    readConfig<string[]>("agent_rules", []).then(({ value }) => setValue(value.join("\n")));
  }, []);

  async function save() {
    setSaving(true);

    try {
      await apiPut("/api/config/agent_rules", {
        value: value
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      });
      toast({ title: "Agent rules saved" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Agent Rules</CardTitle>
        <CardDescription>Global guardrails prepended to NotebookLM consultation.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Textarea value={value} onChange={(event) => setValue(event.target.value)} rows={10} />
        <Button
          type="button"
          className="justify-self-end"
          disabled={saving}
          onClick={() => void save()}
        >
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
