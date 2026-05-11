import { InfoIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiPut, toast } from "@/lib/api-client";

import { readConfig } from "./config-types";

export function PromptEditor() {
  const [value, setValue] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    readConfig<string>("notebooklm_prompt", "").then((result) => {
      setValue(result.value);
      setIsDefault(result.isDefault);
    });
  }, []);

  async function save() {
    setSaving(true);

    try {
      await apiPut("/api/config/notebooklm_prompt", {
        value: value,
      });
      toast({ title: "Prompt template saved" });
      setIsDefault(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>NotebookLM Prompt</CardTitle>
        <CardDescription>
          Template used to query NotebookLM for career evidence. Supports {"{{label}}"} and{" "}
          {"{{itemsList}}"} placeholders.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {isDefault && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-400">
            <InfoIcon className="mt-0.5 size-4 shrink-0" />
            <span>Using default fallback value. Save a custom prompt to override.</span>
          </div>
        )}
        <Textarea value={value} onChange={(event) => setValue(event.target.value)} rows={6} />
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
