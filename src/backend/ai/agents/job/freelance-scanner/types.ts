/**
 * @fileoverview Types for the FreelanceScannerAgent.
 */

export type Platform = "upwork" | "freelancer";

export interface SearchProfile {
  id: string;
  name: string;
  platform: Platform | "both";
  query?: string;
  skills?: string;
  filters: Record<string, unknown>;
  isActive: boolean;
}

export interface FreelanceScanRunState {
  sessionId: string;
  platform: Platform | "both";
  status: "running" | "completed" | "failed";
  query?: string;
  found: number;
  new: number;
  updated: number;
  failed: number;
  error?: string;
  startedAt: string;
}

export interface FreelanceScannerState {
  runs: Record<string, FreelanceScanRunState>;
  searchProfiles: SearchProfile[];
  lastScanAt: Record<string, string>; // platform -> ISO timestamp
}

export interface FreelanceScanProgress {
  type: "freelance-scan-progress";
  sessionId: string;
  platform: Platform | "both";
  status: "running" | "completed" | "failed";
  found: number;
  new: number;
  updated: number;
  failed?: number;
  error?: string;
}
