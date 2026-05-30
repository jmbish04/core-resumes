/**
 * @file Barrel re-export for the job pipeline domain.
 *
 * All tables live flat at `schemas/pipeline/jobs/{table-name}.ts`.
 * Categories:
 * - Board management:    board-tokens, board-template-analyses
 * - Postings:            jobs-postings, job-snapshots
 * - Analysis:            job-req/skill/responsibility-snapshots, notebook-consultations, ai-log
 * - Taxonomy:            categories, tags, mappings, HITL feedback
 * - HITL:                hitl-reviews
 * - Pipeline:            session-runs
 * - Lists:               job-saved-lists, job-saved-list-items
 * - External ATS:        api-companies, api-company-sync-stats
 */

// Board management
export * from "./board-tokens";
export * from "./board-template-analyses";

// Postings
export * from "./jobs-postings";
export * from "./job-snapshots";

// Analysis
export * from "./job-req-snapshots";
export * from "./job-skill-snapshots";
export * from "./job-responsibility-snapshots";
export * from "./job-notebook-consultations";
export * from "./ai-log-workers-ai";

// Taxonomy
export * from "./job-categories";
export * from "./job-category-mappings";
export * from "./job-category-hitl-feedback";
export * from "./job-tags";
export * from "./job-tag-mappings";
export * from "./job-tag-hitl-feedback";

// HITL
export * from "./hitl-reviews";

// Pipeline
export * from "./session-runs";
export * from "./sync-run-events";

// Lists
export * from "./job-saved-lists";
export * from "./job-saved-list-items";

// External ATS references
export * from "./api-companies";
export * from "./api-company-sync-stats";
