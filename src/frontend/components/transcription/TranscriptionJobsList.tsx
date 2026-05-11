/**
 * @fileoverview TranscriptionJobsList — React island for the /transcriptions
 * page showing all transcription jobs with real-time status for active jobs
 * via WebSocket (useAgent) and historical data from D1 for completed/failed.
 *
 * Active jobs (status: pending/chunking/transcribing) connect to the
 * TranscriptionAgent DO via WebSocket for instant progress updates.
 * Completed/failed jobs show historical data from the D1 API.
 */

import { useAgent } from "agents/react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { TranscriptionState } from "@/ai/agents/transcription/types";

import type { TranscriptionJobRow, TranscriptionChunkRow } from "../dashboard/types";

// ---------------------------------------------------------------------------
// Status badge colours
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  idle: "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
  pending: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  chunking: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  transcribing: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  complete: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  error: "bg-red-500/20 text-red-400 border-red-500/30",
};

const ACTIVE_STATUSES = new Set(["pending", "chunking", "transcribing"]);

// ---------------------------------------------------------------------------
// Live Agent Row — connects via WebSocket for real-time progress
// ---------------------------------------------------------------------------

function LiveJobRow({
  job,
  isExpanded,
  onToggle,
  formatDate,
}: {
  job: TranscriptionJobRow;
  isExpanded: boolean;
  onToggle: () => void;
  formatDate: (d: string | null) => string;
}) {
  const [liveState, setLiveState] = useState<TranscriptionState | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  // Connect to TranscriptionAgent DO for this recording
  useAgent({
    agent: "TranscriptionAgent",
    name: job.recordingId,
    onStateUpdate: (state: TranscriptionState) => {
      setLiveState(state);
    },
    onOpen: () => setWsConnected(true),
    onClose: () => setWsConnected(false),
  });

  // Merge live state with D1 row — live state takes precedence when connected
  const status = liveState?.status && liveState.status !== "idle" ? liveState.status : job.status;
  const phase = liveState?.phase || job.phase;
  const progress = liveState?.progress ?? job.progress;
  const completedChunks = liveState?.completedChunks ?? job.completedChunks;
  const totalChunks = liveState?.totalChunks ?? job.totalChunks;
  const fullText = liveState?.fullText || job.fullText;
  const error = liveState?.error || job.error;
  const logs = liveState?.logs ?? [];

  return (
    <>
      <tr
        className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="py-2.5 px-4 text-zinc-300 font-mono text-xs">
          <div className="flex items-center gap-2">
            {job.recordingFilename || job.r2Key.split("/").pop()}
            {wsConnected && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"
                title="Live WebSocket"
              />
            )}
          </div>
        </td>
        <td className="py-2.5 px-4">
          {job.companyName ? (
            <a
              href={`/roles/${job.roleId}`}
              className="text-emerald-400 hover:text-emerald-300 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {job.companyName} — {job.jobTitle}
            </a>
          ) : (
            <span className="text-zinc-500 text-xs">{job.roleId.slice(0, 8)}…</span>
          )}
        </td>
        <td className="py-2.5 px-4">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${STATUS_STYLES[status] || "bg-zinc-700 text-zinc-300"}`}
          >
            {status}
          </span>
          {phase && status !== "complete" && status !== "error" && (
            <span className="ml-2 text-xs text-zinc-500">{phase}</span>
          )}
        </td>
        <td className="py-2.5 px-4 w-32">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  status === "chunking"
                    ? "bg-blue-500"
                    : status === "transcribing"
                      ? "bg-purple-500"
                      : "bg-emerald-500"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-zinc-500 tabular-nums w-8 text-right">{progress}%</span>
          </div>
        </td>
        <td className="py-2.5 px-4 text-zinc-400 text-xs tabular-nums">
          {completedChunks}/{totalChunks ?? "?"}
        </td>
        <td className="py-2.5 px-4 text-zinc-500 text-xs">{formatDate(job.createdAt)}</td>
        <td className="py-2.5 px-4 text-zinc-600 text-xs">{isExpanded ? "▲" : "▼"}</td>
      </tr>

      {/* Expanded live log + progress detail */}
      {isExpanded && (
        <tr>
          <td colSpan={7} className="p-0">
            <div className="bg-zinc-900/80 border-b border-zinc-800 px-6 py-4 space-y-4">
              {/* Live logs */}
              {logs.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                    Live Agent Logs
                  </h4>
                  <div className="bg-zinc-950 rounded-md border border-zinc-800 p-3 max-h-48 overflow-y-auto font-mono text-xs text-zinc-400 space-y-0.5">
                    {logs.map((log, i) => (
                      <div key={i} className="leading-relaxed">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full text preview */}
              {fullText && (
                <details>
                  <summary className="text-xs text-zinc-400 cursor-pointer hover:text-zinc-300">
                    View full transcription ({fullText.length} characters)
                  </summary>
                  <div className="mt-2 p-3 rounded-md bg-zinc-800/80 border border-zinc-700/50 text-sm text-zinc-300 whitespace-pre-wrap max-h-64 overflow-y-auto">
                    {fullText}
                  </div>
                </details>
              )}

              {/* Error display */}
              {error && (
                <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-sm text-red-400">
                  ❌ {error}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Static Job Row — for completed/failed jobs (no WebSocket needed)
// ---------------------------------------------------------------------------

function StaticJobRow({
  job,
  isExpanded,
  onToggle,
  formatDate,
}: {
  job: TranscriptionJobRow;
  isExpanded: boolean;
  onToggle: () => void;
  formatDate: (d: string | null) => string;
}) {
  const [chunks, setChunks] = useState<TranscriptionChunkRow[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const chunksLoaded = useRef(false);

  useEffect(() => {
    if (isExpanded && !chunksLoaded.current) {
      chunksLoaded.current = true;
      setChunksLoading(true);
      fetch(`/api/transcription-jobs/${job.id}/chunks`)
        .then((res) => res.json() as Promise<{ chunks: TranscriptionChunkRow[] }>)
        .then((data) => setChunks(data.chunks))
        .catch(() => setChunks([]))
        .finally(() => setChunksLoading(false));
    }
  }, [isExpanded, job.id]);

  return (
    <>
      <tr
        className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="py-2.5 px-4 text-zinc-300 font-mono text-xs">
          {job.recordingFilename || job.r2Key.split("/").pop()}
        </td>
        <td className="py-2.5 px-4">
          {job.companyName ? (
            <a
              href={`/roles/${job.roleId}`}
              className="text-emerald-400 hover:text-emerald-300 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {job.companyName} — {job.jobTitle}
            </a>
          ) : (
            <span className="text-zinc-500 text-xs">{job.roleId.slice(0, 8)}…</span>
          )}
        </td>
        <td className="py-2.5 px-4">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${STATUS_STYLES[job.status] || "bg-zinc-700 text-zinc-300"}`}
          >
            {job.status}
          </span>
        </td>
        <td className="py-2.5 px-4 w-32">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${job.progress}%` }}
              />
            </div>
            <span className="text-xs text-zinc-500 tabular-nums w-8 text-right">
              {job.progress}%
            </span>
          </div>
        </td>
        <td className="py-2.5 px-4 text-zinc-400 text-xs tabular-nums">
          {job.completedChunks}/{job.totalChunks ?? "?"}
        </td>
        <td className="py-2.5 px-4 text-zinc-500 text-xs">{formatDate(job.createdAt)}</td>
        <td className="py-2.5 px-4 text-zinc-600 text-xs">{isExpanded ? "▲" : "▼"}</td>
      </tr>

      {/* Expanded chunk detail */}
      {isExpanded && (
        <tr>
          <td colSpan={7} className="p-0">
            <div className="bg-zinc-900/80 border-b border-zinc-800 px-6 py-4">
              {chunksLoading ? (
                <div className="flex items-center gap-2 text-zinc-400 text-sm">
                  <div className="animate-spin h-4 w-4 border-2 border-zinc-500 border-t-transparent rounded-full" />
                  Loading chunks…
                </div>
              ) : chunks.length === 0 ? (
                <p className="text-zinc-500 text-sm">No chunks recorded.</p>
              ) : (
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
                    Chunk Details ({chunks.length} chunks)
                  </h4>
                  <div className="grid gap-2">
                    {chunks.map((chunk) => (
                      <div
                        key={chunk.id}
                        className="flex items-start gap-3 rounded-md bg-zinc-800/50 border border-zinc-700/50 p-3"
                      >
                        <span className="text-xs font-mono text-zinc-500 min-w-[2rem] tabular-nums">
                          #{chunk.chunkIndex}
                        </span>
                        <span
                          className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium border ${STATUS_STYLES[chunk.status] || ""}`}
                        >
                          {chunk.status}
                        </span>
                        <span className="text-xs text-zinc-500 font-mono">
                          {chunk.r2Key.split("/").pop()}
                        </span>
                        {chunk.transcription && (
                          <p className="text-xs text-zinc-300 flex-1 line-clamp-2">
                            {chunk.transcription}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Full text preview */}
                  {job.fullText && (
                    <details className="mt-4">
                      <summary className="text-xs text-zinc-400 cursor-pointer hover:text-zinc-300">
                        View full transcription ({job.fullText.length} characters)
                      </summary>
                      <div className="mt-2 p-3 rounded-md bg-zinc-800/80 border border-zinc-700/50 text-sm text-zinc-300 whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {job.fullText}
                      </div>
                    </details>
                  )}

                  {/* Error display */}
                  {job.error && (
                    <div className="mt-3 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-sm text-red-400">
                      ❌ {job.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function TranscriptionJobsList() {
  const [jobs, setJobs] = useState<TranscriptionJobRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/transcription-jobs");
      if (!res.ok) throw new Error(`Failed to fetch jobs: ${res.status}`);
      const data = (await res.json()) as { jobs: TranscriptionJobRow[] };
      setJobs(data.jobs);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + slow poll for new jobs (WebSocket handles active progress)
  useEffect(() => {
    fetchJobs();
    // Slow poll for new jobs only — active job progress comes via WebSocket
    const interval = setInterval(fetchJobs, 30_000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin h-6 w-6 border-2 border-emerald-500 border-t-transparent rounded-full" />
        <span className="ml-3 text-zinc-400">Loading transcription jobs…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
        <p className="text-red-400 text-sm">Error: {error}</p>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <div className="text-4xl mb-4">🎤</div>
        <h3 className="text-lg font-medium text-zinc-300">No transcription jobs yet</h3>
        <p className="text-sm text-zinc-500 mt-2">
          Upload an audio recording from a role page to start a transcription job.
        </p>
      </div>
    );
  }

  const activeJobs = jobs.filter((j) => ACTIVE_STATUSES.has(j.status));
  const completedJobs = jobs.filter((j) => !ACTIVE_STATUSES.has(j.status));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-200">
          Transcription Jobs
          <span className="ml-2 text-sm font-normal text-zinc-500">({jobs.length})</span>
          {activeJobs.length > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-blue-400">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              {activeJobs.length} active
            </span>
          )}
        </h2>
        <button
          onClick={fetchJobs}
          className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors px-3 py-1.5 rounded-md border border-zinc-700 hover:border-zinc-600"
        >
          ↻ Refresh
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50">
              <th className="text-left py-2.5 px-4 text-zinc-400 font-medium">Recording</th>
              <th className="text-left py-2.5 px-4 text-zinc-400 font-medium">Role</th>
              <th className="text-left py-2.5 px-4 text-zinc-400 font-medium">Status</th>
              <th className="text-left py-2.5 px-4 text-zinc-400 font-medium">Progress</th>
              <th className="text-left py-2.5 px-4 text-zinc-400 font-medium">Chunks</th>
              <th className="text-left py-2.5 px-4 text-zinc-400 font-medium">Created</th>
              <th className="text-left py-2.5 px-4 text-zinc-400 font-medium" />
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const isActive = ACTIVE_STATUSES.has(job.status);
              const RowComponent = isActive ? LiveJobRow : StaticJobRow;
              return (
                <RowComponent
                  key={job.id}
                  job={job}
                  isExpanded={expandedJobId === job.id}
                  onToggle={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                  formatDate={formatDate}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
