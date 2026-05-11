/**
 * @fileoverview Google Doc preview component with embedded iframe and Shadcn empty state fallback.
 * Fetches template_ids from global config and extracts the doc ID from URL or raw ID.
 */

import { FileWarning, Settings } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type DocType = "resume" | "coverLetter";

/**
 * Extracts a Google Doc ID from either:
 *  - A full URL like https://docs.google.com/document/d/ABC123.../edit
 *  - A raw doc ID string like "ABC123..."
 */
function extractDocId(input: string): string | null {
  if (!input || input.trim().length === 0) return null;
  const trimmed = input.trim();

  // Try regex for Google Docs URL
  const match = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];

  // If it looks like a raw ID (no slashes, reasonable length)
  if (!trimmed.includes("/") && trimmed.length >= 10) return trimmed;

  return null;
}

export function GoogleDocPreview({ docType, title }: { docType: DocType; title: string }) {
  const [docId, setDocId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/config/template_ids", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { value?: Record<string, string> };
        const value = data?.value;
        if (value && typeof value === "object") {
          const raw = docType === "resume" ? value.resume : value.coverLetter;
          if (typeof raw === "string") {
            setDocId(extractDocId(raw));
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [docType]);

  if (loading) {
    return (
      <div className="flex min-h-[600px] items-center justify-center rounded-lg border-2 border-dashed border-muted bg-muted/10 p-6">
        <p className="text-sm text-muted-foreground">Loading template…</p>
      </div>
    );
  }

  if (!docId) {
    return (
      <div className="flex min-h-[600px] flex-1 items-center justify-center rounded-lg border-2 border-dashed border-muted bg-muted/10 p-6">
        <Card className="w-full max-w-md border-0 bg-transparent text-center shadow-none">
          <CardHeader className="flex flex-col items-center space-y-4 pb-2">
            <div className="rounded-full bg-background p-3 shadow-sm ring-1 ring-border">
              <FileWarning className="size-8 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-xl font-semibold">Document Not Configured</CardTitle>
              <CardDescription className="text-base">
                The {title.toLowerCase()} template ID is currently blank.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              To display the preview here, add a valid Google Doc URL or ID in the Config page under{" "}
              <strong>Template IDs</strong>.
            </p>
          </CardContent>
          <CardFooter className="flex justify-center pt-2">
            <a href="/config">
              <Button>
                <Settings className="mr-2 size-4" />
                Configure Document
              </Button>
            </a>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const embedUrl = `https://docs.google.com/document/d/${docId}/preview?embedded=true`;

  return (
    <div className="flex min-h-[700px] flex-col gap-3">
      <iframe
        src={embedUrl}
        className="w-full flex-1 rounded-md border border-border/60 bg-white shadow-sm"
        title={`${title} Preview`}
        loading="lazy"
        style={{ minHeight: "700px" }}
      />
    </div>
  );
}
