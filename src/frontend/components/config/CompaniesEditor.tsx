import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiDelete, apiGet, apiPost, apiPut, toast } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Company = {
  id: string;
  name: string;
  url: string | null;
  description: string | null;
  greenhouseToken: string | null;
  colorPrimary: string | null;
  colorAccent: string | null;
  attributes: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

type BrandColorPalette = {
  primary: string;
  accent: string;
  source: string;
};

import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerContent,
  ColorPickerHueSlider,
  ColorPickerInput,
  ColorPickerTrigger,
} from "@/components/ui/color-picker";

// ---------------------------------------------------------------------------
// Color Picker
// ---------------------------------------------------------------------------

function HexColorPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}) {
  const id = label.toLowerCase().replaceAll(" ", "-");
  const displayValue = value || "#1A365D";

  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-xs text-muted-foreground whitespace-nowrap min-w-[60px]">
        {label}
      </label>
      <ColorPicker value={displayValue} onValueChange={onChange}>
        <ColorPickerTrigger asChild>
          <Button variant="outline" className="w-full justify-start h-8 px-2 font-mono text-xs">
            <div
              className="h-4 w-4 mr-2 border border-border rounded-sm shrink-0"
              style={{ backgroundColor: displayValue }}
            />
            {value || "Pick color"}
          </Button>
        </ColorPickerTrigger>
        <ColorPickerContent className="w-[280px]">
          <ColorPickerArea />
          <ColorPickerHueSlider />
          <ColorPickerInput />
        </ColorPickerContent>
      </ColorPicker>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Company Card
// ---------------------------------------------------------------------------

function CompanyCard({
  company,
  onSave,
  onDelete,
}: {
  company: Company;
  onSave: (id: string, patch: Partial<Company>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(company.name);
  const [url, setUrl] = useState(company.url ?? "");
  const [token, setToken] = useState(company.greenhouseToken ?? "");
  const [primary, setPrimary] = useState(company.colorPrimary ?? "");
  const [accent, setAccent] = useState(company.colorAccent ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave(company.id, {
        name,
        url: url || null,
        greenhouseToken: token || null,
        colorPrimary: primary || null,
        colorAccent: accent || null,
      });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await onDelete(company.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="rounded-lg">
      <CardContent className="grid gap-3 pt-4">
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor={`co-name-${company.id}`}>
            Company
          </label>
          <Input
            id={`co-name-${company.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor={`co-url-${company.id}`}>
              Website
            </label>
            <Input
              id={`co-url-${company.id}`}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium" htmlFor={`co-token-${company.id}`}>
              Greenhouse Token
            </label>
            <Input
              id={`co-token-${company.id}`}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="company-slug"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <HexColorPicker label="Primary" value={primary} onChange={setPrimary} />
          <HexColorPicker label="Accent" value={accent} onChange={setAccent} />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="destructive" size="sm" disabled={deleting} onClick={() => void remove()}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
          <Button size="sm" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Add Company Modal
// ---------------------------------------------------------------------------

function AddCompanyModal({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [primary, setPrimary] = useState("");
  const [accent, setAccent] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [creating, setCreating] = useState(false);

  function reset() {
    setUrl("");
    setName("");
    setToken("");
    setPrimary("");
    setAccent("");
  }

  async function extract() {
    if (!url) return;
    setExtracting(true);
    try {
      const palette = await apiPost<BrandColorPalette>("/api/companies/extract-colors", { url });
      setPrimary(palette.primary);
      setAccent(palette.accent);

      // Auto-fill name from URL if empty
      if (!name) {
        try {
          const hostname = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
          const domain = hostname.replace(/^www\./, "").split(".")[0];
          setName(domain.charAt(0).toUpperCase() + domain.slice(1));
        } catch {
          // ignore
        }
      }

      toast({
        title: "Colors extracted",
        description: `Primary: ${palette.primary}, Accent: ${palette.accent}`,
      });
    } catch {
      toast({
        title: "Extraction failed",
        description: "Could not extract colors. You can enter them manually.",
        variant: "destructive",
      });
    } finally {
      setExtracting(false);
    }
  }

  async function create() {
    if (!name) return;
    setCreating(true);
    try {
      await apiPost("/api/companies", {
        name,
        url: url || undefined,
        greenhouseToken: token || undefined,
        colorPrimary: primary || undefined,
        colorAccent: accent || undefined,
      });
      toast({ title: "Company added" });
      reset();
      setOpen(false);
      onCreated();
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        + Add Company
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent
          className="max-w-md"
          onClose={() => {
            setOpen(false);
            reset();
          }}
        >
          <DialogHeader>
            <DialogTitle>Add Company</DialogTitle>
            <DialogDescription>
              Enter a company website URL to auto-extract brand colors, or set them manually.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* URL + Extract */}
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor="add-co-url">
                Website URL
              </label>
              <div className="flex gap-2">
                <Input
                  id="add-co-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://stripe.com"
                  className="flex-1"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!url || extracting}
                  onClick={() => void extract()}
                >
                  {extracting ? "Extracting…" : "Extract Colors"}
                </Button>
              </div>
            </div>

            {/* Name + Token */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="add-co-name">
                  Company Name*
                </label>
                <Input
                  id="add-co-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Stripe"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium" htmlFor="add-co-token">
                  Greenhouse Token
                </label>
                <Input
                  id="add-co-token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="stripe"
                />
              </div>
            </div>

            {/* Color pickers */}
            <div className="grid grid-cols-2 gap-3">
              <HexColorPicker label="Primary" value={primary} onChange={setPrimary} />
              <HexColorPicker label="Accent" value={accent} onChange={setAccent} />
            </div>

            {/* Preview swatches */}
            {(primary || accent) && (
              <div className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
                <span className="text-xs text-muted-foreground">Preview:</span>
                {primary && (
                  <div className="flex items-center gap-1.5">
                    <div
                      className="h-5 w-5 rounded border border-border"
                      style={{ backgroundColor: primary }}
                    />
                    <span className="font-mono text-xs">{primary}</span>
                  </div>
                )}
                {accent && (
                  <div className="flex items-center gap-1.5">
                    <div
                      className="h-5 w-5 rounded border border-border"
                      style={{ backgroundColor: accent }}
                    />
                    <span className="font-mono text-xs">{accent}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button disabled={!name || creating} onClick={() => void create()}>
              {creating ? "Saving…" : "Save Company"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Editor
// ---------------------------------------------------------------------------

export function CompaniesEditor() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<Company[]>("/api/companies");
      setCompanies(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(id: string, patch: Partial<Company>) {
    await apiPut(`/api/companies/${id}`, patch);
    toast({ title: "Company updated" });
    await load();
  }

  async function remove(id: string) {
    await apiDelete(`/api/companies/${id}`);
    toast({ title: "Company deleted" });
    await load();
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Company Brand Colors</CardTitle>
            <CardDescription className="mt-1">
              Store brand colors per company for branded resume and cover letter generation. Colors
              are applied subtly to document headings, borders, and accent elements.
            </CardDescription>
          </div>
          <AddCompanyModal onCreated={() => void load()} />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading companies…</p>
        ) : companies.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No companies saved yet. Click "Add Company" to get started.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {companies.map((co) => (
              <CompanyCard key={co.id} company={co} onSave={save} onDelete={remove} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
