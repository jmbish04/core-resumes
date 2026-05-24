import { Settings, StickyNote } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQueryParam } from "@/hooks/use-query-param";
import { apiGet } from "@/lib/api-client";

import type { EmailRow, RoleRow } from "../dashboard/types";

import { AssistantModal } from "../assistant-ui/assistant-modal";
import { EmailInbox } from "../email/EmailInbox";
import { AlignmentBreakdown } from "./AlignmentBreakdown";
import { ATSScoreDashboard } from "./ATSScoreDashboard";
import { CombinedValueScore } from "./CombinedValueScore";
import { CompensationAnalysis } from "./CompensationAnalysis";
import { DocumentsList } from "./DocumentsList";
import { HireabilityHeader } from "./HireabilityHeader";
import { InterviewNotes } from "./InterviewNotes";
import { InterviewRecordings } from "./InterviewRecordings";
import { LocationAnalysis } from "./LocationAnalysis";
import { MockInterview } from "./MockInterview";
import { NotebookLMTab } from "./NotebookLMTab";
import { RoleBullets } from "./RoleBullets";
import { RoleChatProvider } from "./RoleChatProvider";
import { RoleConfig } from "./RoleConfig";
import { RoleErrors, type ProcessingError } from "./RoleErrors";
import { RoleProcessingStatus } from "./RoleProcessingStatus";
import { RoleStatusLog } from "./RoleStatusLog";

// ---------------------------------------------------------------------------
// RoleViewport
// ---------------------------------------------------------------------------

export function RoleViewport({ role }: { role: RoleRow & { roleInstructions?: string | null } }) {
  // Extract processing errors from metadata
  const processingErrors: ProcessingError[] =
    role.metadata &&
    typeof role.metadata === "object" &&
    Array.isArray((role.metadata as Record<string, unknown>).processingErrors)
      ? ((role.metadata as Record<string, unknown>).processingErrors as ProcessingError[])
      : [];

  const hasErrors = processingErrors.length > 0;
  const defaultTab = hasErrors ? "errors" : "status";
  const [tab, setTab] = useQueryParam("tab", defaultTab);

  // Email counts
  const [emailCount, setEmailCount] = useState(0);
  const [noteCount, setNoteCount] = useState(0);

  // Dialog states
  const [notesOpen, setNotesOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  useEffect(() => {
    // Fetch email count
    apiGet<EmailRow[]>(`/api/emails?roleId=${encodeURIComponent(role.id)}`)
      .then((rows) => setEmailCount(rows.length))
      .catch(() => {});

    // Fetch note count
    apiGet<unknown[]>(`/api/roles/${encodeURIComponent(role.id)}/notes`)
      .then((rows) => setNoteCount(rows.length))
      .catch(() => {});
  }, [role.id]);

  return (
    <RoleChatProvider roleId={role.id}>
      <div className="min-h-[600px] min-w-0">
        <div className="h-full overflow-auto">
          {/* Header buttons row */}
          <div className="mb-3 flex items-center gap-2">
            {/* Notes */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setNotesOpen(true)}
            >
              <StickyNote className="size-3.5" />
              Notes
              {noteCount > 0 && (
                <Badge variant="secondary" className="ml-1 px-1.5 text-[10px]">
                  {noteCount}
                </Badge>
              )}
            </Button>
            <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
              <DialogContent
                className="max-h-[80vh] max-w-3xl overflow-auto"
                onClose={() => setNotesOpen(false)}
              >
                <DialogHeader>
                  <DialogTitle>Notes & Recordings</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4">
                  <InterviewNotes roleId={role.id} />
                  <InterviewRecordings roleId={role.id} />
                </div>
              </DialogContent>
            </Dialog>

            {/* Config */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setConfigOpen(true)}
            >
              <Settings className="size-3.5" />
              Config
            </Button>
            <Dialog open={configOpen} onOpenChange={setConfigOpen}>
              <DialogContent
                className="max-h-[80vh] max-w-2xl overflow-auto"
                onClose={() => setConfigOpen(false)}
              >
                <DialogHeader>
                  <DialogTitle>Role Configuration</DialogTitle>
                </DialogHeader>
                <RoleConfig role={role} />
              </DialogContent>
            </Dialog>
          </div>

          {/* Tab bar */}
          <Tabs value={tab} onValueChange={setTab} className="min-w-0">
            <TabsList className="w-full justify-start overflow-auto">
              {hasErrors && (
                <TabsTrigger
                  value="errors"
                  className="gap-1.5 text-destructive data-[state=active]:text-destructive"
                >
                  ⚠ Errors ({processingErrors.length})
                </TabsTrigger>
              )}
              <TabsTrigger value="status">Status</TabsTrigger>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="analysis">Analysis</TabsTrigger>
              <TabsTrigger value="interview">Mock Interview</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="notebooklm">NotebookLM</TabsTrigger>
              <TabsTrigger value="emails" className="gap-1">
                Emails
                {emailCount > 0 && (
                  <Badge variant="default" className="ml-1 px-1.5 text-[10px]">
                    {emailCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
            </TabsList>

            {/* Errors */}
            {hasErrors && (
              <TabsContent value="errors">
                <RoleErrors roleId={role.id} errors={processingErrors} />
              </TabsContent>
            )}

            {/* Status */}
            <TabsContent value="status">
              <RoleProcessingStatus roleId={role.id} />
            </TabsContent>

            {/* Timeline */}
            <TabsContent value="timeline">
              <RoleStatusLog roleId={role.id} />
            </TabsContent>

            {/* Overview */}
            <TabsContent value="overview">
              <div className="mt-4">
                <RoleBullets roleId={role.id} />
              </div>
              <div className="mt-4">
                <Overview role={role} />
              </div>
            </TabsContent>

            {/* Analysis */}
            <TabsContent value="analysis">
              <ATSScoreDashboard roleId={role.id} />
              <div className="mt-4">
                <HireabilityHeader roleId={role.id} />
              </div>
              <div className="mt-4 grid grid-cols-1 gap-4">
                <LocationAnalysis roleId={role.id} />
                <CompensationAnalysis roleId={role.id} />
                <CombinedValueScore roleId={role.id} />
              </div>
              <div className="mt-4">
                <AlignmentBreakdown roleId={role.id} />
              </div>
            </TabsContent>

            {/* Mock Interview */}
            <TabsContent value="interview">
              <MockInterview roleId={role.id} />
            </TabsContent>

            {/* Documents */}
            <TabsContent value="documents">
              <DocumentsList roleId={role.id} />
            </TabsContent>

            {/* Emails */}
            <TabsContent value="emails">
              <EmailInbox filter={{ roleId: role.id }} maxHeight="500px" showForwardBanner />
            </TabsContent>

            {/* NotebookLM (unified — includes Podcast + Blobs) */}
            <TabsContent value="notebooklm">
              <NotebookLMTab roleId={role.id} />
            </TabsContent>
          </Tabs>
        </div>
        <AssistantModal />
      </div>
    </RoleChatProvider>
  );
}

// ---------------------------------------------------------------------------
// Overview sub-component
// ---------------------------------------------------------------------------

function Overview({ role }: { role: RoleRow & { roleInstructions?: string | null } }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Role Details</CardTitle>
          <CardDescription>Saved metadata for this opportunity.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <Detail label="Company" value={role.companyName} />
          <Detail label="Title" value={role.jobTitle} />
          <Detail label="Status" value={role.status} />
          <Detail label="Created" value={new Date(role.createdAt).toLocaleString()} />
        </CardContent>
      </Card>
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Instructions</CardTitle>
          <CardDescription>Role-specific Colby guidance.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {role.roleInstructions || "No role-specific instructions have been saved."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail helper
// ---------------------------------------------------------------------------

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium" suppressHydrationWarning>
        {value}
      </span>
    </div>
  );
}
