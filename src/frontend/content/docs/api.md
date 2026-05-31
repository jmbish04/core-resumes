---
title: "API Reference"
date_last_updated: "2026-05-31"
---

# API Reference

The Career Orchestrator backend is built with **Hono** and **@hono/zod-openapi**, providing type-safe API routes with automatic OpenAPI specification generation.

## Interactive Documentation

The API has built-in interactive documentation:

- [OpenAPI Spec](/openapi.json) — Raw JSON OpenAPI 3.1 specification
- [Scalar](/scalar) — Modern, interactive API reference UI
- [Swagger](/swagger) — Classic Swagger UI

## Authentication

All `/api/*` routes (except `/api/ping`) are protected by the auth middleware. Authentication is session-based using cookies (`cr_session`).

## Route Groups

### Health — `/api/health`

System health checks for all service dependencies (D1, AI Gateway, Google APIs).

### Roles — `/api/roles`

CRUD operations for job application roles. Supports listing, creating, updating, and deleting roles with status filtering.

### Intake — `/api/intake`

The job intake pipeline. Accepts a URL, scrapes the page via Browser Rendering, extracts structured job data via AI, and creates a new role with associated Google Drive folder and documents.

### Threads — `/api/threads`

Conversation thread management for the Colby chat interface. Lists threads, retrieves messages, and creates new threads.

### Documents — `/api/documents`

Google Docs management for role-specific documents (resumes, cover letters, notes).

### Emails — `/api/emails`

Inbound email management. Lists captured emails, associates them with roles, and triggers AI-drafted replies.

### Config — `/api/config`

Global configuration CRUD. Supports listing all config, getting/setting individual keys, and seeding defaults.

### Dashboard — `/api/dashboard`

Aggregated dashboard data including role counts by status, recent activity, and system metrics.

### Admin — `/api/admin`

Administrative operations including config seeding and system maintenance.

### Docs — `/api/docs`

Documentation API endpoints. Returns live D1 schema data and agent metadata for the docs frontend.

### Role Bullets — `/api/roles/:roleId/bullets`

CRUD operations for role-specific bullet points. Bullets are classified by type (KEY_RESPONSIBILITY, REQUIRED_QUALIFICATION, etc.) and support revision tracking with soft-delete.

### Role Insights — `/api/roles/:roleId/insights`

AI-powered role analysis across three dimensions: location, compensation, and combined value. Supports versioned history and SHA-256 change detection. See [Role Insights](/docs/role-insights) for details.

### Scoring Rubrics — `/api/scoring-rubrics`

CRUD operations for configurable scoring rubric criteria used by the Role Insights Engine. Supports seeding defaults via `POST /api/scoring-rubrics/seed`. Each rubric defines a criteria description, score range band, and active status.

### Career Memory — `/api/memory`

Semantic career memory system with dual storage (D1 + Vectorize). Supports listing, searching, creating, updating, and soft-deleting memory entries.

### Notebook — `/api/notebook`

NotebookLM query interface. Sends queries to the career knowledge base and stores responses in career memory.

### Notebook Session — `/api/notebook/session`

NotebookLM session management. Status polling, cookie sync, and session validation.

## Adding New Routes

1. Create a new file in `src/backend/api/routes/`
2. Define your route using `createRoute()` with Zod schemas for request/response validation
3. Export an `OpenAPIHono` router
4. Register the router in `src/backend/api/index.ts` via `app.route()`
5. The route automatically appears in the OpenAPI spec and interactive docs
