export const sandboxOptions = {
  sleepAfter: "10m",
  keepAlive: false,
  containerTimeouts: {
    portReadyTimeoutMS: 180_000,
    instanceGetTimeoutMS: 60_000,
  },
  normalizeId: true,
};

export type TranscriptionState = {
  status: "idle" | "chunking" | "transcribing" | "complete" | "error";
  phase: string;
  progress: number;
  totalChunks: number;
  completedChunks: number;
  fullText: string;
  logs: string[];
  error: string | null;
  recordingId: string | null;
  roleId: string | null;
  jobId: string | null;
};

export const MAX_LOG_LINES = 50;
