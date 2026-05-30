import { HeartPulse, InfoIcon, Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiPut, toast } from "@/lib/api-client";

import { readConfig } from "./config-types";

interface HealthCheckConfig {
  greenhouse_tokens?: string[];
  ashby_tokens?: string[];
}

export function HealthConfigEditor() {
  const [greenhouseInput, setGreenhouseInput] = useState("");
  const [ashbyInput, setAshbyInput] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    readConfig<HealthCheckConfig>("health_check_config", {
      greenhouse_tokens: ["anthropic", "cloudflare"],
      ashby_tokens: ["replicate", "lattice"],
    })
      .then((result) => {
        const greenhouseList = result.value.greenhouse_tokens ?? ["anthropic", "cloudflare"];
        const ashbyList = result.value.ashby_tokens ?? ["replicate", "lattice"];
        setGreenhouseInput(greenhouseList.join(", "));
        setAshbyInput(ashbyList.join(", "));
        setIsDefault(result.isDefault);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  async function save() {
    setSaving(true);

    const greenhouseTokens = greenhouseInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const ashbyTokens = ashbyInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    try {
      await apiPut("/api/config/health_check_config", {
        value: {
          greenhouse_tokens: greenhouseTokens,
          ashby_tokens: ashbyTokens,
        },
      });
      toast({ title: "Health check configuration saved" });
      setIsDefault(false);
    } catch {
      toast({ title: "Failed to save configuration", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card className="border-border/60">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <HeartPulse className="size-5 text-emerald-400" />
          Health Checks Config
        </CardTitle>
        <CardDescription>
          Configure valid public job board tokens for Greenhouse and Ashby API diagnostics.
          This prevents false-positive alert failures on the health dashboard due to retired or private boards.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isDefault && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-400">
            <InfoIcon className="mt-0.5 size-4 shrink-0" />
            <span>Using default fallback tokens. Save custom tokens to override.</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Greenhouse Test Boards (comma-separated)</Label>
            <Input
              value={greenhouseInput}
              onChange={(e) => setGreenhouseInput(e.target.value)}
              placeholder="e.g. anthropic, cloudflare, snyk"
              className="h-9 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Valid Greenhouse tokens known to have active job boards (e.g. <code className="bg-muted px-1 rounded">anthropic</code>, <code className="bg-muted px-1 rounded">cloudflare</code>).
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Ashby Test Boards (comma-separated)</Label>
            <Input
              value={ashbyInput}
              onChange={(e) => setAshbyInput(e.target.value)}
              placeholder="e.g. replicate, lattice, clerk"
              className="h-9 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Valid Ashby tokens known to have active job boards (e.g. <code className="bg-muted px-1 rounded">replicate</code>, <code className="bg-muted px-1 rounded">lattice</code>).
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="gap-1.5"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            Save Configuration
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
