---
title: "Database Schema"
date_last_updated: "2026-05-31"
---

# Database Schema

The Career Orchestrator uses **Cloudflare D1** (SQLite) with **Drizzle ORM**. Each table is defined in its own file under `src/backend/db/schemas/` and re-exported from `src/backend/db/schema.ts`.

## Table Overview

### roles

The central table. Each row represents a job application being tracked. Roles flow through a lifecycle: **preparing** → **applied** → **interviewing** → **offer** / **rejected** / **withdrawn** / **archived**. The `metadata` JSON column stores flexible data like scraped job descriptions and skill tags. The `roleInstructions` column holds role-specific AI instructions.

### documents

Google Docs created per role. Each document has a `type` — **resume**, **cover_letter**, **notes**, or **other** — and a `gdocId` linking to the Google Doc. Documents are versioned and cascade-deleted when their parent role is removed.

### threads

Conversation threads between the user and Colby. Threads can be scoped to a specific role via `roleId` (for role-specific chat) or global (title = "Global"). Used for persistent conversation history.

### messages

Individual messages within threads. The `author` field distinguishes between **user**, **agent** (Colby), and **system** messages. The `metadata` JSON column can link messages to related entities like emails.

### emails

Inbound recruiting emails captured by the Worker email handler. Each email has a `processedStatus` lifecycle: **pending** → **associated** (matched to a role) / **unmatched** / **responded** / **ignored**. The `rawContent` field stores the original email for re-processing.

### global_config

Key-value configuration store. Keys include `agent_rules` (behavioral constraints), `resume_bullets` (source material), and `template_ids` (Google Doc template references). Editable via the `/config` page.

### job_failures

Records failed job URL scrapes — broken links, timeouts, or parsing errors. Used for debugging and retry tracking. Each failure stores the `jobUrl` and `errorMessage`.

### role_bullets

Classified bullet points extracted from job postings during intake. Each bullet has a `type` (KEY_RESPONSIBILITY, REQUIRED_QUALIFICATION, PREFERRED_QUALIFICATION, REQUIRED_SKILL, PREFERRED_SKILL, EDUCATION_REQUIREMENT, BENEFIT, OTHER) and the full extracted `content`. Supports revision tracking via `replacedById` and `timeRevised`, plus soft-delete via `isActive` and `timeDeleted`.

### role_analyses

AI-generated hireability assessments for roles. Each analysis is versioned and stores a `hireScore` (0-100), `compensationScore` (0-100), and rationale text for each. Configuration snapshots record the NotebookLM prompt, compensation baseline, and career stories used at analysis time.

### role_alignment_scores

Per-requirement alignment scores linked to a `role_analyses` row. Each row scores an individual requirement (`type` + `content`) against Justin's profile with a `score` (0-100) and `rationale`.

### role_insights

Versioned AI analysis across three dimensions — **location**, **compensation**, and **combined**. Uses SHA-256 `inputHash` for change detection to avoid redundant re-analysis. The `analysisPayload` JSON column stores dimension-specific structured data (commute tables, negotiation targets, etc.). See [Role Insights](/docs/role-insights) for details.

### scoring_rubrics

Configurable scoring criteria used by the Role Insights Engine. Each rubric has a `type` (location, compensation, combined), a `criteria` description, and a score range band (`scoreRangeMin` to `scoreRangeMax`). Rubrics are injected into AI prompts to guide scoring. Supports soft-delete via `isActive`.

### companies

Company profiles associated with roles. Stores name, website, and brand color palette (extracted via AI during intake). The `brandColors` JSON column holds primary, secondary, accent, and background colors for document branding.

### career_memory

Semantic memory system with dual storage. Each memory has a `category` (career_fact, role_analysis, resume_draft, etc.), `source` (notebooklm, user_input, draft_review), and full-text `content`. Records are soft-deleted with `isActive` and `deletedAt` flags, with revision linking via `replacedById`.

### health_screenings

Persisted health check results from the automated 4-hour cron. Each screening records the overall `status`, `totalDurationMs`, and `results` JSON with per-module diagnostics (D1, KV, Workers AI, Google Drive, etc.).

### interview_notes

Free-form notes for role-specific interview preparation. Supports markdown content with creation and update timestamps.

### interview_recordings

Audio recordings uploaded for interview practice. Stores the R2 key, file metadata, and optional transcription job linkage.

### transcription_jobs

Background audio transcription jobs. Tracks status (pending → processing → completed → failed), chunk progress, and the final assembled transcript.

### transcription_chunks

Individual chunks of a transcription job. Each chunk stores its sequence `index`, `text` content, and timing metadata.

### role_podcasts

AI-generated audio briefings for roles. Stores the podcast script, audio R2 key, and generation metadata. Supports multiple episodes per role with versioning.

## Live Schema

The table below is fetched live from the D1 database using `PRAGMA table_info` queries, so it always reflects the current deployed schema:
