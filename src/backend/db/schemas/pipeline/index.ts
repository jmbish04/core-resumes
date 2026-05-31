/**
 * @file Top-level barrel for all pipeline domain schemas.
 *
 * Organized by pipeline type:
 * - jobs/       — job board scanner domain (boards, postings, analysis, taxonomy, HITL, sessions, lists)
 * - freelance/  — freelance opportunity scanner domain (opportunities, triage, proposals, scans, profiles)
 * - pipeline-runs — cross-pipeline run-status index (written by runPipeline())
 */

export * from "./jobs";
export * from "./freelance";
export * from "./pipeline-runs";
