/**
 * @file Top-level barrel re-export for all D1 schema definitions.
 *
 * Organized by use-case domain:
 * - applications/    — roles, analyses, alignment scores, documents, bullets, insights, podcasts, companies
 * - career/          — resume bullets, career memory
 * - communications/  — threads, messages, emails, email parties, email attachments
 * - geo/             — geographic locations, meta definitions, EAV mappings
 * - interviews/      — interview notes, recordings, mock interviews, transcription pipeline
 * - notebooks/       — NotebookLM blobs, podcast transcripts
 * - system/          — global config, job failures, health checks, logs, statuses, maps usage
 * - pipeline/        — job board scanner (boards, postings, analysis, taxonomy, HITL, sessions, lists) + freelance
 */

export * from "./schemas/applications";
export * from "./schemas/career";
export * from "./schemas/communications";
export * from "./schemas/geo";
export * from "./schemas/interviews";
export * from "./schemas/notebooks";
export * from "./schemas/system";
export * from "./schemas/pipeline";

