/**
 * @fileoverview PlateJS v53 rich-text editor for interview notes.
 *
 * Uses `platejs/react` for core components and `@platejs/basic-nodes/react`
 * for formatting plugins (bold, italic, underline, headings, blockquote, code).
 * Auto-saves via debounced PATCH to `/api/roles/:roleId/notes/:noteId`.
 */

import {
  BasicBlocksPlugin,
  BasicMarksPlugin,
  BoldPlugin,
  CodePlugin,
  ItalicPlugin,
  StrikethroughPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Strikethrough,
  Underline,
} from "lucide-react";
import { Plate, PlateContent, usePlateEditor } from "platejs/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiPatch, toast } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NoteEditorProps {
  roleId: string;
  noteId: string;
  initialTitle: string;
  initialContent: Record<string, unknown>[];
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NoteEditor({
  roleId,
  noteId,
  initialTitle,
  initialContent,
  onBack,
}: NoteEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestContentRef = useRef(initialContent);

  const editor = usePlateEditor({
    plugins: [BasicBlocksPlugin, BasicMarksPlugin],
    value:
      initialContent.length > 0
        ? (initialContent as any)
        : [{ type: "p", children: [{ text: "" }] }],
  });

  // Debounced auto-save
  const scheduleSave = useCallback(
    (newTitle: string, newContent: Record<string, unknown>[]) => {
      setSaveState("unsaved");
      if (pendingRef.current) {
        clearTimeout(pendingRef.current);
      }
      pendingRef.current = setTimeout(async () => {
        setSaveState("saving");
        try {
          await apiPatch(`/api/roles/${roleId}/notes/${noteId}`, {
            title: newTitle,
            content: newContent,
          });
          setSaveState("saved");
        } catch {
          setSaveState("unsaved");
        }
      }, 2000);
    },
    [roleId, noteId],
  );

  // Title change triggers save
  function handleTitleChange(newTitle: string) {
    setTitle(newTitle);
    scheduleSave(newTitle, latestContentRef.current);
  }

  // Content change triggers save
  function handleContentChange(value: Record<string, unknown>[]) {
    latestContentRef.current = value;
    scheduleSave(title, value);
  }

  // Cleanup pending save on unmount
  useEffect(() => {
    return () => {
      if (pendingRef.current) {
        clearTimeout(pendingRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Back
        </Button>
        <Input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="flex-1 border-none bg-transparent text-lg font-semibold focus-visible:ring-0"
          placeholder="Note title…"
        />
        <span className="shrink-0 text-xs text-muted-foreground">
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "✓ Saved" : "● Unsaved"}
        </span>
      </div>

      {/* Toolbar */}
      <Toolbar editor={editor} />

      {/* Editor */}
      <div className="min-h-[400px] rounded-md border border-border bg-card p-4">
        <Plate
          editor={editor}
          onValueChange={({ value }) => handleContentChange(value as Record<string, unknown>[])}
        >
          <PlateContent
            className="min-h-[360px] outline-none [&_h1]:mb-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-medium [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_hr]:my-4 [&_hr]:border-border [&_p]:mb-1"
            placeholder="Start typing your interview notes…"
          />
        </Plate>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

function Toolbar({ editor }: { editor: ReturnType<typeof usePlateEditor> }) {
  useEffect(() => {
    if (!editor) {
      toast({
        title: "Toolbar Error",
        description: "Plate editor instance is null.",
        variant: "destructive",
        codingPrompt:
          "Please fix the following frontend error in NoteEditor.tsx (Toolbar):\n\nPlate editor instance is null during initialization.",
      });
    }
  }, [editor]);

  if (!editor) return null;

  const toggleMark = (key: string) => {
    if (editor.api.isMarkActive(key)) {
      editor.tf.removeMark(key);
    } else {
      editor.tf.addMark(key, true);
    }
  };

  const toggleBlock = (type: string) => {
    const isActive = editor.api.some({
      match: { type },
    });

    editor.tf.setNodes(
      { type: isActive ? "p" : type },
      { match: (n: Record<string, unknown>) => editor.api.isBlock(n) },
    );
  };

  return (
    <div className="flex flex-wrap gap-1 rounded-md border border-border bg-muted/30 p-1">
      <ToolbarButton icon={Bold} label="Bold" onClick={() => toggleMark(BoldPlugin.key)} />
      <ToolbarButton icon={Italic} label="Italic" onClick={() => toggleMark(ItalicPlugin.key)} />
      <ToolbarButton
        icon={Underline}
        label="Underline"
        onClick={() => toggleMark(UnderlinePlugin.key)}
      />
      <ToolbarButton
        icon={Strikethrough}
        label="Strikethrough"
        onClick={() => toggleMark(StrikethroughPlugin.key)}
      />
      <ToolbarButton icon={Code} label="Code" onClick={() => toggleMark(CodePlugin.key)} />
      <div className="mx-1 w-px bg-border" />
      <ToolbarButton icon={Heading1} label="Heading 1" onClick={() => toggleBlock("h1")} />
      <ToolbarButton icon={Heading2} label="Heading 2" onClick={() => toggleBlock("h2")} />
      <ToolbarButton icon={Heading3} label="Heading 3" onClick={() => toggleBlock("h3")} />
    </div>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 w-7 p-0"
      onClick={onClick}
      title={label}
    >
      <Icon className="size-4" />
    </Button>
  );
}
