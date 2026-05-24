import { CheckCircle2, Copy, Loader2, X, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiPost, toast } from "@/lib/api-client";

import { IntakeProgress, type IntakeStage, type IntakeLogData } from "./IntakeProgress";

// ---------------------------------------------------------------------------
// Bullet type definitions — mirrors backend ROLE_BULLET_TYPES
// ---------------------------------------------------------------------------

const BULLET_TYPE_META: {
  type: string;
  label: string;
  sourceField: string;
}[] = [
  { type: "KEY_RESPONSIBILITY", label: "Key Responsibilities", sourceField: "responsibilities" },
  {
    type: "REQUIRED_QUALIFICATION",
    label: "Required Qualifications",
    sourceField: "requiredQualifications",
  },
  {
    type: "PREFERRED_QUALIFICATION",
    label: "Preferred Qualifications",
    sourceField: "preferredQualifications",
  },
  { type: "REQUIRED_SKILL", label: "Required Skills", sourceField: "requiredSkills" },
  { type: "PREFERRED_SKILL", label: "Preferred Skills", sourceField: "preferredSkills" },
  {
    type: "EDUCATION_REQUIREMENT",
    label: "Education Requirements",
    sourceField: "educationRequirements",
  },
  { type: "BENEFIT", label: "Benefits", sourceField: "benefits" },
];

type BulletRow = { type: string; content: string };

// ---------------------------------------------------------------------------
// Draft type — comprehensive extraction fields
// ---------------------------------------------------------------------------

type DraftRole = {
  companyName: string;
  jobTitle: string;
  jobUrl?: string;
  jobPostingPdfUrl?: string;
  scrapedMarkdown?: string;
  scrapedHtml?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  roleInstructions?: string;
  // Comprehensive extracted fields (kept for metadata persistence)
  responsibilities?: string[];
  requiredQualifications?: string[];
  preferredQualifications?: string[];
  requiredSkills?: string[];
  preferredSkills?: string[];
  location?: string;
  workplaceType?: "remote" | "hybrid" | "onsite";
  rtoPolicy?: string;
  yearsExperienceMin?: number;
  yearsExperienceMax?: number;
  educationRequirements?: string[];
  department?: string;
  reportingTo?: string;
  travelRequirements?: string;
  securityClearance?: string;
  visaSponsorship?: string;
  benefits?: string[];
  additionalNotes?: string;
  // New fields
  aboutCompany?: string;
  aboutRoleNarrative?: string;
  otherContent?: string;
  metadata?: Record<string, unknown>;
};

type RoleResponse = DraftRole & { id: string };

// ---------------------------------------------------------------------------
// Helper: convert scraped arrays → structured bullet rows
// ---------------------------------------------------------------------------

function extractBulletsFromDraft(draft: DraftRole): BulletRow[] {
  const bullets: BulletRow[] = [];
  for (const meta of BULLET_TYPE_META) {
    const arr = (draft as any)[meta.sourceField] as string[] | undefined;
    if (arr && Array.isArray(arr)) {
      for (const content of arr) {
        if (content.trim()) {
          bullets.push({ type: meta.type, content: content.trim() });
        }
      }
    }
  }
  return bullets;
}

// ---------------------------------------------------------------------------
// IntakeModal
// ---------------------------------------------------------------------------

export function IntakeModal() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [stage, setStage] = useState<IntakeStage>("idle");
  const [draft, setDraft] = useState<DraftRole | null>(null);
  const [bullets, setBullets] = useState<BulletRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submissionPhase, setSubmissionPhase] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [createdRole, setCreatedRole] = useState<RoleResponse | null>(null);
  const [logs, setLogs] = useState<IntakeLogData>({
    scraping: [],
    extracting: [],
    mapping: [],
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }

    window.addEventListener("career:intake-open", onOpen);
    return () => window.removeEventListener("career:intake-open", onOpen);
  }, []);

  function resetModal() {
    // Abort any in-flight scrape
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setUrl("");
    setStage("idle");
    setDraft(null);
    setBullets([]);
    setSubmitting(false);
    setSubmitError(null);
    setSubmissionPhase("idle");
    setCreatedRole(null);
    setLogs({ scraping: [], extracting: [], mapping: [] });
  }

  function handleClose() {
    resetModal();
    setOpen(false);
  }

  function appendLog(stage: "scraping" | "extracting" | "mapping", message: string) {
    setLogs((prev) => ({
      ...prev,
      [stage]: [...prev[stage], { timestamp: Date.now(), message }],
    }));
  }

  async function scrape() {
    // Abort previous scrape if any
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setStage("scraping");
    setDraft(null);
    setBullets([]);
    setSubmitError(null);
    setLogs({ scraping: [], extracting: [], mapping: [] });

    let response: Response;
    try {
      response = await fetch("/api/intake/scrape", {
        body: JSON.stringify({ url }),
        credentials: "include",
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: controller.signal,
      });
    } catch (err) {
      // AbortError means the user cancelled — don't show an error toast
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setStage("error");
      toast({
        title: "Intake failed",
        description: String(err),
        variant: "destructive",
        copyable: true,
      });
      return;
    }

    if (!response.ok || !response.body) {
      setStage("error");
      toast({
        title: "Intake failed",
        description: response.statusText,
        variant: "destructive",
        copyable: true,
      });
      return;
    }

    try {
      await readSse(response.body, controller.signal, (event) => {
        if (event.stage === "error") {
          setStage("error");
          toast({
            title: "Intake failed",
            description: readError(event.payload),
            variant: "destructive",
            copyable: true,
          });
          return;
        }

        // Handle granular log events
        if (event.stage === "scraping_log" && event.payload && typeof event.payload === "object") {
          const { message } = event.payload as { message: string };
          appendLog("scraping", message);
          return;
        }

        if (
          event.stage === "scraping_markdown" &&
          event.payload &&
          typeof event.payload === "object"
        ) {
          const { content } = event.payload as { content: string };
          setLogs((prev) => ({ ...prev, scrapedMarkdown: content }));
          return;
        }

        if (
          event.stage === "extracting_log" &&
          event.payload &&
          typeof event.payload === "object"
        ) {
          const { message } = event.payload as { message: string };
          appendLog("extracting", message);
          return;
        }

        if (event.stage === "mapping_log" && event.payload && typeof event.payload === "object") {
          const { message } = event.payload as { message: string };
          appendLog("mapping", message);
          return;
        }

        // Handle stage transitions
        if (
          event.stage === "scraping" ||
          event.stage === "extracting" ||
          event.stage === "mapping"
        ) {
          setStage(event.stage as IntakeStage);
        }

        if (event.stage === "mapping" && event.payload && typeof event.payload === "object") {
          const draftData = event.payload as DraftRole;
          setDraft(draftData);
          setBullets(extractBulletsFromDraft(draftData));
          appendLog("mapping", "Field mapping complete — review and edit below");
          setStage("complete");
        }
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      throw err;
    }
  }

  async function confirm() {
    if (!draft) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmissionPhase("submitting");

    try {
      // Send roleBullets alongside the draft fields
      const payload = {
        ...draft,
        roleBullets: bullets.filter((b) => b.content.trim()),
      };
      const role = await apiPost<RoleResponse>("/api/intake/confirm", payload);
      setCreatedRole(role);
      setSubmissionPhase("success");
      // Auto-navigate after 1.5s
      setTimeout(() => {
        window.location.href = `/roles/${role.id}`;
      }, 1500);
    } catch (err) {
      // DO NOT clear draft on error — keep all data so the user doesn't lose work
      const message = err instanceof Error ? err.message : "Unknown error";
      setSubmitError(message);
      setSubmissionPhase("error");
    } finally {
      setSubmitting(false);
    }
  }

  function dismissError() {
    setSubmissionPhase("idle");
  }

  async function copyError() {
    if (submitError) {
      await navigator.clipboard.writeText(submitError);
      toast({ title: "Copied", description: "Error message copied to clipboard." });
    }
  }

  function updateDraft<K extends keyof DraftRole>(key: K, value: DraftRole[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  // ── Bullet CRUD helpers ────────────────────────────────────────────────

  function addBullet(type: string) {
    setBullets((prev) => [...prev, { type, content: "" }]);
  }

  function updateBullet(index: number, content: string) {
    setBullets((prev) => prev.map((b, i) => (i === index ? { ...b, content } : b)));
  }

  function deleteBullet(index: number) {
    setBullets((prev) => prev.filter((_, i) => i !== index));
  }

  const isScraping = stage === "scraping" || stage === "extracting" || stage === "mapping";

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : handleClose())}>
      <DialogContent onClose={handleClose} className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>New Role</DialogTitle>
          <DialogDescription>Scrape a job posting and confirm the role record.</DialogDescription>
        </DialogHeader>

        <div className="mt-5 grid gap-5">
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void scrape();
            }}
          >
            <label className="text-sm font-medium" htmlFor="job-url">
              Job posting URL
            </label>
            <div className="flex gap-2">
              <Input
                id="job-url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                required={!draft}
              />
              <Button type="submit" disabled={isScraping}>
                Scrape
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDraft({ companyName: "", jobTitle: "", jobUrl: url });
                  setBullets([]);
                  setStage("complete");
                }}
              >
                Enter manually
              </Button>
            </div>
          </form>

          <IntakeProgress stage={stage} logs={logs} />

          {draft && (
            <div className="grid gap-4 rounded-lg border border-border/60 p-4">
              {/* ── Submission error banner ────────────────────────── */}
              {submitError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <strong>Submission failed:</strong> {submitError}. Your data is preserved below —
                  fix any issues and try again.
                </div>
              )}

              {/* ── Core fields ──────────────────────────────────────── */}
              <SectionHeading>Core</SectionHeading>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Company"
                  value={draft.companyName}
                  onChange={(value) => updateDraft("companyName", value)}
                />
                <Field
                  label="Title"
                  value={draft.jobTitle}
                  onChange={(value) => updateDraft("jobTitle", value)}
                />
                <Field
                  label="Job URL"
                  value={draft.jobUrl ?? url}
                  onChange={(value) => updateDraft("jobUrl", value)}
                />
                <Field
                  label="Department"
                  value={draft.department ?? ""}
                  onChange={(value) => updateDraft("department", value || undefined)}
                />
                <Field
                  label="Reporting to"
                  value={draft.reportingTo ?? ""}
                  onChange={(value) => updateDraft("reportingTo", value || undefined)}
                />
              </div>

              {/* ── About the Company ───────────────────────────────── */}
              <SectionHeading>About the Company</SectionHeading>
              <label className="grid gap-1.5 text-sm font-medium" htmlFor="about-company">
                Company introduction / About Us
                <Textarea
                  id="about-company"
                  value={draft.aboutCompany ?? ""}
                  onChange={(event) => updateDraft("aboutCompany", event.target.value || undefined)}
                  rows={4}
                  placeholder="Paste or edit the company introduction section…"
                />
              </label>

              {/* ── About the Role ──────────────────────────────────── */}
              <SectionHeading>About the Role</SectionHeading>
              <label className="grid gap-1.5 text-sm font-medium" htmlFor="about-role-narrative">
                Role narrative (paragraphs before bullets)
                <Textarea
                  id="about-role-narrative"
                  value={draft.aboutRoleNarrative ?? ""}
                  onChange={(event) =>
                    updateDraft("aboutRoleNarrative", event.target.value || undefined)
                  }
                  rows={4}
                  placeholder="Paste or edit the role description paragraphs…"
                />
              </label>

              {/* ── Location & work arrangement ────────────────────── */}
              <SectionHeading>Location & Work Arrangement</SectionHeading>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Location"
                  value={draft.location ?? ""}
                  onChange={(value) => updateDraft("location", value || undefined)}
                />
                <SelectField
                  label="Workplace type"
                  value={draft.workplaceType ?? ""}
                  options={[
                    { value: "", label: "—" },
                    { value: "remote", label: "Remote" },
                    { value: "hybrid", label: "Hybrid" },
                    { value: "onsite", label: "Onsite" },
                  ]}
                  onChange={(value) =>
                    updateDraft("workplaceType", (value as DraftRole["workplaceType"]) || undefined)
                  }
                />
                <Field
                  label="RTO / Schedule policy"
                  value={draft.rtoPolicy ?? ""}
                  onChange={(value) => updateDraft("rtoPolicy", value || undefined)}
                />
                <Field
                  label="Travel requirements"
                  value={draft.travelRequirements ?? ""}
                  onChange={(value) => updateDraft("travelRequirements", value || undefined)}
                />
              </div>

              {/* ── Compensation ───────────────────────────────────── */}
              <SectionHeading>Compensation</SectionHeading>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field
                  label="Salary min"
                  value={draft.salaryMin?.toString() ?? ""}
                  type="number"
                  onChange={(value) => updateDraft("salaryMin", value ? Number(value) : undefined)}
                />
                <Field
                  label="Salary max"
                  value={draft.salaryMax?.toString() ?? ""}
                  type="number"
                  onChange={(value) => updateDraft("salaryMax", value ? Number(value) : undefined)}
                />
                <Field
                  label="Currency"
                  value={draft.salaryCurrency ?? "USD"}
                  onChange={(value) => updateDraft("salaryCurrency", value)}
                />
              </div>

              {/* ── Experience ─────────────────────────────────────── */}
              <SectionHeading>Experience</SectionHeading>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Min years experience"
                  value={draft.yearsExperienceMin?.toString() ?? ""}
                  type="number"
                  onChange={(value) =>
                    updateDraft("yearsExperienceMin", value ? Number(value) : undefined)
                  }
                />
                <Field
                  label="Max years experience"
                  value={draft.yearsExperienceMax?.toString() ?? ""}
                  type="number"
                  onChange={(value) =>
                    updateDraft("yearsExperienceMax", value ? Number(value) : undefined)
                  }
                />
              </div>

              {/* ── Bullet Section Tables (CRUD) ──────────────────── */}
              {BULLET_TYPE_META.map((meta) => {
                const typeBullets = bullets
                  .map((b, i) => ({ ...b, globalIndex: i }))
                  .filter((b) => b.type === meta.type);

                return (
                  <BulletSection
                    key={meta.type}
                    label={meta.label}
                    type={meta.type}
                    bullets={typeBullets}
                    onAdd={() => addBullet(meta.type)}
                    onUpdate={updateBullet}
                    onDelete={deleteBullet}
                  />
                );
              })}

              {/* ── Logistics ──────────────────────────────────────── */}
              <SectionHeading>Logistics</SectionHeading>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Security clearance"
                  value={draft.securityClearance ?? ""}
                  onChange={(value) => updateDraft("securityClearance", value || undefined)}
                />
                <Field
                  label="Visa sponsorship"
                  value={draft.visaSponsorship ?? ""}
                  onChange={(value) => updateDraft("visaSponsorship", value || undefined)}
                />
              </div>

              {/* ── Other Content (catch-all) ──────────────────────── */}
              <SectionHeading>Other</SectionHeading>
              <label className="grid gap-2 text-sm font-medium" htmlFor="other-content">
                Other content (EEO, disclaimers, missed content)
                <Textarea
                  id="other-content"
                  value={draft.otherContent ?? ""}
                  onChange={(event) => updateDraft("otherContent", event.target.value || undefined)}
                  rows={3}
                  placeholder="Paste anything the scraping extraction failed to pick up…"
                />
              </label>

              {/* ── Additional notes ──────────────────────────────── */}
              <SectionHeading>Notes</SectionHeading>
              <label className="grid gap-2 text-sm font-medium" htmlFor="additional-notes">
                Additional notes
                <Textarea
                  id="additional-notes"
                  value={draft.additionalNotes ?? ""}
                  onChange={(event) =>
                    updateDraft("additionalNotes", event.target.value || undefined)
                  }
                  rows={3}
                />
              </label>
              <label className="grid gap-2 text-sm font-medium" htmlFor="role-instructions">
                Role instructions (AI agent directives)
                <Textarea
                  id="role-instructions"
                  value={draft.roleInstructions ?? ""}
                  onChange={(event) => updateDraft("roleInstructions", event.target.value)}
                  rows={3}
                />
              </label>
            </div>
          )}
        </div>

        <DialogFooter className="mt-6">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!draft || submitting}
            onClick={confirm}
            className="min-w-[120px]"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Submitting…
              </>
            ) : (
              "Confirm Role"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* ─── Submission Overlay ─────────────────────────────────────── */}
      {submissionPhase !== "idle" && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-2xl">
            {submissionPhase === "submitting" && (
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="relative flex size-16 items-center justify-center">
                  <div className="absolute inset-0 animate-ping rounded-full bg-blue-500/20" />
                  <Loader2 className="size-10 animate-spin text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold">Creating Role…</h3>
                <p className="text-sm text-muted-foreground">
                  Setting up {draft?.companyName ?? "company"} — {draft?.jobTitle ?? "role"}
                </p>
              </div>
            )}

            {submissionPhase === "success" && (
              <div className="flex flex-col items-center gap-4 text-center">
                <div
                  className="flex size-16 items-center justify-center rounded-full bg-emerald-500/15 ring-2 ring-emerald-500/30"
                  style={{ animation: "intake-pop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)" }}
                >
                  <CheckCircle2 className="size-9 text-emerald-400" />
                </div>
                <h3 className="text-lg font-semibold text-emerald-400">Role Created!</h3>
                <p className="text-sm text-muted-foreground">
                  {createdRole?.companyName} — {createdRole?.jobTitle}
                </p>
                <p className="text-xs text-muted-foreground">Redirecting to role viewport…</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => createdRole && (window.location.href = `/roles/${createdRole.id}`)}
                >
                  View Role Now
                </Button>
              </div>
            )}

            {submissionPhase === "error" && (
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-red-500/15 ring-2 ring-red-500/30">
                      <XCircle className="size-6 text-red-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-red-400">Submission Failed</h3>
                      <p className="text-xs text-muted-foreground">Your data has been preserved</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={dismissError}
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <pre className="max-h-48 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-red-300">
                  {submitError}
                </pre>

                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={copyError}>
                    <Copy className="size-3.5" />
                    Copy Error
                  </Button>
                  <Button size="sm" variant="outline" onClick={dismissError}>
                    Close
                  </Button>
                  <Button size="sm" className="ml-auto" onClick={confirm}>
                    Retry
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-1 border-b border-border/40 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  const id = label.toLowerCase().replaceAll(" ", "-");

  return (
    <label className="grid gap-1.5 text-sm font-medium" htmlFor={id}>
      {label}
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const id = label.toLowerCase().replaceAll(" ", "-");

  return (
    <label className="grid gap-1.5 text-sm font-medium" htmlFor={id}>
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---------------------------------------------------------------------------
// BulletSection — CRUD table for a single bullet type
// ---------------------------------------------------------------------------

function BulletSection({
  label,
  type,
  bullets,
  onAdd,
  onUpdate,
  onDelete,
}: {
  label: string;
  type: string;
  bullets: Array<BulletRow & { globalIndex: number }>;
  onAdd: () => void;
  onUpdate: (globalIndex: number, content: string) => void;
  onDelete: (globalIndex: number) => void;
}) {
  return (
    <div>
      <div className="mt-1 flex items-center justify-between border-b border-border/40 pb-1">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
          {bullets.length > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal">
              {bullets.length}
            </span>
          )}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={onAdd}
        >
          + Add
        </Button>
      </div>

      {bullets.length === 0 ? (
        <p className="mt-2 rounded-md border border-dashed border-border/40 p-3 text-center text-xs text-muted-foreground">
          No items. Click <strong>+ Add</strong> to add manually.
        </p>
      ) : (
        <div className="mt-2 grid gap-1.5">
          {bullets.map((bullet) => (
            <div key={`${type}-${bullet.globalIndex}`} className="flex items-start gap-2">
              <Textarea
                value={bullet.content}
                onChange={(e) => onUpdate(bullet.globalIndex, e.target.value)}
                placeholder="Enter bullet content…"
                className="flex-1 resize-none text-xs min-h-[2.25rem]"
                rows={Math.max(1, Math.ceil(bullet.content.length / 80))}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-1 h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(bullet.globalIndex)}
                aria-label="Delete bullet"
              >
                ✕
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SSE stream reader (with abort support)
// ---------------------------------------------------------------------------

async function readSse(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onEvent: (event: { stage: string; payload?: unknown }) => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Abort listener — cancel the reader when the signal fires
  const onAbort = () => {
    reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    while (true) {
      if (signal.aborted) {
        break;
      }

      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        const line = event
          .split("\n")
          .find((item) => item.startsWith("data: "))
          ?.slice(6);

        if (line) {
          onEvent(JSON.parse(line));
        }
      }
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function readError(payload: unknown) {
  if (payload && typeof payload === "object" && "message" in payload) {
    return typeof payload.message === "string" ? payload.message : "Unknown intake error";
  }

  return "Unknown intake error";
}
