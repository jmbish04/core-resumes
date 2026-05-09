"use client";

import { ExternalLinkIcon } from "lucide-react";

interface Source {
  title: string;
  url: string;
  favicon?: string;
}

/**
 * Sources — displays reference citations in assistant messages.
 */
export function Sources({ sources }: { sources: Source[] }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-3 pt-2 border-t border-border/50">
      <span className="text-xs text-muted-foreground font-medium">Sources</span>
      <div className="flex flex-wrap gap-2 mt-1.5">
        {sources.map((source, i) => (
          <a
            key={i}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/50 hover:bg-muted text-xs transition-colors"
          >
            {source.favicon && <img src={source.favicon} alt="" className="size-3.5 rounded-sm" />}
            <span className="truncate max-w-[150px]">{source.title}</span>
            <ExternalLinkIcon className="size-3 text-muted-foreground flex-shrink-0" />
          </a>
        ))}
      </div>
    </div>
  );
}
