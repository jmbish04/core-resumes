import { UserIcon, InfoIcon, Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiPut, toast } from "@/lib/api-client";

import { readConfig } from "./config-types";

interface ApplicantName {
  first_name: string;
  last_name: string;
  full_name: string;
}

interface ProfileData {
  applicant_name: ApplicantName;
  location: string;
  locations: string[];
  hubs: string[];
  target_roles: string[];
}

export function ApplicantProfileEditor() {
  const [profile, setProfile] = useState<ProfileData>({
    applicant_name: { first_name: "Justin", last_name: "Bishop", full_name: "Justin Bishop" },
    location: "San Francisco Bay Area",
    locations: ["san francisco", "bay area", "sf", "oakland", "san jose", "california", "ca"],
    hubs: ["San Francisco", "New York", "Seattle", "Austin"],
    target_roles: ["software engineer", "frontend", "backend", "fullstack", "devops"],
  });

  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    readConfig<ProfileData>("applicant_profile", {
      applicant_name: {
        first_name: "Justin",
        last_name: "Bishop",
        full_name: "Justin Bishop",
      },
      location: "San Francisco Bay Area",
      locations: ["san francisco", "bay area", "sf", "oakland", "san jose", "california", "ca"],
      hubs: ["San Francisco", "New York", "Seattle", "Austin"],
      target_roles: ["software engineer", "frontend", "backend", "fullstack", "devops"],
    }).then((result) => {
      setProfile(result.value);
      setIsDefault(result.isDefault);
    });
  }, []);

  async function save() {
    setSaving(true);
    try {
      await apiPut("/api/config/applicant_profile", {
        value: profile,
      });
      toast({ title: "Applicant profile saved successfully" });
      setIsDefault(false);
    } catch {
      toast({ title: "Failed to save profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="rounded-lg border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <UserIcon className="size-5 text-emerald-400" />
          Applicant Location &amp; Profile Config
        </CardTitle>
        <CardDescription>
          Configure the primary job market, role title keywords, and target hubs for compensation analysis.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isDefault && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-400">
            <InfoIcon className="mt-0.5 size-4 shrink-0" />
            <span>Using default profile config. Save custom values to override.</span>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">First Name</Label>
            <Input
              value={profile.applicant_name.first_name}
              onChange={(e) => {
                const first = e.target.value;
                setProfile({
                  ...profile,
                  applicant_name: {
                    ...profile.applicant_name,
                    first_name: first,
                    full_name: `${first} ${profile.applicant_name.last_name}`.trim(),
                  },
                });
              }}
              placeholder="e.g. Justin"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Last Name</Label>
            <Input
              value={profile.applicant_name.last_name}
              onChange={(e) => {
                const last = e.target.value;
                setProfile({
                  ...profile,
                  applicant_name: {
                    ...profile.applicant_name,
                    last_name: last,
                    full_name: `${profile.applicant_name.first_name} ${last}`.trim(),
                  },
                });
              }}
              placeholder="e.g. Bishop"
              className="h-8 text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          Your name — used to personalize agent prompts, cover letters, and chat interactions.
        </p>

        <div className="space-y-1.5">
          <Label className="text-xs">Primary Location Name</Label>
          <Input
            value={profile.location}
            onChange={(e) => setProfile({ ...profile, location: e.target.value })}
            placeholder="e.g. San Francisco Bay Area"
            className="h-8 text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Display name of your target primary market (e.g. SF Bay Area).
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Location Match Keywords (Comma-separated)</Label>
          <Textarea
            value={profile.locations.join(", ")}
            onChange={(e) =>
              setProfile({
                ...profile,
                locations: e.target.value
                  .split(",")
                  .map((k) => k.trim().toLowerCase())
                  .filter(Boolean),
              })
            }
            placeholder="san francisco, sf, bay area..."
            className="font-mono text-sm h-16"
          />
          <p className="text-xs text-muted-foreground">
            Lowercase words matched in job locations to categorize a job as "Local".
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Tech Hub Cities (Comma-separated)</Label>
          <Input
            value={profile.hubs.join(", ")}
            onChange={(e) =>
              setProfile({
                ...profile,
                hubs: e.target.value
                  .split(",")
                  .map((k) => k.trim())
                  .filter(Boolean),
              })
            }
            placeholder="Seattle, New York, Austin..."
            className="h-8 text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Cities categorized as "Top Hubs" for regional comparison.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Target Roles &amp; Titles (Comma-separated)</Label>
          <Textarea
            value={profile.target_roles.join(", ")}
            onChange={(e) =>
              setProfile({
                ...profile,
                target_roles: e.target.value
                  .split(",")
                  .map((k) => k.trim())
                  .filter(Boolean),
              })
            }
            placeholder="software engineer, frontend, backend..."
            className="font-mono text-sm h-16"
          />
          <p className="text-xs text-muted-foreground">
            Job board keywords used to pull raw salary stats and lookup H1B Hires.
          </p>
        </div>

        <div className="flex justify-end pt-2">
          <Button size="sm" onClick={() => void save()} disabled={saving} className="gap-1.5">
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            Save Profile
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
