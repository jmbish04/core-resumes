/**
 * @fileoverview Shared types for the modular health diagnostic pipeline.
 *
 * Every health check module returns a `HealthStepResult`. The coordinator
 * aggregates these into a `HealthRun` persisted in D1.
 */

// ---------------------------------------------------------------------------
// Status enums
// ---------------------------------------------------------------------------

/** Overall run status computed from individual check results. */
export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

/** Status of a single health check step. */
export type CheckStatus = "ok" | "warn" | "fail" | "skipped" | "timeout";

/** Logical grouping for health checks displayed in the dashboard. */
export type HealthCategory =
  | "database"
  | "ai"
  | "providers"
  | "agents"
  | "google"
  | "binding"
  | "auth"
  | "api"
  | "greenhouse"
  | "freelance"
  | "custom";

/** How the health run was triggered. */
export type HealthTrigger = "manual" | "scheduled" | "agent";

// ---------------------------------------------------------------------------
// Per-check result
// ---------------------------------------------------------------------------

/** Result returned by every modular health check function. */
export interface HealthStepResult {
  /** Check status. */
  status: CheckStatus;
  /** Wall-clock latency in milliseconds. */
  latencyMs: number;
  /** Human-readable error message when status is `fail` or `timeout`. */
  error?: string;
  /** Arbitrary structured details for the dashboard / AI prompt. */
  details?: Record<string, unknown>;
  /** AI-generated remediation suggestion (populated by coordinator). */
  aiSuggestion?: string;
}

/**
 * Backward-compatible alias used by existing health check files.
 * Will be removed in Phase 6 cleanup.
 */
export type ModuleResult = HealthStepResult;

// ---------------------------------------------------------------------------
// Run-level types (mirror D1 schema shape)
// ---------------------------------------------------------------------------

/** Top-level health run summary (mirrors `health_runs` table). */
export interface HealthRun {
  id: string;
  status: HealthStatus;
  trigger: HealthTrigger;
  durationMs: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

/** Individual check result within a run (mirrors `health_results` table). */
export interface HealthResult {
  id: string;
  runId: string;
  category: HealthCategory;
  name: string;
  status: CheckStatus;
  message?: string;
  details?: Record<string, unknown>;
  durationMs: number;
  aiSuggestion?: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Config types used by health checks
// ---------------------------------------------------------------------------

/** Shape of the `template_ids` config key in D1 `global_config`. */
export interface TemplateIds {
  resume: string;
  coverLetter: string;
  drivePrefix: string;
}

// ---------------------------------------------------------------------------
// Check registration
// ---------------------------------------------------------------------------

/** Descriptor for registering a check with the HealthCoordinator. */
export interface HealthCheckDescriptor {
  /** Unique name for this check (e.g. "d1_roundtrip"). */
  name: string;
  /** Category for dashboard grouping. */
  category: HealthCategory;
  /** The check function. */
  fn: () => Promise<HealthStepResult>;
}

// ---------------------------------------------------------------------------
// External types used by health checks
// ---------------------------------------------------------------------------

/**
 * Job posted on Greenhouse
 */
export interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location: { name: string };
}

/**
 * Job posted on Ashby (public posting-api response shape)
 */
export interface AshbyJob {
  id: string;
  title: string;
  location: string;
  publishedAt: string;
  organizationName?: string;
}
