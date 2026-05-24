# PRD 0001 — Career Orchestrator Worker

> Product Requirements Document. The authoritative spec for the initial build of `core-resumes`.
> Companion files: [`TASKS.json`](./TASKS.json) (machine-readable task list), [`PROMPT.md`](./PROMPT.md) (coding-agent initializer).

---

## Context

`core-resumes` was scaffolded from a generic Astro + Hono + D1 template (users / sessions / threads / messages / documents / notifications) but is being repurposed into a **single-user Job Application Assistant**. The single user (Justin) needs:

- A dashboard tracking job roles through stages (preparing → applied → interviewing → offer)
- A "Colby" agent that scrapes job postings, drafts tailored resumes / cover letters in Google Docs, consults a personal NotebookLM "Career Notebook," and triages forwarded job-related emails
- An admin UI to manage agent rules, resume bullets, and Drive template IDs

The existing schema and routes don't fit. Confirmed decisions:

- **Drop & reCREATE TABLE IF NOT EXISTS s** (single fresh migration)
- **Route Workers AI through AI Gateway** (caching + observability)
- **Add `NOTEBOOKLM_OAUTH_REFRESH_TOKEN` secret** (NotebookLM API requires user-OAuth, not service-account)
- **Wire email handler** (Cloudflare Email Routing DNS already configured)

The cloudflare-jedi conventions apply: `@hono/zod-openapi` for routes, drizzle-zod for schema-derived validators, AI Gateway for all model calls, dynamic `/openapi.json` + `/scalar` + `/swagger`, dark shadcn UI, `Navbar` everywhere, real data only.

## Modularization Principles (load-bearing)

1. **DB schemas:** one file per table under `db/schemas/{table}.ts`. `db/schema.ts` is a barrel-only re-export.
2. **AI providers:** one provider class per provider (`workers-ai`, future `openai`, etc.). Each owns its auth + transport.
3. **AI models:** each Workers AI model gets its own module under `ai/models/{model-name}.ts` because input schemas vary widely (Llama messages vs Whisper bytes vs BGE text-array vs Aura text vs Llava image+prompt). Strict zod input + output schemas live with the model.
4. **AI tasks:** high-level capabilities (`chat`, `extract`, `draft`, `stream-chat`, `embed`) live under `ai/tasks/` and compose models via the provider.
5. **Hard rule:** routes / agents / tools import only from `ai/tasks/`. Direct `env.AI.run(...)` is forbidden outside the AI layer (enforced via oxlint `no-restricted-imports`).

## Architecture

```
src/
├── _worker.ts                          # /api/* + docs → Hono; email() → handler; else ASSETS; exports OrchestratorAgent DO
├── backend/
│   ├── api/
│   │   ├── index.ts                    # OpenAPIHono app, mounts route modules
│   │   ├── middleware/{auth,error}.ts
│   │   └── routes/{auth,roles,intake,threads,documents,emails,config,dashboard,docs}.ts
│   ├── ai/
│   │   ├── providers/{index,base,workers-ai}.ts
│   │   ├── models/{index,_define,llama-3-3-70b-instruct-fp8-fast,llama-3-1-8b-instruct,bge-large-en-v1-5,whisper,aura-1,llava-1-5-7b-hf}.ts
│   │   ├── tasks/{chat,extract,draft,stream-chat,embed}.ts
│   │   ├── agents/colby.ts
│   │   └── tools/{notebooklm,google-docs,browser-rendering}.ts
│   ├── db/
│   │   ├── index.ts                    # drizzle(env.DB) factory
│   │   ├── schema.ts                   # barrel-only re-export
│   │   └── schemas/{roles,documents,threads,messages,emails,global-config}.ts
│   ├── email/handler.ts
│   └── lib/{google-auth,cookies,crypto}.ts
└── frontend/
    ├── pages/{index,login,roles/index,roles/[id],config,email-associate/[id],docs/[...slug]}.astro
    ├── components/
    │   ├── {Navbar.astro, Sidebar.tsx, ErrorLogger.tsx}
    │   ├── dashboard/{StatCards,JobsByCompanyChart,SalaryRangeChart,PreparingList,PendingTasks,RecentEmails}.tsx
    │   ├── intake/{IntakeModal,IntakeProgress}.tsx
    │   ├── role/{RoleHeader,RoleConfig,ThreadSidebar,DocumentsList}.tsx
    │   ├── config/{AgentRulesEditor,ResumeBulletsEditor,TemplateIdsEditor}.tsx
    │   └── ui/                         # KEEP existing 14 shadcn primitives
    └── lib/{api-client,config,utils}.ts
```

### Files DELETED (existing scaffold remnants)

- `src/frontend/components/{Header,MainNav,MobileNav,Footer,ComponentExample,ThemeToggle,Icons}.tsx`
- `src/frontend/components/HeadSEO.astro`
- `src/backend/api/routes/{auth,dashboard,threads,notifications,documents,health,ai,openapi}.ts` (rebuilt fresh)
- `src/backend/api/middleware/auth.ts` (rebuilt)
- `src/backend/db/schema.ts` (rebuilt as barrel)
- `drizzle/0000_*.sql`, `drizzle/0001_*.sql`, `drizzle/meta/_journal.json` (regenerate single migration)

### Files KEPT (and edited)

- All 14 shadcn primitives in `src/frontend/components/ui/`
- `src/frontend/layouts/BaseLayout.astro` (edit to load `<Navbar />` + `<ErrorLogger />`)
- `src/_worker.ts` (edit: add `email` export + `OrchestratorAgent` DO export)
- `wrangler.jsonc`, `astro.config.ts`, `drizzle.config.ts`, `tsconfig.json`

## 1. Foundation Cleanup & New Dependencies

### `pnpm add`

| Package              | Purpose                                           |
| -------------------- | ------------------------------------------------- |
| `@hono/zod-openapi`  | Route definitions with auto-generated OpenAPI     |
| `drizzle-zod`        | Generate insert/select validators from schema     |
| `agents`             | Cloudflare Agents SDK (Durable Object base class) |
| `notebooklm-sdk`     | NotebookLM client (agmmnn)                        |
| `recharts`           | Dashboard charts                                  |
| `postal-mime`        | Parse incoming `email` ReadableStream             |
| `zod-to-json-schema` | For JSON-mode prompts                             |

> Google Docs/Drive: use bare `fetch` + service-account JWT minted in-worker (no `googleapis` lib — keeps bundle small).

### Add scripts

```json
"db:studio": "drizzle-kit studio",
"types": "wrangler types && tsc --noEmit"
```

`pnpm run deploy` already chains `migrate:remote` + build + deploy — leave it.

## 2. wrangler.jsonc Changes

```jsonc
{
  // ... existing fields ...
  "browser": { "binding": "BROWSER" },
  "send_email": [{ "name": "EMAIL_OUT" }],
  "durable_objects": {
    "bindings": [{ "name": "ORCHESTRATOR_AGENT", "class_name": "OrchestratorAgent" }],
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["OrchestratorAgent"] }],
  "vars": {
    "DEFAULT_MODEL_EMBEDDING": "@cf/baai/bge-large-en-v1.5",
    "PARENT_DRIVE_FOLDER_ID": "1jCokY9_gi3w3_qjdCX8MbnbtZrF9p52j",
    "AI_GATEWAY_ID": "core-resumes",
    "AI_GATEWAY_ACCOUNT_ID": "<inject at deploy>",
    "MODEL_CHAT": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    "MODEL_EXTRACT": "@cf/meta/llama-3.1-8b-instruct",
    "MODEL_DRAFT": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  },
  "secrets_store_secrets": [
    // ... 11 existing entries ...
    {
      "binding": "NOTEBOOKLM_OAUTH_REFRESH_TOKEN",
      "store_id": "8c42fa70938644e0a8a109744467375f",
      "secret_name": "NOTEBOOKLM_OAUTH_REFRESH_TOKEN",
    },
    {
      "binding": "NOTEBOOKLM_OAUTH_CLIENT_ID",
      "store_id": "8c42fa70938644e0a8a109744467375f",
      "secret_name": "NOTEBOOKLM_OAUTH_CLIENT_ID",
    },
    {
      "binding": "NOTEBOOKLM_OAUTH_CLIENT_SECRET",
      "store_id": "8c42fa70938644e0a8a109744467375f",
      "secret_name": "NOTEBOOKLM_OAUTH_CLIENT_SECRET",
    },
    {
      "binding": "NOTEBOOKLM_NOTEBOOK_ID",
      "store_id": "8c42fa70938644e0a8a109744467375f",
      "secret_name": "NOTEBOOKLM_NOTEBOOK_ID",
    },
    {
      "binding": "COOKIE_SIGNING_KEY",
      "store_id": "8c42fa70938644e0a8a109744467375f",
      "secret_name": "COOKIE_SIGNING_KEY",
    },
  ],
}
```

> Email-Routing inbound binding lives in the Cloudflare dashboard (Email Routing → Routes → Send to Worker). Wrangler config only declares outbound `send_email`.

After saving, run `wrangler types` to regenerate `worker-configuration.d.ts`. User must populate the new secrets via `wrangler secrets-store secret create` before first deploy.

## 3. Database Schema (modularized per table)

**`src/backend/db/schema.ts` — barrel only:**

```ts
export * from "./schemas/roles";
export * from "./schemas/documents";
export * from "./schemas/threads";
export * from "./schemas/messages";
export * from "./schemas/emails";
export * from "./schemas/global-config";
```

Each table file follows the same shape: drizzle table definition + drizzle-zod insert/select validators + inferred TS types.

### `src/backend/db/schemas/roles.ts`

```ts
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const roles = sqliteTable(
  "roles",
  {
    id: text("id").primaryKey(), // UUID v4
    companyName: text("company_name").notNull(),
    jobTitle: text("job_title").notNull(),
    jobUrl: text("job_url"),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: text("salary_currency").default("USD"),
    status: text("status", {
      enum: ["preparing", "applied", "interviewing", "offer", "rejected", "withdrawn", "archived"],
    })
      .notNull()
      .default("preparing"),
    driveFolderId: text("drive_folder_id"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    roleInstructions: text("role_instructions"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({ statusIdx: index("roles_status_idx").on(t.status) }),
);

export const insertRoleSchema = createInsertSchema(roles);
export const selectRoleSchema = createSelectSchema(roles);
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
```

### Other tables (full definitions in their own files)

```ts
// schemas/documents.ts
documents: id (PK), gdocId, roleId (FK roles cascade), type ['resume','cover_letter','notes','other'], version, name, createdAt
                  // index on roleId

// schemas/threads.ts
threads:   id (PK), title, roleId (FK roles cascade, nullable for global threads), createdAt

// schemas/messages.ts
messages:  id (PK), threadId (FK threads cascade), roleId (FK roles cascade, nullable),
           author ['user','agent','system'], content, metadata (JSON), timestamp
                  // index on threadId

// schemas/emails.ts
emails:    id (PK), roleId (FK roles set null, nullable), subject, body, sender, rawContent,
           processedStatus ['pending','associated','unmatched','responded','ignored'], receivedAt
                  // index on processedStatus

// schemas/global-config.ts
globalConfig: key (PK), value (JSON), updatedAt
```

### Seeding `global_config`

Seed via one-shot route `POST /api/admin/seed` (auth required):

- `agent_rules` → `string[]` (e.g., "use 'matter management system' instead of internal project names")
- `resume_bullets` → `Array<{ tag: string, text: string }>`
- `template_ids` → `{ resume: string, coverLetter: string, drivePrefix: string }`

### Migration

Delete `drizzle/0000_*.sql`, `drizzle/0001_*.sql`, `drizzle/meta/_journal.json`. Run `pnpm run db:generate` once for a single fresh migration. Apply via `pnpm run migrate:local` or `pnpm run migrate:remote`.

## 4. Auth — Cookie-Based with `WORKER_API_KEY`

`src/backend/api/middleware/auth.ts`:

- `POST /api/auth/login` — body `{ apiKey: string }`. Constant-time compare against `env.WORKER_API_KEY.get()`. On success, mint a signed cookie `cr_session=<base64(payload).hmac(COOKIE_SIGNING_KEY)>`, attributes: `HttpOnly; Secure; SameSite=Lax; Max-Age=63072000; Path=/`.
- `POST /api/auth/logout` — clear cookie.
- Middleware on every `/api/*` (except `/api/auth/login`): read cookie, verify HMAC, check `exp`. Invalid → 401.

Astro pages SSR-check the cookie via `Astro.cookies.get('cr_session')` and redirect to `/login` if missing/invalid.

`src/backend/lib/{cookies,crypto}.ts` use `crypto.subtle` (Web Crypto, no deps).

## 5. AI Layer — Provider / Model / Task

### 5.1 Providers — `src/backend/ai/providers/`

```ts
// base.ts
export interface AIProvider {
  invokeModel<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    opts?: InvokeOpts,
  ): Promise<TOutput>;
  streamModel<TInput>(
    model: ModelDescriptor<TInput, ReadableStream>,
    input: TInput,
    opts?: InvokeOpts,
  ): Promise<ReadableStream<Uint8Array>>;
}
```

`workers-ai.ts` — concrete provider:

- Routes every call through the AI Gateway URL `https://gateway.ai.cloudflare.com/v1/{AI_GATEWAY_ACCOUNT_ID}/{AI_GATEWAY_ID}/workers-ai/{model.id}` with `Authorization: Bearer ${AI_GATEWAY_TOKEN.get()}`.
- Falls back to bound `env.AI` for stream cases the gateway proxies.
- Knows nothing about specific models — defers serialization to model module.

`index.ts` exposes `getProvider(env, name = 'workers-ai'): AIProvider`. Adding `openai` later = one more file.

### 5.2 Models — `src/backend/ai/models/`

⭐ **One file per Workers AI model.** Each exports a `ModelDescriptor` with model id, strict zod input + output schemas, `serialize` (request body builder), and `parseResponse`.

```ts
// models/llama-3-3-70b-instruct-fp8-fast.ts (representative)
export const ChatMessage = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
});
export const Llama33_70bInput = z.object({
  messages: z.array(ChatMessage).min(1),
  max_tokens: z.number().int().positive().max(4096).optional(),
  temperature: z.number().min(0).max(2).optional(),
  response_format: z
    .object({ type: z.literal("json_schema"), json_schema: z.unknown() })
    .optional(),
});
export const Llama33_70bOutput = z.object({ response: z.string() });
export const llama_3_3_70b = defineModel({
  id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  capabilities: ["chat", "json-mode", "streaming"],
  input: Llama33_70bInput,
  output: Llama33_70bOutput,
  serialize: (i) => ({
    messages: i.messages,
    max_tokens: i.max_tokens,
    temperature: i.temperature,
    response_format: i.response_format,
  }),
  parseResponse: (raw) => Llama33_70bOutput.parse(raw.result ?? raw),
});
```

| Model file                           | Input shape                                                 | Use                              |
| ------------------------------------ | ----------------------------------------------------------- | -------------------------------- |
| `llama-3-3-70b-instruct-fp8-fast.ts` | `{ messages, max_tokens?, temperature?, response_format? }` | Chat / draft (large)             |
| `llama-3-1-8b-instruct.ts`           | Same as 70b, smaller token budget                           | Extraction (cheap)               |
| `bge-large-en-v1-5.ts`               | `{ text: string[] }`                                        | Embeddings                       |
| `whisper.ts`                         | `{ audio: number[] \| ArrayBuffer }`                        | STT                              |
| `aura-1.ts`                          | `{ text: string, voice?: string }`                          | TTS (output is `ReadableStream`) |
| `llava-1-5-7b-hf.ts`                 | `{ image: number[], prompt: string, max_tokens? }`          | Vision (OCR'd job listings)      |

`models/index.ts` exports a registry; task → model mapping is overridable via `env.MODEL_*` runtime vars.

### 5.3 Tasks — `src/backend/ai/tasks/`

Model-agnostic, provider-driven helpers. Routes / agents / tools import only from here.

```ts
// tasks/extract.ts
export async function extract<T extends z.ZodTypeAny>(
  env: Env,
  opts: { text: string; schema: T; cacheTtl?: number },
): Promise<z.infer<T>> {
  const provider = getProvider(env);
  const model = modelRegistry.extract;
  const raw = await provider.invokeModel(
    model,
    {
      messages: [
        {
          role: "system",
          content: "Extract structured data per the schema. JSON only.",
        },
        { role: "user", content: opts.text },
      ],
      response_format: {
        type: "json_schema",
        json_schema: zodToJsonSchema(opts.schema),
      },
    },
    { cacheTtl: opts.cacheTtl },
  );
  return opts.schema.parse(JSON.parse(raw.response));
}
```

Tasks: `chat`, `extract`, `draft`, `stream-chat`, `embed`.

### 5.4 Hard Rules

- All agent + route + tool code imports from `src/backend/ai/tasks/`. Direct `env.AI.run(...)` and direct provider/model imports outside `ai/` fail review (oxlint `no-restricted-imports`).
- Adding a new model = one file in `models/` + one entry in registry. Tasks/providers untouched.
- Provider swap = one-line change in factory.

## 6. Colby Agent (Cloudflare Agents SDK)

`src/backend/ai/agents/orchestrator.ts` extends `Agent<Env, OrchestratorState>` from the `agents` package.

DO bound as `ORCHESTRATOR_AGENT`, instances keyed by `roleId` (and a `global` instance for cross-role chat).

### State (DO storage)

- `roleId: string | 'global'`
- `pendingTasks: Array<{ id, type: 'resume_review' | 'cover_letter_draft' | 'email_draft' | 'job_extract', status }>`

### Tools registered

1. `scrape_job(url)` → `tools/browser-rendering.ts`
2. `extract_job_details(text)` → `tasks/extract.ts` with `JobPosting` zod schema
3. `consult_notebook(query)` → `tools/notebooklm.ts` (prepends `agent_rules` from `global_config`)
4. `create_doc_from_template(templateId, vars, folderId)` → `tools/google-docs.ts`
5. `read_doc`, `write_doc`, `comment_on_doc`, `reply_to_thread` → `tools/google-docs.ts`
6. `list_doc_comments_tagged(docId, tag='#colby')` → `tools/google-docs.ts`
7. `list_roles(status?)`, `update_role(id, patch)` → DB
8. `draft_email_reply(emailId)` → `tasks/draft.ts` + persists draft to `messages`

### Orchestration loop

Polls `pendingTasks` on a 30s alarm, processes one task at a time, streams progress via WebSocket back to the open chat (assistant-ui).

## 7. Tools

### 7.1 `tools/browser-rendering.ts`

POST `https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/browser-rendering/scrape` with `Authorization: Bearer ${env.CF_BROWSER_RENDER_TOKEN.get()}`.
Returns `{ html, text, links, screenshotR2Key? }`. Wrapped by `extract_job_details` (feeds text into `tasks/extract.ts`).

### 7.2 `tools/notebooklm.ts`

- Imports `notebooklm-sdk` (agmmnn). Verify isolate compatibility on first install (smoke test in `wrangler dev`).
- Mints Google access token via refresh-token grant from `NOTEBOOKLM_OAUTH_REFRESH_TOKEN` + `_CLIENT_ID` + `_CLIENT_SECRET`. Cached in `KV` keyed by hash, TTL = `expires_in - 60s`.
- `consultNotebook(query)` prepends `agent_rules` from `global_config` as a guardrail.
- Returns citation-aware response.

### 7.3 `tools/google-docs.ts`

- In-worker Service-Account JWT: `GOOGLE_CREDS_SA_PRIVATE_KEY_PT_1` + `_PT_2` joined, signed via `crypto.subtle.sign('RSASSA-PKCS1-v1_5', ...)` (RS256), exchanged at `https://oauth2.googleapis.com/token`. Cached in KV. Helper: `src/backend/lib/google-auth.ts`.
- `GoogleDocsClient`: `createFromTemplate`, `read`, `appendText`, `addComment`, `replyToComment`, `listComments`. All call Drive v3 / Docs v1 REST APIs directly via `fetch`.

## 8. Hono Routes (`@hono/zod-openapi`)

`src/backend/api/index.ts`:

```ts
export const app = new OpenAPIHono<{
  Bindings: Env;
  Variables: { authed: true };
}>();
app.use("/api/*", errorMiddleware);
app.use("/api/*", authMiddleware); // skips /api/auth/login internally
app.route("/api/auth", authRouter);
app.route("/api/roles", rolesRouter);
app.route("/api/intake", intakeRouter);
app.route("/api/threads", threadsRouter);
app.route("/api/documents", documentsRouter);
app.route("/api/emails", emailsRouter);
app.route("/api/config", configRouter);
app.route("/api/dashboard", dashboardRouter);

app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: { title: "Career Orchestrator", version: "1.0.0" },
});
app.get("/scalar", apiReference({ spec: { url: "/openapi.json" } }));
app.get("/swagger", swaggerUI({ url: "/openapi.json" }));
app.get("/docs", (c) => c.redirect("/scalar"));
```

Routers use `createRoute` + `OpenAPIHono#openapi` so OpenAPI is **always dynamic**, derived from drizzle-zod schemas.

### Notable endpoints

- `POST /api/intake/scrape` — SSE stream emitting `{ stage: 'scraping' | 'extracting' | 'mapping', payload }`. Final event = prefilled role record.
- `POST /api/intake/confirm` — persists role, creates Drive folder, dispatches Colby `job_extract` task to draft initial documents.
- `GET /api/dashboard/summary` — stat-card data (counts per status, totals).
- `GET /api/dashboard/by-company` / `/by-salary` — chart datasets.
- `GET /api/threads/:roleId` + `POST /api/threads/:roleId/messages` (SSE for agent responses).
- `GET /api/emails/unmatched` + `POST /api/emails/:id/associate` — email association flow.

## 9. Frontend (Astro + shadcn dark + Recharts)

### 9.1 Foundation

- `BaseLayout.astro` always renders `<Navbar />` + `<ErrorLogger />` islands.
- `Navbar.astro` links: Dashboard, Roles, Config, Docs, OpenAPI, Scalar, Swagger.
- `Sidebar.tsx` collapsible, mobile-responsive.
- `ErrorLogger.tsx` wraps `window.onerror` + `window.onunhandledrejection`, POSTs to `/api/__client-error`.
- All client fetches go through `src/frontend/lib/api-client.ts` — single interceptor adds credentials, surfaces non-2xx as toasts via shadcn `<Toaster />`.

### 9.2 Dashboard (`pages/index.astro`)

- 4 stat cards: Total roles, Preparing, Applied, Interviewing.
- Bar chart (Recharts): roles per company.
- Line chart (Recharts): salary range mid-points over time-of-application.
- Three widget cards: "Preparing to Apply," "Pending Agent Tasks," "Recent Emails."
- All datasets from `/api/dashboard/*`. **No mocks.**

### 9.3 Job Intake Modal (`components/intake/IntakeModal.tsx`)

- Trigger: "+ New Role" button on dashboard navbar.
- shadcn `Dialog` (NEVER `window.prompt`).
- Step 1: URL input + submit.
- Step 2: SSE consumer of `POST /api/intake/scrape`; checklist updates (Scraping ✓ → Extracting ✓ → Mapping ✓).
- Step 3: Pre-filled form (company, title, salary, etc.) with manual overrides → `POST /api/intake/confirm`.

### 9.4 Role Viewport (`pages/roles/[id].astro`)

- Header: company, title, status dropdown, salary range.
- Tabs: Overview | Documents | Threads | Config | Emails.
- `ThreadSidebar.tsx` always visible on the right (assistant-ui chat bound to `ORCHESTRATOR_AGENT` via WebSocket from the Agents SDK).
- `DocumentsList.tsx` shows `documents` rows linked to Google Docs (open-in-new-tab).
- `RoleConfig.tsx` lets user override `role_instructions` (overrides global config).

### 9.5 Global Config (`pages/config.astro`)

- Three editor cards: Agent Rules, Resume Bullets, Template IDs.
- Each persists to `global_config` via `PUT /api/config/:key`.
- shadcn `Textarea`, `Input`, drag-to-reorder for arrays.

### 9.6 Email Association (`pages/email-associate/[id].astro`)

- Linked from auto-reply email when an inbound email can't be matched.
- Shows email subject + sender + first 200 chars.
- Lists active roles (`applied`/`interviewing`) as cards with one-click "Associate" button → `POST /api/emails/:id/associate`.

### 9.7 Tables

All tables use shadcn `Table` with sort + filter (per UX golden rule). The roles table on `/roles` sorts by company / title / status / applied-date and filters by status chips.

## 10. Email Handler

`src/_worker.ts`:

```ts
export default {
  async fetch(request, env, ctx) {
    /* ... */
  },
  async email(message, env, ctx) {
    return await handleInboundEmail(message, env, ctx);
  },
} satisfies ExportedHandler<Env>;
export { OrchestratorAgent } from "./backend/ai/agents/orchestrator";
```

`src/backend/email/handler.ts`:

1. Parse with `postal-mime` → `{ subject, text, from, to, html }`.
2. Persist raw to `emails` (`processedStatus: 'pending'`).
3. Match heuristic: lowercase keyword scan of `subject + text` against `roles.companyName` for roles in `applied`/`interviewing`. Score by hits + recency.
4. **Match found:** update `emails.roleId`, set `associated`, append `messages` row to that role's primary thread (`author: 'system'`, summary content), enqueue Colby `email_draft` task. Don't auto-reply.
5. **No match:** set `unmatched`, send templated reply via `EMAIL_OUT.send()` with link to `/email-associate/{emailId}` + active role names. Plain text body.

## 11. `.agent/` Rules & Workflows

- `.agent/rules/ai-wrapper.md` — All AI must go through `src/backend/ai/tasks/`. Direct `env.AI` calls in agent/tool/route code fail review.
- `.agent/rules/sdk-choice.md` — Use `notebooklm-sdk` (agmmnn) for NotebookLM. Verify isolate compatibility post-install.
- `.agent/rules/google-auth.md` — All Workspace API calls use Service Account + DWD. Refresh tokens in KV, TTL = `expires_in - 60s`.
- `.agent/workflows/implement-feature.md` — Order: D1 schema → AI Provider/Model/Tasks → Tools → Agent → Hono routes → Frontend. Stitch mockups before frontend (per cloudflare-jedi).
- `/AGENTS.md` at repo root — project briefing for Jules delegation.

## 12. Verification

1. **Types + lint:** `pnpm run cf-typegen && pnpm run check && tsc --noEmit`.
2. **DB:** `pnpm run migrate:local`, then `wrangler d1 execute DB --local --command "select name from sqlite_master where type='table'"` — confirm 6 tables (`roles`, `documents`, `threads`, `messages`, `emails`, `global_config`).
3. **Local dev:** `pnpm run dev` (Astro) + `wrangler dev` (worker) in another terminal.
4. **Auth:** `POST /api/auth/login` with `WORKER_API_KEY` → `Set-Cookie` returned; subsequent `/api/dashboard/summary` returns 200; clear cookie → 401.
5. **OpenAPI:** Visit `/scalar` and `/swagger` — confirm all routes appear with schemas auto-derived from drizzle-zod.
6. **Intake flow:** dashboard → "+ New Role" → real LinkedIn URL → SSE progress → form prefilled → row persists.
7. **Colby agent:** role viewport → "draft a resume bullet about my AWS work" → NotebookLM tool fires (visible in AI Gateway dashboard), `documents` row + Drive doc created.
8. **Email handler:** forward a matching email → `emails` + `messages` rows added, status `associated`. Forward unrelated email → auto-reply received with association link.
9. **AI Gateway:** confirm dashboard shows requests with model labels.
10. **Production deploy:** `pnpm run deploy` — migrations apply remote, worker boots without binding errors.

## Out of Scope

- No multi-user support (cookie auth = single user via `WORKER_API_KEY`).
- No PlateJS editor (existing `slate`/`platejs` deps stay until next cleanup; not used in new UI).
- No automated email _sending_ of resumes — Colby drafts in `messages`, user manually sends.
- Stitch mockup pass: skipped here because the user provided a detailed UI spec; can be added as a follow-up if visual exploration is wanted.
