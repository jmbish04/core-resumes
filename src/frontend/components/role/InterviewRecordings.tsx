/**
 * @fileoverview Interview Recordings container — upload m4a audio,
 * list recordings with transcription status, view transcriptions,
 * merge into notes, and request AI feedback.
 */

import { useAgent } from "agents/react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CloudUpload,
  FileText,
  Loader2,
  MessageSquareText,
  Mic,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { TranscriptionState } from "@/ai/agents/transcription/types";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiDelete, apiGet, apiPost, toast } from "@/lib/api-client";

import type { InterviewNoteRow, InterviewRecordingRow } from "../dashboard/types";

import { TranscriptionViewer } from "./TranscriptionViewer";

const ACCEPTED_FORMATS = ".m4a,.mp4,.wav,.webm,.mp3,.ogg,.flac";

export function InterviewRecordings({ roleId }: { roleId: string }) {
  const [recordings, setRecordings] = useState<InterviewRecordingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<InterviewRecordingRow | null>(null);
  const [activeRecordingId, setActiveRecordingId] = useState<string | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // WebSocket connection to TranscriptionAgent for the active recording
  useAgent({
    agent: "TranscriptionAgent",
    name: activeRecordingId || "__none__",
    onStateUpdate: (state: TranscriptionState) => {
      if (!activeRecordingId) return;

      // Detect status transitions and fire toasts
      if (state.status !== prevStatusRef.current) {
        prevStatusRef.current = state.status;

        if (state.status === "complete") {
          toast({
            title: "Transcription complete",
            description: `Recording transcribed successfully (${state.fullText.length} chars).`,
          });
          setActiveRecordingId(null);
          void loadRecordings();
        } else if (state.status === "error") {
          toast({
            title: "Transcription failed",
            description: state.error || "The transcription job encountered an error.",
            variant: "destructive",
          });
          setActiveRecordingId(null);
          void loadRecordings();
        }
      }
    },
  });

  const loadRecordings = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiGet<InterviewRecordingRow[]>(
        `/api/roles/${encodeURIComponent(roleId)}/recordings`,
      );
      setRecordings(rows);
    } finally {
      setLoading(false);
    }
  }, [roleId]);

  useEffect(() => {
    void loadRecordings();
  }, [loadRecordings]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("audio", file);

      const result = await apiPost<{
        id: string;
        r2Key: string;
        jobId: string;
        transcriptionStatus: string;
      }>(`/api/roles/${encodeURIComponent(roleId)}/recordings`, form);

      toast({
        title: "Recording uploaded",
        description: "Upload complete. Transcription job started — live progress via WebSocket.",
      });

      // Refresh the list immediately to show the new pending recording
      await loadRecordings();

      // Connect to the Agent via WebSocket for live status updates
      if (result.transcriptionStatus === "pending") {
        prevStatusRef.current = "pending";
        setActiveRecordingId(result.id);
      }
    } catch {
      toast({
        title: "Upload failed",
        description: "Could not upload the recording. Try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      void handleUpload(file);
    }
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      void handleUpload(file);
    }
  }

  async function deleteRecording(recordingId: string) {
    await apiDelete(`/api/roles/${encodeURIComponent(roleId)}/recordings/${recordingId}`);
    setRecordings((prev) => prev.filter((r) => r.id !== recordingId));
    toast({ title: "Recording deleted" });
  }

  async function requestFeedback(recording: InterviewRecordingRow) {
    if (!recording.transcription) {
      return;
    }

    toast({
      title: "Requesting AI feedback…",
      description: "This will appear in the chat thread.",
    });

    await apiPost(`/api/roles/${encodeURIComponent(roleId)}/recordings/${recording.id}/feedback`, {
      transcription: recording.transcription,
    }).catch(() => {
      // If a dedicated feedback endpoint doesn't exist, enqueue via the chat
      // This is a soft-fail; the OrchestratorAgent task queue handles this
    });
  }

  return (
    <>
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>Interview Recordings</CardTitle>
          <CardDescription>
            Upload audio recordings from interviews. Files are stored in R2 and transcribed via
            Whisper AI.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {/* Upload zone */}
          <div
            ref={dropRef}
            className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 transition-colors ${
              uploading
                ? "border-amber-500/50 bg-amber-500/5"
                : "border-border hover:border-muted-foreground/40 hover:bg-muted/20"
            }`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            {uploading ? (
              <>
                <Loader2 className="size-8 animate-spin text-amber-400" />
                <p className="text-sm text-muted-foreground">Uploading & transcribing…</p>
              </>
            ) : (
              <>
                <CloudUpload className="size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Drag & drop an audio file here, or</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-4" />
                  Choose File
                </Button>
                <p className="text-xs text-muted-foreground/60">
                  Supported: m4a, mp4, wav, webm, mp3, ogg, flac
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_FORMATS}
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Recordings list */}
          {loading ? (
            <div className="grid gap-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-md bg-muted/50" />
              ))}
            </div>
          ) : recordings.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center">
              <Mic className="mx-auto mb-2 size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No recordings uploaded yet.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {recordings.map((rec) => (
                <RecordingCard
                  key={rec.id}
                  recording={rec}
                  isExpanded={expandedId === rec.id}
                  onToggle={() => setExpandedId((prev) => (prev === rec.id ? null : rec.id))}
                  onDelete={() => void deleteRecording(rec.id)}
                  onMerge={() => setMergeTarget(rec)}
                  onFeedback={() => void requestFeedback(rec)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Merge dialog */}
      {mergeTarget && (
        <MergeDialog
          roleId={roleId}
          recording={mergeTarget}
          onClose={() => setMergeTarget(null)}
          onMerged={() => {
            setMergeTarget(null);
            toast({ title: "Transcription merged into note" });
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Recording Card
// ---------------------------------------------------------------------------

function RecordingCard({
  recording,
  isExpanded,
  onToggle,
  onDelete,
  onMerge,
  onFeedback,
}: {
  recording: InterviewRecordingRow;
  isExpanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onMerge: () => void;
  onFeedback: () => void;
}) {
  const statusBadge = {
    pending: {
      className: "border-yellow-500/40 bg-yellow-500/10 text-yellow-400",
      label: "Pending",
    },
    processing: {
      className: "border-amber-500/40 bg-amber-500/10 text-amber-400",
      label: "Processing",
    },
    complete: {
      className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
      label: "Transcribed",
    },
    failed: { className: "border-red-500/40 bg-red-500/10 text-red-400", label: "Failed" },
  }[recording.transcriptionStatus];

  const StatusIcon =
    recording.transcriptionStatus === "complete"
      ? CheckCircle2
      : recording.transcriptionStatus === "failed"
        ? XCircle
        : Loader2;

  return (
    <div className="rounded-md border border-border/60 transition-colors hover:border-border">
      {/* Header row */}
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-3 text-left"
        onClick={onToggle}
      >
        <div className="flex min-w-0 items-center gap-3">
          <Mic className="size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{recording.originalFilename}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(recording.createdAt).toLocaleString()}
              {recording.durationSeconds
                ? ` · ${Math.floor(recording.durationSeconds / 60)}m ${recording.durationSeconds % 60}s`
                : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`gap-1 ${statusBadge.className}`}>
            <StatusIcon
              className={`size-3 ${recording.transcriptionStatus === "processing" ? "animate-spin" : ""}`}
            />
            {statusBadge.label}
          </Badge>
          {isExpanded ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border/60 p-3">
          {recording.transcription ? (
            <TranscriptionViewer
              transcription={recording.transcription}
              originalFilename={recording.originalFilename}
            />
          ) : recording.transcriptionStatus === "failed" ? (
            <p className="text-sm text-destructive">
              Transcription failed. Try re-uploading the recording.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Transcription is still processing…</p>
          )}

          {/* Action buttons */}
          <div className="mt-3 flex flex-wrap gap-2">
            {recording.transcription && (
              <>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={onMerge}>
                  <MessageSquareText className="size-4" />
                  Add to Notes
                </Button>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={onFeedback}>
                  <Sparkles className="size-4" />
                  Get AI Feedback
                </Button>
              </>
            )}
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1.5 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                }
              />
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete recording?</AlertDialogTitle>
                  <AlertDialogDescription>
                    "{recording.originalFilename}" and its transcription will be permanently
                    deleted.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Merge Dialog — select a note to merge transcription into
// ---------------------------------------------------------------------------

function MergeDialog({
  roleId,
  recording,
  onClose,
  onMerged,
}: {
  roleId: string;
  recording: InterviewRecordingRow;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [notes, setNotes] = useState<InterviewNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    apiGet<InterviewNoteRow[]>(`/api/roles/${encodeURIComponent(roleId)}/notes`)
      .then(setNotes)
      .finally(() => setLoading(false));
  }, [roleId]);

  async function mergeInto(noteId: string) {
    setMerging(true);
    try {
      await apiPost(`/api/roles/${encodeURIComponent(roleId)}/recordings/${recording.id}/merge`, {
        noteId,
      });
      onMerged();
    } finally {
      setMerging(false);
    }
  }

  async function createAndMerge() {
    setMerging(true);
    try {
      const note = await apiPost<InterviewNoteRow>(
        `/api/roles/${encodeURIComponent(roleId)}/notes`,
        { title: `Transcription — ${recording.originalFilename}` },
      );
      await apiPost(`/api/roles/${encodeURIComponent(roleId)}/recordings/${recording.id}/merge`, {
        noteId: note.id,
      });
      onMerged();
    } finally {
      setMerging(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md" onClose={onClose}>
        <DialogHeader>
          <DialogTitle>Add to Interview Notes</DialogTitle>
          <DialogDescription>
            Select an existing note or create a new one. The transcription will be appended as a new
            section.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-2">
          <Button
            variant="outline"
            className="justify-start gap-2"
            disabled={merging}
            onClick={() => void createAndMerge()}
          >
            <Plus className="size-4" />
            Create new note
          </Button>

          {loading ? (
            <div className="h-12 animate-pulse rounded-md bg-muted/50" />
          ) : (
            notes.map((note) => (
              <Button
                key={note.id}
                variant="ghost"
                className="justify-start gap-2"
                disabled={merging}
                onClick={() => void mergeInto(note.id)}
              >
                <FileText className="size-4" />
                {note.title}
              </Button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
