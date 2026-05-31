---
title: "OrchestratorAgent"
date_last_updated: "2026-05-31"
---

# OrchestratorAgent

**OrchestratorAgent** is the primary orchestrator of the Career Orchestrator. It is a Cloudflare Durable Object that manages the full job-application lifecycle with persistent state, scheduled task processing, and access to all external tools.

## Overview

Colby is instantiated per-role or as a global instance. Each instance maintains its own state and task queue. When a user adds a new role, Colby scrapes the job posting, extracts structured data, creates Google Drive folders and documents, and continuously processes queued tasks like email drafts and resume reviews.

## How It Works

### Task Queue

Colby operates on an asynchronous task queue pattern. Tasks are enqueued via `enqueueTask()` and processed every 30 seconds by `processPendingTasks()`. Each task goes through a lifecycle: **pending** → **running** → **complete** / **failed**. Progress is broadcast to all connected WebSocket clients in real-time.

### Task Types

- **job_extract** — Scrapes a URL via Browser Rendering, then extracts structured job data using the AI extract task
- **email_draft** — Fetches an email from D1 and generates an AI-drafted reply
- **resume_review** — Generates resume content tailored to a role
- **cover_letter_draft** — Generates a cover letter tailored to a role

### AI Integration

Colby uses two AI tasks from `src/backend/ai/tasks/`:

- **draft** — Uses the 70B Llama model for generating polished, tailored content (resumes, cover letters, email replies)
- **extract** — Uses the 8B Llama model for structured data extraction with JSON schema validation

## Live Agent Metadata

The following is fetched live from the agent's `docsMetadata()` method:
