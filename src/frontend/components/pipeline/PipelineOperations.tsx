import { useAgent } from "agents/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiGet, apiPost, toast } from "@/lib/api-client";
import { PipelineRunList, type SyncRunSummary } from "./PipelineRunList";
import { PipelineRunViewport, type SyncRunEvent } from "./PipelineRunViewport";
import type { WorkflowStep } from "./PipelineStepper";

// ---------------------------------------------------------------------------
// Fallback step definitions for live sync
// ---------------------------------------------------------------------------

const FALLBACK_STEPS: WorkflowStep[] = [
  { step: 1, title: "Dispatch Sync Workflow", status: "idle", logs: [] },
  { step: 2, title: "Load Upstream Repositories", status: "idle", logs: [] },
  { step: 3, title: "Scrape and Extract Metadata", status: "idle", logs: [] },
  { step: 4, title: "Update Local Databases", status: "idle", logs: [] },
  { step: 5, title: "Finalize & Broadcast Stats", status: "idle", logs: [] },
];

// ---------------------------------------------------------------------------
// Status → Step mapping (mirrors backend statusToStepNumber)
// ---------------------------------------------------------------------------

function statusToStep(status: string): number | null {
  switch (status) {
    case "dispatching":
    case "trigger-sync":
      return 1;
    case "initializing":
    case "fetching_upstream":
    case "fetching":
    case "loading_sources":
      return 2;
    case "scraping":
    case "parsing":
    case "processing":
    case "mapping":
      return 3;
    case "saving_db":
    case "ingesting":
    case "writing_d1":
    case "updating_database":
      return 4;
    case "completed":
    case "success":
    case "failed":
    case "error":
    case "salary_sync":
    case "salary_sync_complete":
    case "salary_sync_failed":
      return 5;
    default:
      return null;
  }
}

/** Statuses that signal the sync run is terminally done. */
function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "success" || status === "failed" || status === "error";
}

// ---------------------------------------------------------------------------
// Live sync state: idle → active → completed | failed
// ---------------------------------------------------------------------------

type LiveSyncPhase = "idle" | "active" | "completed" | "failed";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PipelineOperations() {
  // State: run list
  const [historyRuns, setHistoryRuns] = useState<SyncRunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // State: live sync lifecycle
  const [livePhase, setLivePhase] = useState<LiveSyncPhase>("idle");

  // State: view mode
  const [viewMode, setViewMode] = useState<"list" | "viewport">("list");
  const [selectedRun, setSelectedRun] = useState<SyncRunSummary | null>(null);

  // State: live sync stepper + events
  const [liveSteps, setLiveSteps] = useState<WorkflowStep[]>([]);
  const [liveEvents, setLiveEvents] = useState<SyncRunEvent[]>([]);

  // -----------------------------------------------------------------------
  // Refs that mirror state — the `useAgent` onMessage callback is captured
  // once at hook initialization. Without refs, `viewMode` and `livePhase`
  // inside the callback would be permanently stale (always "list" / "idle"),
  // causing every WS message to wipe events and force-switch to viewport.
  // -----------------------------------------------------------------------
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  const livePhaseRef = useRef(livePhase);
  livePhaseRef.current = livePhase;

  // Refs for deduplication — prevents multiple toasts and state thrash
  const completionHandledRef = useRef(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutSecs = 90000;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Derived booleans for child components
  const isSyncing = livePhase === "active";
  const isLiveViewport = (livePhase === "active" || livePhase === "completed" || livePhase === "failed") && !selectedRun;

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchRuns = useCallback(async () => {
    try {
      const res = await apiGet<{ stats: SyncRunSummary[] }>(
        "/api/pipeline/api-companies/sync-stats"
      );
      if (res?.stats) setHistoryRuns(res.stats);
    } catch (e) {
      console.error("Failed to load sync stats:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  // -------------------------------------------------------------------------
  // WebSocket: real-time progress from SyncBroadcastAgent
  //
  // CRITICAL: All state reads inside onMessage MUST use refs (viewModeRef,
  // livePhaseRef) because useAgent captures the callback at initialization.
  // State setters (setX) are stable and safe to call directly.
  // -------------------------------------------------------------------------

  const agent = useAgent({
    agent: "SyncBroadcastAgent",
    name: "global",
    onMessage: (event: any) => {
      try {
        const message = JSON.parse(event.data) as any;
        if (message?.type !== "sync_progress") return;

        const payload = message.payload;
        const status: string = payload.status;
        const msgText: string = payload.message || status;

        // Guard 1: Discard duplicate terminal messages
        if (completionHandledRef.current && isTerminalStatus(status)) {
          return;
        }

        // Guard 2: Auto-switch to viewport ONLY from the list view.
        // Read from ref to get the CURRENT value, not the stale closure.
        if (viewModeRef.current === "list") {
          setLivePhase("active");
          setViewMode("viewport");
          setSelectedRun(null);
          setLiveEvents([]);
          completionHandledRef.current = false;
        }

        // If on viewport but in idle phase, activate
        if (livePhaseRef.current === "idle" && !isTerminalStatus(status)) {
          setLivePhase("active");
          completionHandledRef.current = false;
        }

        // Clear stall timeout on meaningful progress
        if (status !== "dispatching" && status !== "trigger-sync") {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        }

        // Accumulate live event
        const newEvent: SyncRunEvent = {
          id: Date.now(),
          syncStatsId: null,
          eventType: "progress",
          stepNumber: statusToStep(status),
          status,
          message: msgText,
          current: payload.current ?? null,
          total: payload.total ?? null,
          metadata: null,
          createdAt: new Date().toISOString(),
        };
        setLiveEvents((prev) => [...prev, newEvent]);

        // Update stepper
        setLiveSteps((prevSteps) => {
          const nextSteps = prevSteps.length > 0
            ? [...prevSteps].map((s) => ({ ...s, logs: [...s.logs] }))
            : FALLBACK_STEPS.map((s) => ({ ...s, logs: [...s.logs] }));

          const completeUpTo = (stepNum: number) => {
            for (let i = 0; i < stepNum - 1; i++) {
              if (nextSteps[i].status !== "completed") {
                nextSteps[i].status = "completed";
                if (nextSteps[i].logs.length === 0) {
                  nextSteps[i].logs.push("Phase finished successfully.");
                }
              }
            }
          };

          const appendLog = (stepIdx: number, text: string) => {
            if (text && !nextSteps[stepIdx].logs.includes(text)) {
              nextSteps[stepIdx].logs.push(text);
            }
          };

          const stepNum = statusToStep(status);

          if (status === "dispatching" || status === "trigger-sync") {
            nextSteps[0].status = "active";
            if (msgText) appendLog(0, msgText);
          } else if (status === "completed" || status === "success") {
            for (let i = 0; i < 5; i++) {
              nextSteps[i].status = "completed";
              if (nextSteps[i].logs.length === 0) nextSteps[i].logs.push("Phase finished successfully.");
            }
            appendLog(4, "Upstream repository synchronization completed successfully.");

            completionHandledRef.current = true;
            setLivePhase("completed");
            toast({ title: "GitHub Sync Completed" });
            fetchRuns();
          } else if (status === "failed" || status === "error") {
            let activeIdx = nextSteps.findIndex((s) => s.status === "active");
            if (activeIdx === -1) activeIdx = 2;
            nextSteps[activeIdx].status = "failed";
            appendLog(activeIdx, `CRITICAL ERROR: ${msgText || "Sync execution failure."}`);
            for (let i = activeIdx + 1; i < nextSteps.length; i++) nextSteps[i].status = "idle";

            completionHandledRef.current = true;
            setLivePhase("failed");
            toast({ title: "GitHub Sync Failed", variant: "destructive" });
            fetchRuns();
          } else if (stepNum !== null && stepNum >= 1 && stepNum <= 5) {
            completeUpTo(stepNum);
            nextSteps[stepNum - 1].status = "active";
            if (msgText) appendLog(stepNum - 1, msgText);
          }

          return nextSteps;
        });
      } catch (err) {
        console.warn("[PipelineOperations] WS error:", err);
      }
    },
  });

  const wsReadyState = typeof WebSocket !== "undefined" ? agent.readyState : 3;

  // -------------------------------------------------------------------------
  // Trigger sync
  // -------------------------------------------------------------------------

  const triggerSync = async () => {
    try {
      completionHandledRef.current = false;
      setLivePhase("active");
      setViewMode("viewport");
      setSelectedRun(null);
      setLiveEvents([]);

      const initialSteps = FALLBACK_STEPS.map((s, i) =>
        i === 0
          ? { ...s, status: "active" as const, logs: ["Dispatching repository sync workflow to GitHub Action..."] }
          : { ...s, logs: [] }
      );
      setLiveSteps(initialSteps);

      const res: any = await apiPost("/api/pipeline/api-companies/trigger-sync", {});
      if (!res.success) throw new Error(res.error || "Trigger failed.");

      setLiveSteps((prev) => {
        const next = [...prev].map((s) => ({ ...s, logs: [...s.logs] }));
        next[0].logs.push("GitHub dispatch successfully triggered.");
        next[0].logs.push("Waiting for remote action runner callback...");
        return next;
      });

      // Start stall timeout
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setLiveSteps((prevSteps) => {
          if (prevSteps.length === 0 || prevSteps[0].status !== "active") return prevSteps;
          const nextSteps = [...prevSteps].map((s) => ({ ...s, logs: [...s.logs] }));
          nextSteps[0].status = "failed";
          nextSteps[0].logs.push(`CRITICAL ERROR: Remote Action connection timeout after ${timeoutSecs / 1000} seconds.`);
          completionHandledRef.current = true;
          setLivePhase("failed");
          toast({ title: "Sync Connection Timeout", variant: "destructive" });
          return nextSteps;
        });
      }, timeoutSecs);

      toast({ title: "Sync triggered!", description: "Viewing live logs..." });
    } catch (e: any) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      completionHandledRef.current = true;
      setLivePhase("failed");
      setLiveSteps((prev) => {
        const next = [...prev].map((s) => ({ ...s, logs: [...s.logs] }));
        if (next[0]) {
          next[0].status = "failed";
          next[0].logs.push(`CRITICAL ERROR: ${e.message || "Trigger error"}`);
        }
        return next;
      });
      toast({ title: "Failed to trigger sync", variant: "destructive" });
    }
  };

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  const handleSelectRun = (run: SyncRunSummary) => {
    setSelectedRun(run);
    setViewMode("viewport");
  };

  const handleBack = () => {
    setViewMode("list");
    setSelectedRun(null);
    // Reset live state when user explicitly navigates back
    if (livePhaseRef.current === "completed" || livePhaseRef.current === "failed") {
      setLivePhase("idle");
      completionHandledRef.current = false;
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (viewMode === "viewport") {
    return (
      <PipelineRunViewport
        selectedRun={selectedRun}
        isLive={livePhase === "active" && !selectedRun}
        showLiveData={isLiveViewport}
        liveSteps={liveSteps}
        liveEvents={liveEvents}
        onBack={handleBack}
      />
    );
  }

  return (
    <PipelineRunList
      runs={historyRuns}
      loading={loading}
      syncing={isSyncing}
      wsReadyState={wsReadyState}
      onSelectRun={handleSelectRun}
      onTriggerSync={triggerSync}
      onRefresh={fetchRuns}
    />
  );
}
