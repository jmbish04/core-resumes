/**
 * @fileoverview NotebookLM session manager — paste cookies from Chrome DevTools
 * to update the active session in Cloudflare KV.
 */

import {
  Cookie,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Copy,
  Check,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, apiPut, toast } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionStatus {
  hasSession: boolean;
  cookieLength?: number;
  preview?: string;
  updatedAt?: string;
  source: "kv" | "secret" | "none";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SOURCE_META: Record<string, { label: string; color: string; icon: typeof ShieldCheck }> = {
  kv: {
    label: "KV (Hot-Swap)",
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    icon: KeyRound,
  },
  secret: {
    label: "Worker Secret (Fallback)",
    color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    icon: ShieldCheck,
  },
  none: {
    label: "No Session",
    color: "bg-red-500/10 text-red-400 border-red-500/20",
    icon: AlertTriangle,
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NotebookSessionManager() {
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [cookieInput, setCookieInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadStatus = useCallback(async (showFeedback?: boolean) => {
    setLoading(true);
    try {
      const startTime = Date.now();
      const data = await apiGet<SessionStatus>("/api/notebook/session");

      if (showFeedback) {
        const elapsed = Date.now() - startTime;
        if (elapsed < 300) {
          await new Promise((resolve) => setTimeout(resolve, 300 - elapsed));
        }
        toast({ title: "Refreshed", description: "Latest session status fetched." });
      }

      setStatus(data);
    } catch {
      /* toast handled by apiGet */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleSave = async () => {
    const trimmed = cookieInput.trim();
    if (trimmed.length < 20) {
      toast({
        title: "Too short",
        description: "That doesn't look like a valid cookie string.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      await apiPut("/api/notebook/session", { cookies: trimmed });
      toast({
        title: "✓ Session saved",
        description: "KV has been updated — the Worker will use the new cookies immediately.",
        variant: "success",
      });
      setCookieInput("");
      loadStatus();
    } catch {
      /* handled */
    }
    setSaving(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter (without Shift) submits the cookie
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  };

  const copyInstructions = () => {
    navigator.clipboard.writeText(
      "1. Open https://notebooklm.google.com/ in Chrome\n2. Open DevTools (F12) → Application → Cookies → notebooklm.google.com\n3. Select all cookie rows, right-click → Copy all\n4. Or: Network tab → any request → Headers → copy the Cookie: header value",
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sourceMeta = status ? SOURCE_META[status.source] : SOURCE_META.none;
  const SourceIcon = sourceMeta.icon;

  const timeSince = status?.updatedAt ? getTimeSince(new Date(status.updatedAt)) : null;

  return (
    <div className="space-y-5">
      {/* Current status */}
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cookie className="size-4" />
            NotebookLM Session
          </CardTitle>
          <CardDescription>
            Manages the Google session cookies used by the NotebookLM integration.
          </CardDescription>
          <CardAction>
            <Button variant="ghost" size="sm" onClick={() => loadStatus(true)} disabled={loading}>
              <RefreshCw className={`mr-1.5 size-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {loading && !status ? (
            <div className="h-16 animate-pulse rounded-md bg-muted/50" />
          ) : status ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Source
                </p>
                <Badge variant="outline" className={sourceMeta.color}>
                  <SourceIcon className="mr-1.5 size-3" />
                  {sourceMeta.label}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Cookie Length
                </p>
                <p className="text-sm font-medium">
                  {status.cookieLength ? `${status.cookieLength.toLocaleString()} chars` : "—"}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Last Updated
                </p>
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {timeSince ? (
                    <>
                      <Clock className="size-3 text-muted-foreground" />
                      {timeSince}
                    </>
                  ) : (
                    "—"
                  )}
                </p>
              </div>
            </div>
          ) : null}

          {status?.preview && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Preview
              </p>
              <code className="mt-1 block break-all rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                {status.preview}
              </code>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Update session */}
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" />
            Update Session
          </CardTitle>
          <CardDescription>
            Paste your NotebookLM cookies from Chrome DevTools to update the active session. The
            Worker will use the new cookies immediately — no deploy required.
          </CardDescription>
        </CardHeader>
        <CardContent className="max-w-2xl space-y-4">
          {/* Instructions */}
          <div className="rounded-md border border-border/60 bg-muted/20 p-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  How to get cookies
                </p>
                <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-muted-foreground">
                  <li>
                    Open{" "}
                    <a
                      href="https://notebooklm.google.com/"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline underline-offset-2"
                    >
                      notebooklm.google.com
                    </a>{" "}
                    in Chrome
                  </li>
                  <li>
                    Open DevTools (
                    <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px]">
                      F12
                    </kbd>
                    ) → <strong>Network</strong> tab
                  </li>
                  <li>
                    Reload the page, click any request to{" "}
                    <code className="text-[11px]">notebooklm.google.com</code>
                  </li>
                  <li>
                    In <strong>Request Headers</strong>, copy the entire{" "}
                    <code className="text-[11px]">Cookie:</code> header value
                  </li>
                </ol>
              </div>
              <Button variant="ghost" size="sm" className="shrink-0" onClick={copyInstructions}>
                {copied ? <Check className="mr-1 size-3" /> : <Copy className="mr-1 size-3" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          {/* Cookie input — constrained width, word-wrapping, Enter-to-submit */}
          <Textarea
            value={cookieInput}
            onChange={(e) => setCookieInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Paste your cookie string here (e.g., SID=abc123; HSID=def456; SSID=...)..."
            rows={5}
            className="max-w-full resize-y break-all font-mono text-xs [overflow-wrap:anywhere]"
          />

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {cookieInput.length > 0 ? (
                <>
                  {cookieInput.trim().length} characters
                  <span className="ml-2 text-muted-foreground/60">Press Enter to save</span>
                </>
              ) : (
                "Paste cookie value above"
              )}
            </p>
            <Button onClick={handleSave} disabled={saving || cookieInput.trim().length < 20}>
              {saving ? "Saving..." : "Update Session"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTimeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
