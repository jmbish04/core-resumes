# Unified Job Board Provider Registry — Walkthrough

## Summary

Consolidated Greenhouse, AshbyHQ, and Gem into a single **Provider Registry** with a shared interface for health checking, board scraping, and single-job extraction. Established the onboarding pattern for future ATS providers.

---

## New Files (8)

### Tool Client
| File | Purpose |
|------|---------|
| [ashby.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tools/ashby.ts) | AshbyHQ API client — URL parsing, `scrapeAshbyBoard()`, `scrapeAshbyJob()` |

### Provider Registry
| File | Purpose |
|------|---------|
| [types.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/pipeline/job-board-providers/types.ts) | `JobBoardProvider` interface, `NormalizedJobPost`, `TokenTestResult` |
| [greenhouse.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/pipeline/job-board-providers/greenhouse.ts) | Greenhouse provider wrapping existing tool |
| [ashby.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/pipeline/job-board-providers/ashby.ts) | Ashby provider wrapping new tool |
| [gem.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/pipeline/job-board-providers/gem.ts) | Gem provider wrapping existing tool |
| [index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/pipeline/job-board-providers/index.ts) | Registry barrel + `scrapeJobFromBoard()` auto-detection |

### Health & Rules
| File | Purpose |
|------|---------|
| [index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/health/checks/job-board-apis/index.ts) | Unified health check entrypoint (`checkJobBoardApiConnectivity`) |
| [job-board-providers.md](file:///Volumes/Projects/workers/core-resumes/.agent/rules/job-board-providers.md) | Agent rules for provider onboarding |

---

## Modified Files (5)

### [promote.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/pipeline/promote.ts)

- **Removed** direct `scrapeGreenhouseJob` and `scrapeGemJob` imports
- **Removed** 50+ lines of inline Ashby scraping (`fetch("https://api.ashbyhq.com/...")`)
- **Added** `scrapeJobFromBoard()` — single call replaces the entire ATS detection if/else chain
- **Fixed** board def assignment: no more Greenhouse fallback. Only confirmed providers (via `getProviderByName()`) get board mappings

### [index.ts (health)](file:///Volumes/Projects/workers/core-resumes/src/backend/health/index.ts)

- **Replaced** 3 separate check registrations (`board_token_config`, `ashby_api`, `gem_api`) with 1 unified `job_board_api_connectivity`
- **Updated** timeout overrides accordingly

### [config.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/config.ts)

- **Added** `JOB_BOARD_DEF_SEEDS` array with Greenhouse, AshbyHQ, Gem definitions
- **Extended** `/seed` route to upsert board definitions alongside globalConfig

### [AGENTS.md](file:///Volumes/Projects/workers/core-resumes/AGENTS.md)

- **Updated** Health Service section: 11 modules (added `job_board_api_connectivity`)
- **Added** "Job Board Provider Registry" section with architecture overview
- **Renamed** "Maintenance Instructions for Greenhouse Agents" → "Maintenance Instructions for Job Board Pipeline Agents"

### [job-boards.md](file:///Volumes/Projects/workers/core-resumes/src/frontend/content/docs/integrations/job-boards.md)

- **Added** Gem as 4th ATS platform
- **Added** Provider Registry architecture section with Mermaid diagram
- **Added** `JobBoardProvider` interface documentation and onboarding steps
- **Added** Database schema tables documentation
- **Updated** `date_last_updated` to `2026-05-31`

---

## Key Design Decisions

1. **`scrapeJobFromBoard()`** — The registry provides a single entry point that internally resolves the correct provider via explicit system name OR ID-format heuristic (numeric → Greenhouse, UUID → Ashby). Route handlers never import individual tool modules.

2. **No Greenhouse fallback** — Board def assignment in the promote route now requires `getProviderByName()` to return a confirmed match. Unrecognized systems (e.g. Lever) are skipped entirely.

3. **Modular health checks preserved** — The 3 individual check files (`ashby-api.ts`, `gem-api.ts`, `board-token-config.ts`) stay as separate modules. The new `index.ts` barrel aggregates them into one `HealthStepResult` with per-provider breakdown.

---

## Verification

- ✅ Build 1: Clean compilation (Components 1–3)
- ✅ Build 2: Clean compilation (Component 3 import fix)
- ✅ Build 3: Clean compilation (scrapeJobFromBoard refactor)
- ⏳ Build 4: Final (config.ts seed changes)
