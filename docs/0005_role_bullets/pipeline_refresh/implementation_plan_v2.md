# Role Intelligence Pipeline — Deep Analysis & Career Strategy

Expand the role analysis pipeline from simple bullet scoring into a full **Role Intelligence Engine** that produces interview prep, resume bullet ideation, cross-bullet pattern recognition, and **career pivot strategy analysis** — all orchestrated via Cloudflare `AgentWorkflow` for real-time frontend progress.

## The Credential Gap & Career Pivot Context

> [!IMPORTANT]
> **Critical Domain Context — "JD" in this system means "Juris Doctor" (Law Degree), NOT "Job Description"**
>
> Justin has 13+ years in Legal Operations at Google, but his actual work has always been technology: Product Management, Program Management, Software Engineering, ETL pipelines, dashboards, proof-of-concepts, workflow automation, and enterprise system architecture. He wore all of those hats while partnering with Corporate Engineering, yet his titles remained in the Legal Ops lane (Legal Specialist → Discovery Ops Specialist → Discovery PM → Business Program Manager, Generalist).
>
> **The Career Pivot Problem:**
> - Hiring managers outside Legal don't understand what "someone in Legal doing tech" means
> - His 13-year Legal Ops tenure makes it progressively harder to pivot to explicit tech titles (SWE, PM, TPM)
> - His last Google title (Business Program Manager, Generalist) was forced on him despite being offered Software Engineer — his manager refused to file the paperwork, creating a title/work mismatch that contributed to his layoff
> - Many Legal AI roles (e.g., Harvey.ai's "Legal Engineer") require a Juris Doctor (JD) which he doesn't have and won't pursue
>
> **What the analysis pipeline must evaluate for EVERY role:**
>
> 1. **Legal Ops Gravity** — Does this role dig deeper into the Legal Ops career trajectory, making an eventual pivot harder? Or does it provide a strategic launchpad?
> 2. **Title Alignment** — Does the role title reflect the actual tech work (SWE, PM, TPM), or does it perpetuate the Legal Ops title trap?
> 3. **Credential Gap Risk** — Does the role require a JD (Juris Doctor) or other credential Justin lacks? What's the realistic likelihood of convincing the hiring manager to interview without it?
> 4. **Pivot Pathways** — Whether the role is in Legal or outside it, generate 1/2/5/10-year strategic career paths that leverage the role as a stepping stone toward the goal of a tech title with full career mobility
> 5. **Company Leverage** — Some Legal Ops roles at hot companies (e.g., Anthropic, Harvey.ai) may be worth taking specifically because the company's brand, growth trajectory, or internal mobility culture could accelerate the pivot

---

## Proposed Changes

### Database Schema — 4 Schema Files + 1 Barrel Update

---

#### [MODIFY] [role-bullet-analyses.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/role-bullet-analyses.ts)

Add two new columns:

| Column | Type | Purpose |
|--------|------|---------|
| `interview_tip` | text (nullable) | Forward-looking advice: how to speak to this bullet if asked in an interview |
| `mitigation_strategy` | text (nullable) | For low-scoring bullets: how to reframe the gap or bridge with transferable experience |

Update `ROLE_BULLET_ANALYSES_COLUMN_DESCRIPTIONS` accordingly.

---

#### [NEW] [role-resume-bullets.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/role-resume-bullets.ts)

New table `role_resume_bullets` — potential customized resume lines that could be used when drafting a resume for this role. **No direct FK to role_bullets** — the M:M mapping lives in a separate table below.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK auto | — |
| `role_id` | text FK → `roles.id` | Which role this resume bullet is associated with |
| `potential_resume_bullet` | text | The actual line that would appear on the resume |
| `source` | text enum | `resume_bullets` · `role_resume_bullets` · `agent_generated` |
| `ai_rationale` | text | Why this resume bullet was selected/generated and is associated with the mapped role bullet(s) |
| `interview_tip` | text (nullable) | How this resume bullet creates an interview opportunity |
| `category` | text | Strategic · Technical · Impact · Collaboration |
| `impact` | text (nullable) | e.g., "$16M annual savings", "300% adoption" |
| `created_at` | integer timestamp | — |

**Source enum values:**
- `resume_bullets` — pulled verbatim from the user's `resume_bullets` config inventory
- `role_resume_bullets` — sourced from a prior role's `role_resume_bullets` records (cross-role intelligence)
- `agent_generated` — AI created this bullet fresh during this analysis run

Indexes: `role_id`, `source`.

---

#### [NEW] [role-resume-bullets-map.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/role-resume-bullets-map.ts)

New M:M mapping table `role_resume_bullets_role_bullet_map` — links resume bullets ↔ role bullets. A single well-written resume bullet can satisfy multiple role requirements.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK auto | — |
| `resume_bullet_id` | integer FK → `role_resume_bullets.id` | The potential resume bullet |
| `role_bullet_id` | integer FK → `role_bullets.id` | The JD requirement it addresses |

Indexes: `resume_bullet_id`, `role_bullet_id`, unique composite `(resume_bullet_id, role_bullet_id)`.

---

#### [NEW] [role-bullet-patterns.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/role-bullet-patterns.ts)

Two tables for cross-bullet pattern intelligence:

**`role_bullet_patterns`** — holistic observations across bullets

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK auto | — |
| `role_id` | text FK → `roles.id` | — |
| `observation` | text | Pattern detected (e.g., "no-code/low-code emphasis spans 4 of 6 bullet categories") |
| `recommendation` | text | Actionable advice for downstream agents building resumes, cover letters, podcasts, interview prep |
| `insight` | text | Strategic insight for the frontend (what this signals about the role's priorities and hiring manager expectations) |
| `created_at` | integer timestamp | — |

**`role_bullet_pattern_map`** — M:M linking patterns ↔ bullets

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK auto | — |
| `pattern_id` | integer FK → `role_bullet_patterns.id` | — |
| `role_bullet_id` | integer FK → `role_bullets.id` | — |

---

#### [MODIFY] [schema.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schema.ts)

Add barrel exports for the 3 new schema files: `role-resume-bullets`, `role-resume-bullets-map`, `role-bullet-patterns`.

---

### Pipeline Orchestration — AgentWorkflow Architecture

> [!IMPORTANT]
> **Architecture Decision: `AgentWorkflow` via Cloudflare Agents SDK**
>
> After reviewing [Cloudflare Agents SDK Workflows docs](file:///Volumes/Projects/workers/core-resumes/docs/cloudflare-docs/agents-llm-full.md):
>
> - Agents run on Durable Objects — they are inherently long-lived, not bound by Worker 30s CPU limits
> - `AgentWorkflow` adds **durable multi-step execution** with independent 30-min timeout per step, automatic retries with exponential backoff
> - `this.reportProgress()` → triggers `onWorkflowProgress()` on the Agent → broadcasts to WebSocket clients → `RoleProcessingStatus.tsx` shows step-by-step progress
> - `step.mergeAgentState()` provides durable state sync that broadcasts to all connected clients
> - The `OrchestratorAgent` orchestrates workflows via `this.runWorkflow("ROLE_ANALYSIS_WORKFLOW", params)` and handles lifecycle callbacks

#### [NEW] [role-analysis-workflow.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/workflows/role-analysis-workflow.ts)

A 4-step `AgentWorkflow` replacing the monolithic `analyzeRole()`:

```
Step 1: "score-bullets" (30 min timeout, 3 retries)
├── Load role_bullets, query NotebookLM per type
├── Score each bullet → { score, rationale, interview_tip, mitigation_strategy }
├── Persist to role_bullet_analyses
└── reportProgress({ step: "score-bullets", status: "complete", percent: 0.25 })

Step 2: "holistic-analysis" (30 min timeout, 3 retries)
├── Load Phase 1 scored bullets as context
├── Generate holistic analysis (hire_likelihood, hook, strategy, counter_positioning)
├── Generate career pivot analysis (legal_ops_gravity, credential_gap, pivot_pathways)
├── Persist to role_analyses + role_alignment_scores
└── reportProgress({ step: "holistic-analysis", status: "complete", percent: 0.50 })

Step 3: "resume-bullet-ideation" (30 min timeout, 3 retries)
├── Load user's resume_bullets from config (verified inventory)
├── Load role_resume_bullets from previous roles (cross-role intelligence)
├── For each role_bullet, match/generate resume bullets
├── Persist to role_resume_bullets + role_resume_bullets_role_bullet_map
└── reportProgress({ step: "resume-ideation", status: "complete", percent: 0.75 })

Step 4: "pattern-recognition" (30 min timeout, 3 retries)
├── Load all role_bullet_analyses (scores, rationale, tips)
├── Identify thematic clusters, scoring inconsistencies, strategic signals
├── Persist to role_bullet_patterns + role_bullet_pattern_map
├── step.reportComplete(result)
└── reportProgress({ step: "pattern-recognition", status: "complete", percent: 1.0 })
```

#### [MODIFY] [orchestrator/index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/orchestrator/index.ts)

- Add `onWorkflowProgress`, `onWorkflowComplete`, `onWorkflowError` lifecycle handlers
- These broadcast workflow progress to all connected WebSocket clients for real-time frontend updates
- Update `handleProcessPendingTasks` to call `this.runWorkflow("ROLE_ANALYSIS_WORKFLOW", ...)` instead of directly calling `analyzeRole()`

#### [MODIFY] [wrangler.jsonc](file:///Volumes/Projects/workers/core-resumes/wrangler.jsonc)

Add the workflow binding:

```jsonc
"workflows": [
  {
    "name": "role-analysis-workflow",
    "binding": "ROLE_ANALYSIS_WORKFLOW",
    "class_name": "RoleAnalysisWorkflow"
  }
]
```

Run `pnpm run cf-typegen` after.

---

### AI Task Changes

#### [MODIFY] [analyze-role.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/analyze-role.ts)

**Phase 1 Schema Update — add `interview_tip` and `mitigation_strategy`:**

```typescript
const BulletScoringSchema = z.object({
  scores: z.array(
    z.object({
      bullet_id: z.number(),
      score: z.number().int().min(0).max(100),
      rationale: z.string(),
      interview_tip: z.string().describe(
        "Specific, actionable interview talking point. Reference concrete metrics or projects. NOT generic advice."
      ),
      mitigation_strategy: z.string().nullable().describe(
        "For scores below 75: how to bridge this gap using transferable experience. null if score >= 75."
      ),
    }),
  ),
});
```

**Phase 2 Schema Update — add career pivot analysis fields:**

Add to `HolisticAnalysisSchema`:

```typescript
career_pivot_analysis: z.object({
  legal_ops_gravity_score: z.number().int().min(0).max(100)
    .describe("0 = pure tech role (no legal lock-in), 100 = deep legal ops entrenchment"),
  legal_ops_gravity_rationale: z.string(),
  credential_gap: z.object({
    requires_jd: z.boolean().describe("Does the role explicitly require a Juris Doctor (law degree)?"),
    jd_workaround_likelihood: z.number().int().min(0).max(100)
      .describe("Likelihood of getting an interview without the JD credential (0-100)"),
    jd_workaround_strategy: z.string()
      .describe("How to convince the hiring manager that builder experience > credentials"),
  }),
  title_alignment: z.object({
    posted_title: z.string(),
    actual_work_type: z.enum(["software_engineering", "product_management", "program_management", "legal_ops", "hybrid_tech_legal", "other"]),
    title_advancement: z.boolean()
      .describe("Would this title be an improvement over 'Business Program Manager, Generalist'?"),
  }),
  pivot_pathways: z.array(z.object({
    horizon: z.enum(["1_year", "2_year", "5_year", "10_year"]),
    strategy: z.string(),
    target_title: z.string(),
    leverage_points: z.string()
      .describe("How to leverage this role + legal ops background to reach the target"),
  })),
})
```

#### [NEW] [generate-resume-bullets.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/generate-resume-bullets.ts)

Phase 3 AI task. The prompt will:

1. Receive the user's `resume_bullets` from config as the verified inventory
2. Receive `role_resume_bullets` from prior roles for cross-role intelligence
3. Receive the scored `role_bullets` with their Phase 1 analysis
4. For each role_bullet, match the best existing resume bullets and/or generate new tailored ones
5. Classify source as `resume_bullets`, `role_resume_bullets`, or `agent_generated`
6. Extract `impact` metric and `category`
7. Return the M:M mappings (one resume bullet → multiple role_bullets it addresses)

#### [NEW] [recognize-patterns.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/recognize-patterns.ts)

Phase 4 AI task. Receives ALL scored bullets and asks the LLM to:

1. Identify thematic clusters (e.g., "no-code/low-code appears in bullets #22, #28, #35, #38 across KEY_RESPONSIBILITY, REQUIRED_QUALIFICATION, and PREFERRED_QUALIFICATION")
2. Flag scoring inconsistencies within clusters and recommend normalization
3. Generate strategic recommendations for downstream agents (resume, cover letter, interview, podcast)
4. Return the pattern → bullet ID mappings for the M:M table

---

### Documentation Updates

#### [MODIFY] [AGENTS.md](file:///Volumes/Projects/workers/core-resumes/AGENTS.md)

Update the **Hireability Analysis** section to document:

- The 4-step `AgentWorkflow` pipeline (replacing the current monolithic description)
- New tables: `role_resume_bullets`, `role_resume_bullets_role_bullet_map`, `role_bullet_patterns`, `role_bullet_pattern_map`
- Updated `role_bullet_analyses` columns
- The career pivot analysis context (Legal Ops Gravity, Credential Gap, Title Alignment, Pivot Pathways)

Add a new **Career Pivot Strategy** section documenting:

- The "JD" (Juris Doctor) credential gap problem
- The Legal Ops career gravity concept
- The title alignment tracking (actual work vs posted title)
- How the AI generates 1/2/5/10 year pivot pathways
- The downstream agent consumption model (resume/cover letter/interview agents consult patterns + pivot analysis)

Add a new **AgentWorkflow Integration** section documenting:

- `RoleAnalysisWorkflow` binding and lifecycle
- `onWorkflowProgress` / `onWorkflowComplete` / `onWorkflowError` handlers on `OrchestratorAgent`
- How `wrangler.jsonc` must be updated with the workflow binding

#### [NEW] [.agent/rules/role-analysis.md](file:///Volumes/Projects/workers/core-resumes/.agent/rules/role-analysis.md)

New agent rule file covering:

- The 4-phase workflow pipeline (score → holistic → resume ideation → pattern recognition)
- Career pivot analysis requirements (Legal Ops Gravity, Credential Gap, Pivot Pathways)
- The "JD means Juris Doctor" disambiguation
- Prompt engineering rules for the new phases
- Schema ownership: which tables belong to which phase

#### [MODIFY] [.agent/rules/ai-prompts.md](file:///Volumes/Projects/workers/core-resumes/.agent/rules/ai-prompts.md)

Add guidance on:

- Career pivot analysis prompt structure
- Credential gap assessment framing
- How to instruct the LLM to generate realistic pivot pathways (not generic career advice)

#### [MODIFY] [src/frontend/content/docs/role-insights.md](file:///Volumes/Projects/workers/core-resumes/src/frontend/content/docs/role-insights.md)

Update to document the expanded pipeline, adding sections on:

- Career Pivot Analysis dimension (alongside Location, Compensation, Combined)
- Resume Bullet Ideation pipeline
- Pattern Recognition pipeline

#### [NEW] [src/frontend/content/docs/role-analysis-pipeline.md](file:///Volumes/Projects/workers/core-resumes/src/frontend/content/docs/role-analysis-pipeline.md)

New dedicated docs page with:

- Mermaid diagram of the 4-step `AgentWorkflow` pipeline
- Table schemas and relationships (ERD-style mermaid)
- Career pivot context explanation
- API reference for new endpoints
- WebSocket event reference for real-time progress

---

### Frontend Updates (Deferred — Phase 2)

> [!NOTE]
> Frontend component work is scoped for a follow-up plan after the backend pipeline is stable:
> - `RoleProcessingStatus.tsx` — consume workflow progress events for step-by-step status
> - `AlignmentBreakdown.tsx` — show `interview_tip` and `mitigation_strategy` per bullet
> - New `ResumeIdeation.tsx` — browse/filter suggested resume bullets by role requirement
> - New `PatternInsights.tsx` — display cross-cutting patterns with linked bullet cards
> - New `CareerPivotAnalysis.tsx` — show Legal Ops Gravity gauge, credential gap assessment, and pivot pathway timeline

---

## Execution Order

1. **Schema files** — Create/modify the 4 Drizzle schema files + barrel export
2. **Migrations** — `pnpm run db:generate` + `pnpm run db:migrate:local`
3. **AI tasks** — Modify `analyze-role.ts`, create `generate-resume-bullets.ts` and `recognize-patterns.ts`
4. **AgentWorkflow** — Create `role-analysis-workflow.ts`, update `wrangler.jsonc`, run `pnpm run cf-typegen`
5. **Orchestrator** — Update `orchestrator/index.ts` with workflow lifecycle handlers
6. **Documentation** — Update `AGENTS.md`, create `.agent/rules/role-analysis.md`, update `ai-prompts.md`, create frontend docs page with diagrams
7. **Build verification** — `pnpm run build`

## Verification Plan

### Automated
1. `pnpm run db:generate` — verify Drizzle migrations generate cleanly
2. `pnpm run build` — verify TypeScript compilation
3. Deploy to staging and trigger a role analysis via `OrchestratorAgent.enqueueTask({ type: "role_analysis", roleId })`

### Manual
1. Verify `role_bullet_analyses` rows contain `interview_tip` and `mitigation_strategy`
2. Verify `role_resume_bullets` populates with a mix of sources + M:M mappings in the map table
3. Verify `role_bullet_patterns` correctly links to multiple bullets via the pattern map table
4. Verify `role_analyses` contains the new `career_pivot_analysis` JSON
5. Monitor WebSocket broadcasts for step-by-step workflow progress on the frontend
6. Review AGENTS.md and frontend docs for accuracy and completeness
