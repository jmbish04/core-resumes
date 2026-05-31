# Unified Job Board Provider Registry (Revised)

Consolidate Greenhouse, AshbyHQ, and Gem into a single **provider registry** with a shared interface for health checking, board scraping, and single-job extraction. Establishes the onboarding pattern for future ATS providers.

> [!NOTE]
> This plan builds on top of the existing **Companies & Pipeline Refactor** ([implementation_plan.md](file:///Volumes/Projects/workers/core-resumes/docs/0014_pipeline/refactor/implementation_plan.md)) which already introduced the `company_job_board_defs` and `company_job_board_mapping` tables ([companies.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/applications/companies.ts#L79-L104)). Those schema tables are already live in D1 — this plan wires the provider registry into them.

## User Review Required

> [!IMPORTANT]
> The 3 separate health check files (`ashby-api.ts`, `gem-api.ts`, `board-token-config.ts`) stay as modular files inside the existing `src/backend/health/checks/job-board-apis/` folder. A new `index.ts` barrel in that folder normalizes them into a single `checkJobBoardApiConnectivity()` entrypoint that runs all 3 uniformly.

> [!IMPORTANT]
> A new `src/backend/ai/tools/ashby.ts` client will be created to match the existing `greenhouse.ts` and `gem.ts` pattern. Currently AshbyHQ scraping is inline in `promote.ts` — this extracts it into a proper tool module.

---

## Proposed Changes

### Component 1: Missing AshbyHQ Tool Client

#### [NEW] [ashby.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tools/ashby.ts)

Create the Ashby client matching `greenhouse.ts` and `gem.ts`:

- **Types**: `AshbyJobResponse`, `AshbyBoardResponse`
- **URL parser**: `parseAshbyUrl()`, `isAshbyUrl()` — detect `ashbyhq.com/{slug}` patterns
- **`scrapeAshbyBoard(boardToken)`** — GET `api.ashbyhq.com/posting-api/job-board/{token}?includeCompensation=true` → return all jobs
- **`scrapeAshbyJob(boardToken, jobId)`** — fetch all + filter in memory → return `ScrapedPage & { ashby: AshbyJobResponse }`
- **No external dependencies** — native `fetch()` with `AbortSignal.timeout()`

---

### Component 2: Provider Registry

#### [NEW] [types.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/pipeline/job-board-providers/types.ts)

Common interface every job board provider implements:

```ts
import type { ScrapedPage } from "@/backend/ai/tools/browser-rendering";

/** Normalized job post — common shape regardless of ATS source. */
export interface NormalizedJobPost {
  id: string;
  title: string;
  location: string;
  department?: string;
  isRemote: boolean;
  publishedAt?: string;
  compensation?: string;
  descriptionHtml?: string;
  descriptionText?: string;
}

/** Standard result from probing one board token. */
export interface TokenTestResult {
  token: string;
  status: number;
  ok: boolean;
  jobCount: number;
  sampleJob?: { id: string; title: string; location: string };
  error?: string;
  latencyMs: number;
}

/** Capabilities every job board provider must expose. */
export interface JobBoardProvider {
  /** Machine key: "greenhouse" | "ashby" | "gem" */
  name: string;
  /** Display label for board def: "Greenhouse" | "AshbyHQ" | "Gem" */
  displayName: string;
  /** Config key in health_check_config (e.g. "greenhouse_tokens") */
  healthConfigKey: string;
  /** True if this provider has a structured API (maps to company_job_board_defs.is_api). */
  isApi: boolean;
  /** True if this provider supports RSS feeds (maps to company_job_board_defs.is_rss). */
  isRss: boolean;

  // --- Health ---
  /** Probe a single board token — return ok + job count. */
  testToken(token: string): Promise<TokenTestResult>;

  // --- Scraping ---
  /** Fetch all active jobs for a company board token. */
  scrapeBoard(token: string): Promise<NormalizedJobPost[]>;
  /** Fetch a single job by ID from a board. */
  scrapeJob(token: string, jobId: string): Promise<ScrapedPage>;
}
```

#### [NEW] [greenhouse.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/pipeline/job-board-providers/greenhouse.ts)

Wraps the existing `ai/tools/greenhouse.ts`:

- `name: "greenhouse"`, `displayName: "Greenhouse"`, `healthConfigKey: "greenhouse_tokens"`
- `testToken()` — HEAD to `boards-api.greenhouse.io/v1/boards/{token}/jobs`
- `scrapeBoard()` — GET all jobs, normalize to `NormalizedJobPost[]`
- `scrapeJob()` — delegates to `scrapeGreenhouseJob()`

#### [NEW] [ashby.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/pipeline/job-board-providers/ashby.ts)

Wraps the new `ai/tools/ashby.ts`:

- `name: "ashby"`, `displayName: "AshbyHQ"`, `healthConfigKey: "ashby_tokens"`
- `testToken()` — GET `api.ashbyhq.com/posting-api/job-board/{token}`, validate `{ jobs: [...] }`
- `scrapeBoard()` — normalize to `NormalizedJobPost[]`
- `scrapeJob()` — delegates to `scrapeAshbyJob()`

#### [NEW] [gem.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/pipeline/job-board-providers/gem.ts)

Wraps the existing `ai/tools/gem.ts`:

- `name: "gem"`, `displayName: "Gem"`, `healthConfigKey: "gem_tokens"`
- `testToken()` — GET `api.gem.com/job_board/v0/{slug}/job_posts`, validate response
- `scrapeBoard()` — delegates to `scrapeGemBoard()`, normalize
- `scrapeJob()` — delegates to `scrapeGemJob()`

#### [NEW] [index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/pipeline/job-board-providers/index.ts)

Provider registry — single source of truth:

```ts
/** All registered job board API providers. Add new ones here. */
export const JOB_BOARD_PROVIDERS: JobBoardProvider[] = [
  greenhouseProvider,
  ashbyProvider,
  gemProvider,
];

/** Look up a provider by system name (e.g. "greenhouse"). */
export function getProviderByName(name: string): JobBoardProvider | undefined {
  return JOB_BOARD_PROVIDERS.find((p) => p.name === name);
}
```

---

### Component 3: Unified Health Check Entrypoint (Modular)

The 3 existing health check files **stay as-is** under `src/backend/health/checks/job-board-apis/`. A new `index.ts` normalizes them.

#### [NEW] [index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/health/checks/job-board-apis/index.ts)

Barrel entrypoint that runs all 3 provider health checks uniformly:

```ts
import type { HealthStepResult } from "@/backend/health/types";
import { checkBoardTokenConfig } from "./board-token-config";
import { checkAshbyApi } from "./ashby-api";
import { checkGemApi } from "./gem-api";

/** Run all job board API health checks and aggregate results. */
export async function checkJobBoardApiConnectivity(
  env: Env,
): Promise<HealthStepResult> {
  const start = Date.now();
  const [greenhouse, ashby, gem] = await Promise.allSettled([
    checkBoardTokenConfig(env),
    checkAshbyApi(env),
    checkGemApi(env),
  ]);

  // Aggregate per-provider results into a single HealthStepResult
  // with a details.providers breakdown
  ...
}
```

#### [MODIFY] [index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/health/index.ts)

Replace 3 separate check registrations with 1 unified one:

```diff
-    { name: "board_token_config", category: "job_board_api", ... },
-    { name: "ashby_api", category: "job_board_api", ... },
-    { name: "gem_api", category: "job_board_api", ... },
+    { name: "job_board_api_connectivity", category: "job_board_api",
+      fn: () => checkJobBoardApiConnectivity(env) },
```

Update timeout overrides: remove individual entries → add `job_board_api_connectivity: 45_000`.

---

### Component 4: Promote Route Cleanup

#### [MODIFY] [promote.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/pipeline/promote.ts)

**4a. Analyze route** — replace ALL inline ATS scraping with provider registry:

Currently, Ashby scraping is inline (`fetch("https://api.ashbyhq.com/...")` at L282–302). This must be extracted to the new `ashby.ts` tool and routed via the provider registry:

```diff
-import { scrapeGreenhouseJob } from "@/backend/ai/tools/greenhouse";
-import { scrapeGemJob } from "@/backend/ai/tools/gem";
+import { getProviderByName } from "@/backend/pipeline/job-board-providers";

 // In the ATS detection block — replace the entire if/else chain:
+const provider = sourceSystem ? getProviderByName(sourceSystem) : null;
+if (provider) {
+  console.log(`[manual:analyze] Scraping ${provider.name} job: ${job.company}/${job.jobSiteId}`);
+  const result = await provider.scrapeJob(job.company, job.jobSiteId);
+  scrapedText = result.text;
+} else if (isGreenhouseId) {
+  // Legacy fallback for jobs without sourceApiCompanyId but numeric IDs
+  const { scrapeGreenhouseJob } = await import("@/backend/ai/tools/greenhouse");
+  const scraped = await scrapeGreenhouseJob(job.company, job.jobSiteId);
+  scrapedText = scraped.text;
+} else {
+  // Lever or unknown — existing fallback logic
+  ...
+}
```

**4b. Board def seeding** — **no Greenhouse fallback**. Only assign a board def when the `apiCompany.system` maps to a confirmed registered provider:

```diff
-const boardDefName =
-  apiCompany.system === "ashby" ? "Ashby"
-  : apiCompany.system === "gem" ? "Gem"
-  : apiCompany.system === "lever" ? "Lever"
-  : "Greenhouse";
+const provider = getProviderByName(apiCompany.system);
+
+// Only create board mapping if the system is a registered provider
+if (provider && apiCompany.jobBoardToken) {
+  let [boardDef] = await db.select().from(companyJobBoardDefs)
+    .where(eq(companyJobBoardDefs.name, provider.displayName)).limit(1);
+  
+  if (!boardDef) {
+    [boardDef] = await db.insert(companyJobBoardDefs).values({
+      id: crypto.randomUUID(),
+      name: provider.displayName,
+      description: `${provider.displayName} Job Board API`,
+      isApi: provider.isApi,
+    }).returning();
+  }
+  
+  await db.insert(companyJobBoardMapping).values({ ... });
+}
```

If `apiCompany.system` is unrecognized (e.g. `"lever"` before a Lever provider exists), the board mapping step is simply **skipped** — no silent Greenhouse assumption.

---

### Component 5: Board Definition Seeding

The `company_job_board_defs` table ([companies.ts L79-86](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/applications/companies.ts#L79-L86)) already exists with columns: `id`, `name`, `description`, `is_api`, `is_rss`, `is_active`. The provider registry maps directly to these columns.

#### A. Auto-seeding on promote (Component 4b above)

When a company is promoted and its system maps to a registered provider, the board def is auto-created if it doesn't exist. The `isApi` and `isRss` flags come directly from the provider interface:

```ts
[boardDef] = await db.insert(companyJobBoardDefs).values({
  id: crypto.randomUUID(),
  name: provider.displayName,    // "Greenhouse" | "AshbyHQ" | "Gem"
  description: `${provider.displayName} Job Board API`,
  isApi: provider.isApi,          // true for all current providers
  isRss: provider.isRss,          // false for API providers
  isActive: true,
}).returning();
```

#### B. Explicit seeding via config defaults

#### [MODIFY] [config.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/config.ts)

Add board def seed data matching the existing schema:

```ts
const JOB_BOARD_DEF_SEEDS: NewCompanyJobBoardDef[] = [
  { id: crypto.randomUUID(), name: "Greenhouse", description: "Greenhouse Job Board API (boards-api.greenhouse.io)", isApi: true, isRss: false, isActive: true },
  { id: crypto.randomUUID(), name: "AshbyHQ", description: "Ashby Posting API (api.ashbyhq.com)", isApi: true, isRss: false, isActive: true },
  { id: crypto.randomUUID(), name: "Gem", description: "Gem Job Board API (api.gem.com)", isApi: true, isRss: false, isActive: true },
];
```

The config reset/seed route upserts these into `company_job_board_defs` on initialization, using the existing `NewCompanyJobBoardDef` type from the schema.

#### C. Onboarding new providers

When a new provider is added to the registry, its `displayName`, `isApi`, and `isRss` flags are used to auto-create the board def row on first promote. The config seed list should also be updated for explicit initialization.

---

### Component 6: Documentation & Rules Updates

#### [MODIFY] [AGENTS.md](file:///Volumes/Projects/workers/core-resumes/AGENTS.md)

Update:
- **Health Service** section (line 139–143): Add `job_board_api_connectivity` check, note 3 sub-providers
- **"Maintenance Instructions for Greenhouse Agents"** section title (line 346) → rename to **"Maintenance Instructions for Job Board Pipeline Agents"**
- Add a new **"Job Board Provider Registry"** section documenting the provider interface, registry location, and onboarding steps

#### [NEW] [job-board-providers.md](file:///Volumes/Projects/workers/core-resumes/.agent/rules/job-board-providers.md)

Agent rules for the provider registry:

```markdown
# Job Board Provider Registry

## Architecture
- Provider registry: `src/backend/pipeline/job-board-providers/`
- Each provider implements `JobBoardProvider` from `types.ts`
- Tool clients: `src/backend/ai/tools/{greenhouse,ashby,gem}.ts`
- Health checks: `src/backend/health/checks/job-board-apis/`

## Onboarding a New Provider
1. Create `src/backend/ai/tools/<provider>.ts` — scrapeBoard + scrapeJob
2. Create `src/backend/pipeline/job-board-providers/<provider>.ts` implementing JobBoardProvider
3. Add to JOB_BOARD_PROVIDERS array in index.ts
4. Create health check at `src/backend/health/checks/job-board-apis/<provider>.ts`
5. Add `<provider>_tokens: ["known-board"]` to health_check_config defaults
6. Update frontend docs at `src/frontend/content/docs/integrations/job-boards.md`

## Rules
- Never inline ATS-specific scraping in route handlers — use provider.scrapeJob()
- All providers must normalize output to ScrapedPage shape
- Health checks must sample ≤5 tokens with 5s timeout per token
```

#### [MODIFY] [job-boards.md](file:///Volumes/Projects/workers/core-resumes/src/frontend/content/docs/integrations/job-boards.md)

Update:
- Title: "Job Boards (Greenhouse, Ashby, Gem, Lever)" → add Gem
- Add Gem to the Mermaid diagram
- Add Gem platform section (Section 2.D)
- Add Section 5: Provider Registry architecture with onboarding instructions
- Update `date_last_updated`

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/backend/ai/tools/ashby.ts` | **NEW** | AshbyHQ tool client (matching greenhouse.ts pattern) |
| `src/backend/pipeline/job-board-providers/types.ts` | **NEW** | `JobBoardProvider` interface, `NormalizedJobPost`, `TokenTestResult` |
| `src/backend/pipeline/job-board-providers/greenhouse.ts` | **NEW** | Greenhouse provider wrapping existing tool |
| `src/backend/pipeline/job-board-providers/ashby.ts` | **NEW** | Ashby provider wrapping new tool |
| `src/backend/pipeline/job-board-providers/gem.ts` | **NEW** | Gem provider wrapping existing tool |
| `src/backend/pipeline/job-board-providers/index.ts` | **NEW** | Registry barrel: `JOB_BOARD_PROVIDERS[]`, `getProviderByName()` |
| `src/backend/health/checks/job-board-apis/index.ts` | **NEW** | Unified health check entrypoint (aggregates 3 modular checks) |
| `.agent/rules/job-board-providers.md` | **NEW** | Agent rules for provider onboarding |
| `src/backend/health/index.ts` | MODIFY | Replace 3 check registrations with 1 unified |
| `src/backend/api/routes/pipeline/promote.ts` | MODIFY | Use provider registry for scraping + board defs (no Greenhouse fallback) |
| `src/backend/api/routes/config.ts` | MODIFY | Add `JOB_BOARD_DEF_SEEDS` for board def initialization |
| `AGENTS.md` | MODIFY | Add provider registry section, update health service |
| `src/frontend/content/docs/integrations/job-boards.md` | MODIFY | Add Gem, provider registry docs |

## Onboarding a New Provider (Future)

```
1. Create src/backend/ai/tools/<provider>.ts        ← scrapeBoard + scrapeJob
2. Create src/backend/pipeline/job-board-providers/<provider>.ts  ← implements JobBoardProvider
3. Add to JOB_BOARD_PROVIDERS[] in index.ts         ← one line
4. Create src/backend/health/checks/job-board-apis/<provider>-api.ts  ← health check
5. Import in job-board-apis/index.ts                ← one import + one Promise.allSettled entry
6. Add <provider>_tokens to health_check_config     ← config default
7. Add seed row to JOB_BOARD_DEF_SEEDS in config.ts ← board def
8. Update AGENTS.md, .agent/rules, frontend docs    ← documentation
```

> [!TIP]
> Steps 3 and 7 are the only registry additions. The health check (step 5), promote route board def creation, and scraping all happen automatically via the `getProviderByName()` lookup.

## Verification Plan

### Automated Tests
1. `pnpm run build` — confirm TypeScript compilation
2. Health check run — verify `job_board_api_connectivity` appears with per-provider breakdown

### Manual Verification
1. Dashboard health check shows all 3 providers tested uniformly
2. Promote a job from each ATS type → verify `scrapeJob()` works via registry
