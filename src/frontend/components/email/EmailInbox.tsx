/**
 * @fileoverview Reusable email inbox widget inspired by shadcn sidebar-09
 * mail-list pattern. Shows a scrollable list of emails on the left with a
 * detail panel on the right. Used on global emails page, role viewport, and
 * company viewport.
 */

import {
  ArrowLeft,
  ArrowUpRight,
  Bot,
  Calendar,
  Check,
  ClipboardCopy,
  Inbox,
  Link2,
  Loader2,
  Mail,
  MailOpen,
  MessageSquare,
  Search,
  Sparkles,
  X,
  AlertTriangle,
  Forward,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiGet, apiPost, toast } from "@/lib/api-client";

import type { EmailClassification, EmailRow, RoleRow } from "../dashboard/types";

// ---------------------------------------------------------------------------
// Intent & status metadata
// ---------------------------------------------------------------------------

const INTENT_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  interview_scheduling: {
    label: "Interview",
    color: "text-blue-400 bg-blue-400/10",
    icon: <Calendar className="size-3" />,
  },
  rejection: {
    label: "Rejection",
    color: "text-red-400 bg-red-400/10",
    icon: <X className="size-3" />,
  },
  offer: {
    label: "Offer",
    color: "text-emerald-400 bg-emerald-400/10",
    icon: <Sparkles className="size-3" />,
  },
  status_update: {
    label: "Update",
    color: "text-amber-400 bg-amber-400/10",
    icon: <Mail className="size-3" />,
  },
  general: {
    label: "General",
    color: "text-muted-foreground bg-muted",
    icon: <Mail className="size-3" />,
  },
  unknown: {
    label: "Unknown",
    color: "text-muted-foreground bg-muted",
    icon: <Mail className="size-3" />,
  },
};

const STATUS_META: Record<
  string,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: React.ReactNode;
  }
> = {
  pending: { label: "Pending", variant: "default", icon: <Mail className="size-3" /> },
  unmatched: {
    label: "Unmatched",
    variant: "destructive",
    icon: <AlertTriangle className="size-3" />,
  },
  associated: { label: "Associated", variant: "secondary", icon: <Link2 className="size-3" /> },
  responded: { label: "Responded", variant: "outline", icon: <MailOpen className="size-3" /> },
  ignored: { label: "Ignored", variant: "outline", icon: <Mail className="size-3 opacity-40" /> },
  action_taken: { label: "Actioned", variant: "secondary", icon: <Bot className="size-3" /> },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EmailInboxProps {
  /** API filter — one of: global (all), roleId, or companyId */
  filter?: { roleId?: string; companyId?: string };
  /** Max height for the inbox container */
  maxHeight?: string;
  /** Whether to show the "Forward emails to…" banner */
  showForwardBanner?: boolean;
  /** Worker email address (from env) */
  workerEmail?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmailInbox({
  filter,
  maxHeight = "600px",
  showForwardBanner = false,
  workerEmail = "job-pipeline@hacolby.app",
}: EmailInboxProps) {
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [copied, setCopied] = useState(false);

  // Association state
  const [associating, setAssociating] = useState<EmailRow | null>(null);
  const [assocRoleId, setAssocRoleId] = useState("");
  const [assocLoading, setAssocLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter?.roleId) params.set("roleId", filter.roleId);
      if (filter?.companyId) params.set("companyId", filter.companyId);
      const qs = params.toString() ? `?${params.toString()}` : "";

      const [emailRows, roleRows] = await Promise.all([
        apiGet<EmailRow[]>(`/api/emails${qs}`),
        apiGet<RoleRow[]>("/api/roles"),
      ]);
      setEmails(emailRows);
      setRoles(roleRows);
    } catch {
      toast({ title: "Failed to load emails", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [filter?.roleId, filter?.companyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Role lookup map
  const roleMap = useMemo(() => {
    const map = new Map<string, RoleRow>();
    for (const role of roles) map.set(role.id, role);
    return map;
  }, [roles]);

  // Filtered + sorted
  const filtered = useMemo(() => {
    let result = emails;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.subject.toLowerCase().includes(q) ||
          e.sender.toLowerCase().includes(q) ||
          e.classificationJson?.companyName?.toLowerCase().includes(q) ||
          e.classificationJson?.jobTitle?.toLowerCase().includes(q),
      );
    }
    return result.sort(
      (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    );
  }, [emails, searchQuery]);

  const selectedEmail = selectedId ? (filtered.find((e) => e.id === selectedId) ?? null) : null;

  // Copy email address
  function handleCopy() {
    navigator.clipboard.writeText(workerEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Associate email with a role
  async function handleAssociate() {
    if (!associating || !assocRoleId) return;
    setAssocLoading(true);
    try {
      await apiPost(`/api/emails/${associating.id}/associate`, { roleId: assocRoleId });
      toast({
        title: "Email associated",
        description: "Email linked to role — AI workflow triggered.",
      });
      setAssociating(null);
      setAssocRoleId("");
      await fetchData();
    } catch (err) {
      toast({
        title: "Association failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setAssocLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" /> Loading emails…
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {/* Forward banner */}
      {showForwardBanner && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-400/20 bg-blue-400/5 px-4 py-3">
          <Forward className="size-4 text-blue-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-400">Forward recruiting emails to</p>
            <code className="text-xs font-mono text-muted-foreground break-all">{workerEmail}</code>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0 gap-1 text-xs" onClick={handleCopy}>
            {copied ? (
              <Check className="size-3 text-emerald-400" />
            ) : (
              <ClipboardCopy className="size-3" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}

      {/* Main inbox card */}
      <Card className="rounded-lg overflow-hidden">
        <div className="flex" style={{ height: maxHeight }}>
          {/* Mail list (left) */}
          <div
            className={`flex flex-col border-r border-border/60 ${
              selectedEmail ? "hidden md:flex md:w-[360px] lg:w-[400px]" : "w-full"
            }`}
          >
            {/* Search */}
            <div className="border-b border-border/60 p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search emails…"
                  className="h-8 pl-8 text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {filtered.length === emails.length
                  ? `${emails.length} emails`
                  : `${filtered.length} of ${emails.length}`}
              </p>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
                  <Inbox className="size-8 opacity-30" />
                  <p className="text-sm">
                    {emails.length === 0
                      ? "No emails received yet."
                      : "No emails match your search."}
                  </p>
                </div>
              ) : (
                filtered.map((email) => {
                  const classification = email.classificationJson;
                  const intentMeta = classification
                    ? (INTENT_META[classification.intent] ?? INTENT_META.unknown)
                    : null;
                  const statusMeta = STATUS_META[email.processedStatus] ?? STATUS_META.pending;
                  const isActive = selectedId === email.id;

                  return (
                    <button
                      key={email.id}
                      type="button"
                      onClick={() => setSelectedId(email.id)}
                      className={`flex w-full flex-col items-start gap-1.5 border-b border-border/40 p-4 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/40 ${
                        isActive ? "bg-muted/60" : ""
                      }`}
                    >
                      <div className="flex w-full items-center gap-2">
                        <span className="truncate font-medium text-foreground">
                          {classification?.senderPersonName || email.sender.split("@")[0]}
                        </span>
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {formatDate(email.receivedAt)}
                        </span>
                      </div>
                      <span className="truncate w-full font-medium text-sm">{email.subject}</span>
                      <span className="line-clamp-2 w-full text-xs text-muted-foreground">
                        {email.body?.slice(0, 150) || "No preview available."}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Badge
                          variant={statusMeta.variant}
                          className="gap-0.5 text-[10px] px-1.5 py-0"
                        >
                          {statusMeta.icon}
                          {statusMeta.label}
                        </Badge>
                        {intentMeta && (
                          <span
                            className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[10px] font-medium ${intentMeta.color}`}
                          >
                            {intentMeta.icon}
                            {intentMeta.label}
                          </span>
                        )}
                        {email.draftReply && (
                          <Badge
                            variant="outline"
                            className="gap-0.5 text-[10px] px-1.5 py-0 text-blue-400"
                          >
                            <MessageSquare className="size-2.5" />
                            Draft
                          </Badge>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Detail panel (right) */}
          {selectedEmail ? (
            <div className="flex-1 flex flex-col overflow-y-auto">
              {/* Header */}
              <div className="border-b border-border/60 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 md:hidden"
                    onClick={() => setSelectedId(null)}
                  >
                    <ArrowLeft className="size-4" />
                  </Button>
                  <h3 className="text-base font-semibold flex-1 truncate">
                    {selectedEmail.subject}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    From: <strong className="text-foreground">{selectedEmail.sender}</strong>
                  </span>
                  <span className="text-xs">·</span>
                  <span className="text-xs">
                    {new Date(selectedEmail.receivedAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Associated Role Block */}
              <div className="border-b border-border/60 p-4 bg-muted/10">
                {selectedEmail.roleId && roleMap.get(selectedEmail.roleId) ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Link2 className="size-4 text-emerald-400" />
                      <span className="font-medium text-foreground">Associated Role:</span>
                      <a
                        href={`/roles/${selectedEmail.roleId}`}
                        className="font-medium text-blue-400 hover:underline inline-flex items-center gap-1"
                      >
                        {roleMap.get(selectedEmail.roleId)!.companyName} —{" "}
                        {roleMap.get(selectedEmail.roleId)!.jobTitle}
                        <ArrowUpRight className="size-3" />
                      </a>
                      {selectedEmail.aiRoleMatchConfidence != null && (
                        <Badge variant="outline" className="ml-auto text-xs bg-background">
                          <Bot className="size-3 mr-1" />
                          AI Match: {selectedEmail.aiRoleMatchConfidence}%
                        </Badge>
                      )}
                    </div>
                    {selectedEmail.aiRoleMatchRationale && (
                      <p className="text-xs text-muted-foreground bg-background rounded p-2 border border-border/40 mt-1">
                        <strong>AI Reasoning:</strong> {selectedEmail.aiRoleMatchRationale}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-3">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="size-4" />
                      <h4 className="font-semibold text-sm">Action Needed: Unmatched Email</h4>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This email could not be confidently mapped to an active role application.
                    </p>
                    {selectedEmail.aiRoleMatchRationale && (
                      <p className="text-xs text-muted-foreground bg-background/50 rounded p-2 border border-destructive/20 italic">
                        <strong>AI Reasoning:</strong> {selectedEmail.aiRoleMatchRationale}
                      </p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-fit mt-1 text-xs border-destructive/30 hover:bg-destructive/20"
                      onClick={() => {
                        setAssociating(selectedEmail);
                        setAssocRoleId("");
                      }}
                    >
                      <Link2 className="size-3 mr-2" />
                      Manually Associate Role
                    </Button>
                  </div>
                )}
              </div>

              {/* Classification metadata */}
              {selectedEmail.classificationJson && (
                <div className="border-b border-border/60 px-4 py-3">
                  <ClassificationMeta classification={selectedEmail.classificationJson} />
                </div>
              )}

              {/* Availability options */}
              {selectedEmail.classificationJson?.availabilityOptions?.length ? (
                <div className="border-b border-border/60 px-4 py-3">
                  <div className="rounded-md border border-blue-400/20 bg-blue-400/5 px-3 py-2">
                    <p className="mb-1 text-xs font-medium text-blue-400">
                      <Calendar className="mr-1 inline size-3" />
                      Interview Time Options
                    </p>
                    <ul className="list-disc pl-4 text-xs text-muted-foreground">
                      {selectedEmail.classificationJson.availabilityOptions.map((opt, i) => (
                        <li key={i}>{opt}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : null}

              {/* Draft reply */}
              {selectedEmail.draftReply && (
                <div className="border-b border-border/60 px-4 py-3">
                  <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                    <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                      <MessageSquare className="size-3" />
                      AI Draft Reply
                    </p>
                    <pre className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                      {selectedEmail.draftReply}
                    </pre>
                  </div>
                </div>
              )}

              {/* Body preview */}
              <div className="flex-1 px-4 py-3">
                <pre className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                  {selectedEmail.body || "No body content."}
                </pre>
              </div>

              {/* Actions */}
              <div className="sticky bottom-0 border-t border-border/60 bg-background px-4 py-3 flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1 text-xs"
                  onClick={() => {
                    setAssociating(selectedEmail);
                    setAssocRoleId(selectedEmail.roleId ?? "");
                  }}
                >
                  <Link2 className="size-3" />
                  {selectedEmail.roleId ? "Re-associate" : "Associate"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground">
              <div className="flex flex-col items-center gap-2">
                <Mail className="size-10 opacity-20" />
                <p className="text-sm">Select an email to view details</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Association dialog */}
      <Dialog open={!!associating} onOpenChange={(open) => !open && setAssociating(null)}>
        <DialogContent onClose={() => setAssociating(null)}>
          <DialogHeader>
            <DialogTitle>
              {associating?.roleId ? "Re-associate Email" : "Associate Email with Role"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <p className="font-medium">{associating?.subject}</p>
              <p className="mt-1 text-muted-foreground">{associating?.sender}</p>
              {associating?.roleId && (
                <p className="mt-2 text-xs text-amber-400">
                  ⚠️ Re-associating will trigger the full AI workflow for the new role.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="assoc-role-select" className="mb-1.5 block text-sm font-medium">
                Select Role
              </label>
              <Select value={assocRoleId} onValueChange={(val) => setAssocRoleId(val ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a role…" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.companyName} — {role.jobTitle}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleAssociate}
              disabled={!assocRoleId || assocLoading}
              className="w-full"
            >
              {assocLoading ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Link2 className="mr-2 size-4" />
              )}
              {associating?.roleId ? "Re-associate & Re-process" : "Associate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClassificationMeta sub-component
// ---------------------------------------------------------------------------

function ClassificationMeta({ classification }: { classification: EmailClassification }) {
  const intentMeta = INTENT_META[classification.intent] ?? INTENT_META.unknown;

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${intentMeta.color}`}
        >
          {intentMeta.icon}
          {intentMeta.label}
        </span>
        <span className="text-muted-foreground">
          Confidence: <strong>{(classification.confidence * 100).toFixed(0)}%</strong>
        </span>
        {classification.companyName && (
          <span className="text-muted-foreground">
            Company: <strong>{classification.companyName}</strong>
          </span>
        )}
        {classification.jobTitle && (
          <span className="text-muted-foreground">
            Role: <strong>{classification.jobTitle}</strong>
          </span>
        )}
        {classification.nextAction && classification.nextAction !== "none" && (
          <Badge variant="outline" className="text-xs gap-1">
            <Bot className="size-3" />
            {classification.nextAction.replace(/_/g, " ")}
          </Badge>
        )}
      </div>
      {classification.reasoning && (
        <p className="text-xs text-muted-foreground/80 italic">{classification.reasoning}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
