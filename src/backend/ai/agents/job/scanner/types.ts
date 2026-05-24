/**
 * @fileoverview Types for the JobScannerAgent.
 */

export interface RunState {
  sessionId: string;
  token?: string;
  status: "running" | "completed" | "failed";
  scraped: number;
  triaged: number;
  analyzed: number;
  failed: number;
  error?: string;
}

export interface AnalyzeJob {
  snapshotId: number;
  jobSiteId: string;
  token: string;
}

export interface JobScannerState {
  runs: Record<string, RunState>;
  queue: AnalyzeJob[];
}

export interface ScanProgress {
  type: "scan-progress";
  token?: string;
  scraped: number;
  triaged: number;
  analyzed?: number;
  failed?: number;
}
