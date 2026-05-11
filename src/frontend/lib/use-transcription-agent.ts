/**
 * @fileoverview useTranscriptionAgent — React hook that connects to the
 * TranscriptionAgent DO via WebSocket for live progress streaming.
 *
 * Uses `useAgent()` from `agents/react` to subscribe to `onStateUpdate`
 * callbacks. When the Agent calls `setState()`, the new TranscriptionState
 * is pushed to this hook instantly — no polling required.
 *
 * Usage:
 *   const { state, connected, triggerTranscription } = useTranscriptionAgent(recordingId);
 *   // state.status, state.progress, state.phase etc. update in real-time
 */

import { useAgent } from "agents/react";
import { useCallback, useState } from "react";

import type { TranscriptionState } from "@/ai/agents/transcription/types";

// ---------------------------------------------------------------------------
// Default state — mirrors Agent's initialState
// ---------------------------------------------------------------------------

const INITIAL_STATE: TranscriptionState = {
  status: "idle",
  phase: "",
  progress: 0,
  totalChunks: 0,
  completedChunks: 0,
  fullText: "",
  logs: [],
  error: null,
  recordingId: null,
  roleId: null,
  jobId: null,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTranscriptionAgent(instanceName: string) {
  const [state, setState] = useState<TranscriptionState>(INITIAL_STATE);
  const [connected, setConnected] = useState(false);

  const agent = useAgent({
    agent: "TranscriptionAgent",
    name: instanceName,
    onStateUpdate: (newState: TranscriptionState) => {
      setState(newState);
    },
    onOpen: () => setConnected(true),
    onClose: () => setConnected(false),
    onError: () => setConnected(false),
  });

  /**
   * Trigger transcription via the Agent's @callable RPC method.
   * The Agent handles all processing and streams progress back via setState().
   */
  const triggerTranscription = useCallback(
    (r2Key: string, recordingId: string, roleId: string, jobId: string) => {
      try {
        agent.send(
          JSON.stringify({
            type: "cf_agent_rpc",
            method: "transcribe",
            args: [r2Key, recordingId, roleId, jobId],
            id: crypto.randomUUID(),
          }),
        );
      } catch (error) {
        console.error("Failed to trigger transcription RPC:", error);
      }
    },
    [agent],
  );

  return {
    /** Live TranscriptionState — updates via WebSocket push */
    state,
    /** Whether the WebSocket connection to the Agent is open */
    connected,
    /** The raw agent connection for advanced usage */
    agent,
    /** Trigger the transcription pipeline via RPC */
    triggerTranscription,
  };
}
