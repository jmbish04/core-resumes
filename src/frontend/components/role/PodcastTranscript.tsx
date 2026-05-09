/**
 * @fileoverview Timestamped podcast transcript viewer with playback sync.
 *
 * Displays speaker-attributed transcript lines ordered by lineOrder.
 * When an audio element ref is provided, clicking a transcript line seeks
 * the audio to that line's start time, and the currently-speaking line
 * is highlighted during playback.
 */

import { Loader2, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/api-client";

type TranscriptLine = {
  id: number;
  roleId: string;
  podcastId: string | null;
  lineOrder: number;
  speakerName: string;
  speakerUsecStart: number | null;
  speakerUsecStop: number | null;
  speakerMessage: string;
  createdAt: string | null;
};

type PodcastTranscriptProps = {
  roleId: string;
  podcastId?: string;
  /** Ref to the <audio> element for playback sync. */
  audioRef?: React.RefObject<HTMLAudioElement | null>;
};

export function PodcastTranscript({
  roleId,
  podcastId,
  audioRef,
}: PodcastTranscriptProps) {
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeLine, setActiveLine] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const params = podcastId ? `?podcastId=${encodeURIComponent(podcastId)}` : "";
        const data = await apiGet<TranscriptLine[]>(
          `/api/roles/${encodeURIComponent(roleId)}/notebooklm/transcript${params}`,
        );
        setLines(data);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [roleId, podcastId]);

  // Playback sync: highlight current line based on audio currentTime
  useEffect(() => {
    const audio = audioRef?.current;
    if (!audio || lines.length === 0) return;

    const handleTimeUpdate = () => {
      // Convert seconds to microseconds for comparison
      const currentUsec = audio.currentTime * 1_000_000;
      let foundIndex = -1;

      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (
          line.speakerUsecStart !== null &&
          currentUsec >= line.speakerUsecStart
        ) {
          foundIndex = i;
          break;
        }
      }

      if (foundIndex !== activeLine) {
        setActiveLine(foundIndex);
      }
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    return () => audio.removeEventListener("timeupdate", handleTimeUpdate);
  }, [audioRef, lines, activeLine]);

  // Auto-scroll to active line
  useEffect(() => {
    if (activeLine >= 0 && containerRef.current) {
      const lineEl = containerRef.current.querySelector(
        `[data-line="${activeLine}"]`,
      );
      lineEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeLine]);

  const handleLineClick = useCallback(
    (line: TranscriptLine) => {
      const audio = audioRef?.current;
      if (!audio || line.speakerUsecStart === null) return;
      audio.currentTime = line.speakerUsecStart / 1_000_000;
      audio.play().catch(() => {});
    },
    [audioRef],
  );

  if (loading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="rounded-md border border-border/60 p-4 text-center text-sm text-muted-foreground">
        No timestamped transcript available. The podcast may still be processing.
      </div>
    );
  }

  // Group consecutive lines by speaker for cleaner visual layout
  const groups = groupBySpeaker(lines);

  return (
    <div
      ref={containerRef}
      className="max-h-[500px] overflow-y-auto rounded-md border border-border/60"
    >
      <div className="divide-y divide-border/40">
        {groups.map((group, gi) => (
          <div key={gi} className="p-3">
            <div className="mb-1.5 flex items-center gap-2">
              <div
                className={`flex size-6 items-center justify-center rounded-full text-[10px] font-bold ${
                  group.speaker.toLowerCase().includes("host")
                    ? "bg-primary/20 text-primary"
                    : "bg-accent text-accent-foreground"
                }`}
              >
                {group.speaker.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-semibold text-foreground">
                {group.speaker}
              </span>
              {group.lines[0]?.speakerUsecStart !== null && (
                <span className="text-[10px] text-muted-foreground">
                  {formatTime(group.lines[0].speakerUsecStart!)}
                </span>
              )}
            </div>
            {group.lines.map((line, li) => (
              <p
                key={line.id}
                data-line={lines.indexOf(line)}
                className={`cursor-pointer rounded px-2 py-0.5 text-sm leading-relaxed transition-colors ${
                  lines.indexOf(line) === activeLine
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
                onClick={() => handleLineClick(line)}
              >
                {line.speakerMessage}
              </p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Group consecutive transcript lines by speaker name. */
function groupBySpeaker(lines: TranscriptLine[]) {
  const groups: { speaker: string; lines: TranscriptLine[] }[] = [];
  for (const line of lines) {
    const last = groups[groups.length - 1];
    if (last && last.speaker === line.speakerName) {
      last.lines.push(line);
    } else {
      groups.push({ speaker: line.speakerName, lines: [line] });
    }
  }
  return groups;
}

/** Format microseconds into mm:ss. */
function formatTime(usec: number): string {
  const totalSeconds = Math.floor(usec / 1_000_000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
