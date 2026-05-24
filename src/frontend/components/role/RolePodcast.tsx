/**
 * @fileoverview Role podcast status panel.
 *
 * Polls the role podcast API while the background Workflow is active, then
 * exposes streaming, download, Drive, and transcript actions as artifacts land.
 */

import { Download, ExternalLink, FileText, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet, apiPost } from "@/lib/api-client";

import { PodcastTranscript } from "./PodcastTranscript";
import { TranscriptionViewer } from "./TranscriptionViewer";

type RolePodcastRow = {
  id: string;
  roleId: string;
  status: string;
  notebooklmSourceId: string | null;
  notebooklmSourceFilename: string;
  notebooklmChatResponse: string | null;
  notebooklmArtifactId: string | null;
  r2AudioKey: string | null;
  driveAudioFileId: string | null;
  driveAudioUrl: string | null;
  driveTranscriptDocId: string | null;
  driveTranscriptUrl: string | null;
  transcriptionJobId: string | null;
  transcriptText: string | null;
  checkCount: number;
  lastCheckedAt: string | null;
  audioStreamUrl: string | null;
  audioDownloadUrl: string | null;
  stepErrors: Array<{ step: string; message: string; at: string }>;
};

/** Render NotebookLM podcast state and media controls for one role. */
export function RolePodcast({ roleId }: { roleId: string }) {
  const [podcast, setPodcast] = useState<RolePodcastRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showTimedTranscript, setShowTimedTranscript] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const row = await apiGet<RolePodcastRow | null>(
        `/api/roles/${encodeURIComponent(roleId)}/podcast`,
      );
      if (!cancelled) {
        setPodcast(row);
        setLoading(false);
      }
    }

    void load();
    const interval = window.setInterval(() => {
      if (!podcast || isTerminal(podcast.status)) return;
      void load();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [roleId, podcast]);

  const statusText = useMemo(() => describeStatus(podcast), [podcast]);

  if (loading) {
    return <div className="h-40 rounded-md bg-muted/50" />;
  }

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await apiPost(`/api/roles/${encodeURIComponent(roleId)}/podcast`);
      // The interval will pick up the new podcast state shortly.
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  if (!podcast) {
    return (
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle>NotebookLM Podcast</CardTitle>
          <CardDescription>No podcast pipeline has been started for this role yet.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? "Starting Pipeline..." : "Generate Podcast"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>NotebookLM Podcast</CardTitle>
            <CardDescription>{statusText}</CardDescription>
          </div>
          <Badge variant={podcast.status === "failed" ? "destructive" : "secondary"}>
            {podcast.status.replaceAll("_", " ")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2 rounded-md border border-border/60 p-3 text-sm">
          <Detail
            label="NotebookLM source"
            value={podcast.notebooklmSourceId ? podcast.notebooklmSourceFilename : "Pending"}
          />
          <Detail
            label="Podcast checks"
            value={`${podcast.checkCount}${podcast.lastCheckedAt ? ` (last ${new Date(podcast.lastCheckedAt).toLocaleTimeString()})` : ""}`}
          />
          <Detail
            label="Transcription"
            value={
              podcast.transcriptText
                ? "Complete"
                : podcast.transcriptionJobId
                  ? "Pending"
                  : "Waiting for audio"
            }
          />
        </div>

        {podcast.notebooklmChatResponse && (
          <p className="rounded-md bg-muted/30 p-3 text-sm text-muted-foreground">
            {podcast.notebooklmChatResponse}
          </p>
        )}

        {podcast.audioStreamUrl && (
          <div className="grid gap-3 rounded-md border border-border/60 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Play className="size-4" />
              Podcast audio
            </div>
            <audio controls className="w-full" src={podcast.audioStreamUrl} ref={audioRef}>
              <track kind="captions" />
            </audio>
            <div className="flex flex-wrap gap-2">
              {podcast.driveAudioUrl && (
                <a
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  href={podcast.driveAudioUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-4" />
                  Open audio in Drive
                </a>
              )}
              {podcast.audioDownloadUrl && (
                <a
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  href={podcast.audioDownloadUrl}
                >
                  <Download className="size-4" />
                  Download MP3
                </a>
              )}
            </div>
          </div>
        )}

        {(podcast.transcriptText || podcast.driveTranscriptUrl) && (
          <div className="flex flex-wrap gap-2">
            {podcast.transcriptText && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowTranscript((value) => !value)}
              >
                <FileText className="size-4" />
                {showTranscript ? "Hide transcript" : "View transcript"}
              </Button>
            )}
            {podcast.driveTranscriptUrl && (
              <a
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={podcast.driveTranscriptUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-4" />
                Open transcript in Drive
              </a>
            )}
          </div>
        )}

        {showTranscript && podcast.transcriptText && (
          <TranscriptionViewer
            transcription={podcast.transcriptText}
            originalFilename="NotebookLM podcast transcript"
          />
        )}

        {/* Timestamped transcript with playback sync */}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowTimedTranscript((v) => !v)}>
            <FileText className="size-4" />
            {showTimedTranscript ? "Hide timed transcript" : "View timed transcript"}
          </Button>
        </div>

        {showTimedTranscript && (
          <PodcastTranscript roleId={roleId} podcastId={podcast.id} audioRef={audioRef} />
        )}

        {podcast.stepErrors.length > 0 && (
          <div className="rounded-md border border-destructive/40 p-3 text-sm">
            <div className="font-medium text-destructive">Pipeline errors</div>
            <div className="mt-2 grid gap-1 text-muted-foreground">
              {podcast.stepErrors.map((error) => (
                <div key={`${error.step}-${error.at}`}>
                  {error.step}: {error.message}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Render one compact detail row. */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

/** Convert status into a user-facing progress sentence. */
function describeStatus(podcast: RolePodcastRow | null): string {
  if (!podcast) return "No podcast pipeline has started.";
  switch (podcast.status) {
    case "queued":
      return "Queued for background processing.";
    case "uploading_assets":
      return "Uploading role markdown, HTML, and PDF assets to Google Drive.";
    case "indexing_source":
      return "Uploading and indexing the role markdown in NotebookLM.";
    case "awaiting_artifact":
      return `Waiting for NotebookLM podcast audio (${podcast.checkCount} checks so far).`;
    case "downloading":
      return "Podcast found; downloading to R2 and Google Drive.";
    case "transcribing":
      return "Podcast audio is available; transcription is pending or running.";
    case "complete":
      return "Podcast audio and transcript are ready.";
    case "failed":
      return "The background podcast pipeline failed. See error details below.";
    default:
      return "Podcast pipeline status is updating.";
  }
}

/** Determine whether the status no longer needs frontend polling. */
function isTerminal(status: string): boolean {
  return status === "complete" || status === "failed";
}
