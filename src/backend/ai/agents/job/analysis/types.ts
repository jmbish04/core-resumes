export type Phase = "consult-notebook" | "deep-analyze" | "persist" | "archive" | "embed" | "done";

export interface JobAnalysisState {
  inFlight: Record<string, Phase>;
  lastError?: string;
}
