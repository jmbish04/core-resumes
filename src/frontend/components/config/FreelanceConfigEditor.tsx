import { Zap, InfoIcon, Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPut, toast } from "@/lib/api-client";

export function FreelanceConfigEditor() {
  const [skills, setSkills] = useState("");
  const [hourlyMin, setHourlyMin] = useState(50);
  const [experienceLevel, setExperienceLevel] = useState("expert");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiGet("/api/freelance/profile")
      .then((res: any) => {
        if (res.data) {
          const profile = res.data;
          if (profile.skills) {
            setSkills(
              Array.isArray(profile.skills)
                ? profile.skills.join(", ")
                : String(profile.skills)
            );
          }
          if (profile.hourly_min_usd) {
            setHourlyMin(Number(profile.hourly_min_usd));
          }
          if (profile.experience_level) {
            setExperienceLevel(String(profile.experience_level));
          }
        }
      })
      .catch(() => {
        toast({ title: "Failed to load freelance config", variant: "destructive" });
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  async function save() {
    setSaving(true);
    try {
      // Split skills by comma and clean whitespace
      const skillsArray = skills
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      // Save each setting using standard PUT endpoint
      await Promise.all([
        apiPut("/api/freelance/profile/skills", { value: skillsArray }),
        apiPut("/api/freelance/profile/hourly_min_usd", { value: hourlyMin }),
        apiPut("/api/freelance/profile/experience_level", { value: experienceLevel }),
      ]);

      toast({ title: "Freelance configuration saved successfully" });
    } catch {
      toast({ title: "Failed to save configuration", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card className="rounded-lg border-border/60">
        <CardContent className="h-32 flex items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-lg border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Zap className="size-5 text-emerald-400" />
          Freelance Scan Configuration
        </CardTitle>
        <CardDescription>
          Configure the dynamic settings, target skills, and budget limits used by your freelance pipeline scanners.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Dynamic Target Skills (Comma-separated)</Label>
          <Textarea
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            placeholder="React, TypeScript, Node.js, Next.js, Cloudflare Workers..."
            className="font-mono text-sm h-24"
          />
          <p className="text-xs text-muted-foreground">
            Target skill parameters sent to Upwork and Freelancer APIs during automated scans when query arguments are blank.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Minimum Hourly Rate (USD)</Label>
            <Input
              type="number"
              value={hourlyMin}
              onChange={(e) => setHourlyMin(Number(e.target.value))}
              placeholder="e.g. 50"
              className="h-8 text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Used as a minimum budget threshold filter during matching searches.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Target Experience Level</Label>
            <Select value={experienceLevel} onValueChange={(val) => setExperienceLevel(val ?? "expert")}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Select experience" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entry">Entry Level</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="expert">Expert</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Preferred developer experience level filter matching for freelance postings.
            </p>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button size="sm" onClick={() => void save()} disabled={saving} className="gap-1.5">
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
