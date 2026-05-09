import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiPut, toast } from "@/lib/api-client";

import { readConfig } from "./config-types";

type TemplateIds = {
  resume: string;
  coverLetter: string;
  drivePrefix: string;
};

const fallback: TemplateIds = { resume: "", coverLetter: "", drivePrefix: "Career Orchestrator" };

export function TemplateIdsEditor() {
  const [value, setValue] = useState<TemplateIds>(fallback);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    readConfig<TemplateIds>("template_ids", fallback).then(({ value }) => setValue(value));
  }, []);

  async function save() {
    setSaving(true);

    try {
      await apiPut("/api/config/template_ids", { value });
      toast({ title: "Template IDs saved" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle>Template IDs</CardTitle>
        <CardDescription>
          Google Docs template identifiers used when Colby creates documents.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Field
          label="Resume template"
          value={value.resume}
          onChange={(resume) => setValue((current) => ({ ...current, resume }))}
        />
        <Field
          label="Cover letter template"
          value={value.coverLetter}
          onChange={(coverLetter) => setValue((current) => ({ ...current, coverLetter }))}
        />
        <Field
          label="Drive folder prefix"
          value={value.drivePrefix}
          onChange={(drivePrefix) => setValue((current) => ({ ...current, drivePrefix }))}
        />
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

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = label.toLowerCase().replaceAll(" ", "-");

  return (
    <label className="grid gap-2 text-sm font-medium" htmlFor={id}>
      {label}
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
