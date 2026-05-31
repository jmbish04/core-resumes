# Job Board Provider Registry

## Architecture

```
src/backend/ai/tools/
├── greenhouse.ts          # Greenhouse API tool client
├── ashby.ts               # AshbyHQ API tool client
├── gem.ts                 # Gem API tool client

src/backend/pipeline/job-board-providers/
├── types.ts               # JobBoardProvider interface, NormalizedJobPost, TokenTestResult
├── greenhouse.ts          # Greenhouse provider (wraps ai/tools/greenhouse.ts)
├── ashby.ts               # Ashby provider (wraps ai/tools/ashby.ts)
├── gem.ts                 # Gem provider (wraps ai/tools/gem.ts)
├── index.ts               # Registry barrel: JOB_BOARD_PROVIDERS[], getProviderByName()

src/backend/health/checks/job-board-apis/
├── board-token-config.ts  # Greenhouse token connectivity check
├── ashby-api.ts           # AshbyHQ API connectivity check
├── gem-api.ts             # Gem API connectivity check
├── index.ts               # Unified entrypoint: checkJobBoardApiConnectivity()
```

## Onboarding a New Provider

1. Create `src/backend/ai/tools/<provider>.ts` — implement `scrapeBoard` + `scrapeJob`
2. Create `src/backend/pipeline/job-board-providers/<provider>.ts` implementing `JobBoardProvider`
3. Add to `JOB_BOARD_PROVIDERS` array in `index.ts` — one line
4. Create health check at `src/backend/health/checks/job-board-apis/<provider>-api.ts`
5. Import in `job-board-apis/index.ts` — add to `PROVIDER_CHECKS` array
6. Add `<provider>_tokens` to `health_check_config` defaults
7. Add seed row to `JOB_BOARD_DEF_SEEDS` in `config.ts`
8. Update `AGENTS.md`, this rules file, and frontend docs at `src/frontend/content/docs/integrations/job-boards.md`

## Rules

- **Never** inline ATS-specific scraping in route handlers — always use `provider.scrapeJob()` via the registry
- All providers must normalize output to `ScrapedPage` shape for pipeline compatibility
- Health checks must sample ≤5 tokens with 5s timeout per token
- Board def assignment in `promote.ts` requires a confirmed `getProviderByName()` match — **no fallback assumptions**
- All providers set `isApi: true`, `isRss: false` unless they specifically support RSS feeds
- The `displayName` from the provider interface maps 1:1 to the `company_job_board_defs.name` column
