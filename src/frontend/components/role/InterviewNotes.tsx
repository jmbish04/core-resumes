/**
 * @fileoverview Interview Notes container — lists notes, creates new ones,
 * and opens the NoteEditor for editing.
 */

import { FileText, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

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
import { apiDelete, apiGet, apiPost } from "@/lib/api-client";

import type { InterviewNoteRow } from "../dashboard/types";

import { NoteEditor } from "./NoteEditor";

export function InterviewNotes({ roleId }: { roleId: string }) {
  const [notes, setNotes] = useState<InterviewNoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeNote, setActiveNote] = useState<InterviewNoteRow | null>(null);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await apiGet<InterviewNoteRow[]>(
        `/api/roles/${encodeURIComponent(roleId)}/notes`,
      );
      setNotes(rows);
    } finally {
      setLoading(false);
    }
  }, [roleId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  async function createNote() {
    const note = await apiPost<InterviewNoteRow>(`/api/roles/${encodeURIComponent(roleId)}/notes`, {
      title: `Note — ${new Date().toLocaleDateString()}`,
    });
    setNotes((prev) => [note, ...prev]);
    setActiveNote(note);
  }

  async function deleteNote(noteId: string) {
    await apiDelete(`/api/roles/${encodeURIComponent(roleId)}/notes/${noteId}`);
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    if (activeNote?.id === noteId) {
      setActiveNote(null);
    }
  }

  // Show editor when a note is active
  if (activeNote) {
    return (
      <NoteEditor
        roleId={roleId}
        noteId={activeNote.id}
        initialTitle={activeNote.title}
        initialContent={activeNote.content ?? []}
        onBack={() => {
          setActiveNote(null);
          void loadNotes(); // Refresh list to show updated timestamps
        }}
      />
    );
  }

  return (
    <Card className="rounded-lg">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Interview Notes</CardTitle>
          <CardDescription>Rich-text notes for interviews, prep, and follow-ups.</CardDescription>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => void createNote()}>
          <Plus className="size-4" />
          New Note
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid gap-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-md bg-muted/50" />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-8 text-center">
            <FileText className="mx-auto mb-3 size-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              No interview notes yet. Click <strong>New Note</strong> to start documenting.
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {notes.map((note) => (
              <div
                key={note.id}
                className="group flex items-center justify-between gap-3 rounded-md border border-border/60 p-3 transition-colors hover:bg-muted/30"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => setActiveNote(note)}
                >
                  <FileText className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{note.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Updated {new Date(note.updatedAt).toLocaleString()}</span>
                    </div>
                  </div>
                </button>
                <AlertDialog>
                  <AlertDialogTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    }
                  />
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete note?</AlertDialogTitle>
                      <AlertDialogDescription>
                        "{note.title}" will be permanently deleted. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void deleteNote(note.id)}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
