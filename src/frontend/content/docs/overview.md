# Career Orchestrator

The Career Orchestrator is a single-user job application management platform built on Cloudflare Workers. It helps candidates apply for jobs efficiently and effectively by automating the repetitive parts of the application process.

## What It Does

The Career Orchestrator manages the full lifecycle of a job search:

- **Intake** — Paste a job posting URL and the system scrapes, parses, and extracts structured role data automatically.
- **Draft** — AI generates tailored resumes and cover letters from Google Docs templates, customized for each role.
- **Track** — Every application is tracked through a lifecycle: preparing → applied → interviewing → offer / rejected / withdrawn / archived.
- **Communicate** — Inbound recruiting emails are captured, matched to active roles, and AI-drafted replies are generated.
- **Learn** — The NotebookLM career knowledge base is consulted for context about your experience and skills.

## Data Flow

1. Add a role from a job URL via the intake form.
2. Colby scrapes the page and extracts structured job data.
3. Confirm the extracted role data and Colby creates a Google Drive folder.
4. Colby generates a tailored resume and cover letter from your templates.
5. Review and refine the drafts, then update the role status as you apply.
6. Inbound recruiting email is automatically matched to active roles or sent to the email association page.

## Documentation Pages

- [Architecture](/docs/architecture) — How the system is built: Workers, D1, Durable Objects, AI Gateway
- [Role Intake](/docs/role-intake) — Multi-pass scrape, AI extraction, DOM sidecar, reconciliation, and confirmation
- [Role Viewport](/docs/role-viewport) — Role workspace layout, tabs, and role-scoped assistant modal
- [Role Insights](/docs/role-insights) — Location, compensation, and combined value analysis with scoring rubrics
- [Greenhouse Pipeline](/docs/greenhouse-pipeline) — Automated job scanning, snapshotting, trend analysis, and pipeline configuration
- [Configuration](/docs/configuration) — Customize behavior via wrangler.jsonc, secrets, and the Config page
- [Database Schema](/docs/database) — All D1 tables with live schema viewer
- [Agents Overview](/docs/agents) — How OrchestratorAgent, NotebookLMAgent, and NotebookLMMcpAgent work together
- [NotebookLM](/docs/integrations/notebooklm) — Career knowledge base configuration, chat workflow, and agent integration details
- [Google Drive](/docs/integrations/google-drive) — Service-account Drive usage, folders, and HTML-to-doc upload
- [Google Docs](/docs/integrations/google-docs) — Templates, reads, appends, and comment reply flows
- [Greenhouse](/docs/integrations/greenhouse) — Public API job scrape fallback and company board tokens
- [API Reference](/docs/api) — Hono + Zod OpenAPI backend routes
- [Resume Template](/docs/resume-template) — Embedded preview of the Google Docs resume template
- [Cover Letter Template](/docs/cover-letter-template) — Embedded preview of the Google Docs cover letter template
