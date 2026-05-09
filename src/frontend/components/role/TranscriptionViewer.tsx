/**
 * @fileoverview Transcription Viewer — displays full transcription text
 * with a copy button for quick clipboard access.
 */

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

interface TranscriptionViewerProps {
  transcription: string;
  originalFilename: string;
}

export function TranscriptionViewer({ transcription, originalFilename }: TranscriptionViewerProps) {
  const [copied, setCopied] = useState(false);

  async function copyToClipboard() {
    await navigator.clipboard.writeText(transcription);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-md bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Transcription — {originalFilename}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-xs"
          onClick={() => void copyToClipboard()}
        >
          {copied ? (
            <>
              <Check className="size-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="size-3" />
              Copy
            </>
          )}
        </Button>
      </div>
      <div className="max-h-[300px] overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
        {transcription}
      </div>
    </div>
  );
}
