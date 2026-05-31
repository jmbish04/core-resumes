---
title: "Configuration"
date_last_updated: "2026-05-31"
---

# Configuration

The Career Orchestrator is configured through three layers: the Wrangler config file, the Cloudflare secrets system, and the runtime `global_config` D1 table.

## wrangler.jsonc

The `wrangler.jsonc` file at the project root defines all Cloudflare bindings:

- **D1 Database** — `DB` binding pointing to the `core-resumes` D1 database.
- **KV Namespaces** — `KV` for general storage and `SESSIONS` for Astro session management.
- **AI** — Workers AI binding with remote mode enabled.
- **Browser Rendering** — `BROWSER` binding for headless browser scraping.
- **Durable Objects** — `ORCHESTRATOR_AGENT`, `NOTEBOOKLM_AGENT`, and `NOTEBOOKLM_MCP_AGENT` bindings.
- **Email** — `EMAIL_OUT` for outbound email via Worker email routing.

### Environment Variables

These are non-secret configuration values set in `wrangler.jsonc` `vars`:

- `DEFAULT_MODEL_EMBEDDING` — The embedding model ID (default: `@cf/baai/bge-large-en-v1.5`)
- `PARENT_DRIVE_FOLDER_ID` — Google Drive parent folder for role-specific subfolders
- `AI_GATEWAY_ID` — Cloudflare AI Gateway ID for observability
- `CAREER_NOTEBOOKLM_ID` — The NotebookLM notebook ID for the career knowledge base
- `MODEL_CHAT` — Model for chat/drafting (default: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`)
- `MODEL_EXTRACT` — Model for extraction tasks (default: `@cf/meta/llama-3.1-8b-instruct`)
- `MODEL_DRAFT` — Model for document drafting (default: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`)

## Secrets Management

Secrets are managed through a three-tier system. All access is centralized in `src/backend/utils/secrets.ts`.

### Tier 1: Secrets Store (Immutable)

Static credentials bound via `secrets_store_secrets` in `wrangler.jsonc`. Accessed with `await env.BINDING.get()`.

- `GITHUB_TOKEN` — GitHub API access
- `CLOUDFLARE_ACCOUNT_ID` — Account ID for API calls
- `WORKER_API_KEY` — Bearer token for MCP endpoint authentication
- `GOOGLE_CREDS_SA_PRIVATE_KEY_PT_1` / `_PT_2` — Google Service Account key (split for 1024-byte limit)
- `GOOGLE_CREDS_SA_CLIENT_EMAIL` — Google Service Account email

### Tier 2: Worker Secrets (CLI-Updatable)

Set via `wrangler secret put NAME`. Accessed as `env.NAME` (plain string).

- _(No active Worker Secrets in use — NotebookLM cookies migrated to KV)_

### Tier 3: KV (Runtime-Mutable)

Read/write at runtime via `env.KV.get()` / `env.KV.put()`.

- `ACTIVE_NOTEBOOKLM_SESSION` — NotebookLM session cookies (primary auth source)
- `NOTEBOOKLM_CSRF_CACHE` — Cached CSRF auth object (auto-managed, 30 min sliding TTL)
- `NOTEBOOKLM_COOKIE_SIGNING_KEY` — Rotatable signing key for Career Orchestrator frontend cookies
- Google Service Account access tokens — Cached with TTL

## Global Config (D1)

The `global_config` table stores runtime configuration editable via the `/config` page:

- **agent_rules** — Array of behavioral rules injected into every AI prompt (e.g., "Use precise, truthful language")
- **resume_bullets** — Array of resume bullet points used as source material for AI drafting
- **template_ids** — Object with `resume` (Google Doc ID/URL), `coverLetter` (Google Doc ID/URL), and `drivePrefix` (folder naming prefix)
- **compensation_baseline** — Justin's Google compensation data used by the Role Insights Engine for comparative analysis. Includes target TC (~$260,672), base salary, bonus, equity, PTO, and perks.

## Scoring Rubrics

Scoring rubrics define the criteria used by the **Role Insights Engine** to score roles across three dimensions. Managed via the **Config → Scoring Rubrics** tab.

### Rubric Types

- **Location** — Criteria for commute, workplace type, and geographic fit scoring.
- **Compensation** — Criteria for salary range, benefits, and total compensation scoring.
- **Combined** — Criteria for holistic trade-off evaluation between location and compensation.

### Rubric Fields

- **Criteria** — Human-readable description of the scoring criteria.
- **Score Range Min/Max** — The score band for this criteria (e.g., 80–100 for fully remote).
- **Active** — Toggle to enable/disable a rubric without deleting it.

### Default Rubrics

Click **Seed Defaults** to populate the system with a baseline rubric set. The seed operation is idempotent — it only creates rubrics that don't already exist. Default rubrics cover common scenarios like "Fully remote (no commute)", "Hybrid 2 days/week", and "TC exceeds Google baseline".

See [Role Insights](/docs/role-insights) for details on how rubrics influence analysis scores.

## Pipeline Configuration

The **Config → Pipeline** tab manages which company job boards (Greenhouse, Ashby, Lever, etc.) are monitored by the automated active board tracker. Each board token maps to a public ATS job board endpoint.

### Board Token Fields

- **Board Token** — The ATS board slug/token (e.g., `cloudflare` from Greenhouse, or `ashby-token` from Ashby)
- **Company Name** — Display name for dashboards and reports
- **Website** — Company website URL
- **Email Domain** — Used for automatic email-to-role routing
- **Active** — Toggle to include/exclude a company from pipeline runs

See [Active Board Tracker (Pipeline B)](/docs/active-board-tracker) for details on how the tracker operates and how to interpret analytics.
