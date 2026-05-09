# Bullet Analysis Pipeline Expansion — Deep Role Intelligence

Expand the role analysis pipeline from a simple score + rationale to a full intelligence engine that produces interview prep, resume bullet ideation, and cross-bullet pattern recognition — all orchestrated via Cloudflare `AgentWorkflow` for real-time frontend progress visibility.

## Background & Motivation

The Gemini Canvas prompts revealed a key gap: our current Phase 1 bullet scoring has "blinders on" — each bullet is scored in isolation. When a theme like **no-code/low-code** appears across `KEY_RESPONSIBILITY` bullet #22, `REQUIRED_QUALIFICATION` bullet #28, and `PREFERRED_QUALIFICATION` bullets #35 and #38, the AI scores them independently and may produce inconsistent rationale, scores, and strategic advice. The pattern recognition sweep fixes this by:

1. Detecting thematic clusters across all bullet types
2. Normalizing scoring consistency within a cluster
3. Generating cross-cutting strategic recommendations that downstream agents (resume, cover letter, interview, podcast) can consume

## Proposed Changes

### Database Schema — 4 Schema Files

---

#### [MODIFY] [role-bullet-analyses.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/role-bullet-analyses.ts)

Add two new columns to the existing table:

| Column | Type | Purpose |
|--------|------|---------|
| `interview_tip` | text (nullable) | Forward-looking advice: how to speak to this bullet if asked |
| `mitigation_strategy` | text (nullable) | For low-scoring bullets: how to reframe or bridge the gap |

Update `ROLE_BULLET_ANALYSES_COLUMN_DESCRIPTIONS` to document the new columns.

---

#### [NEW] [role-resume-bullets.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/role-resume-bullets.ts)

New table `role_resume_bullets` — potential resume lines mapped to specific JD requirements.

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK auto | — |
| `role_bullet_id` | integer FK → `role_bullets.id` | Which JD requirement this resume bullet addresses |
| `potential_resume_bullet` | text | The actual line that would appear on the resume |
| `source` | text enum | `verbatim_config` · `modified_config` · `past_role` · `ai_generated` |
| `ai_rationale` | text | Why this bullet was selected or generated |
| `interview_tip` | text (nullable) | How this resume bullet creates an interview opportunity |
| `category` | text | Strategic · Technical · Impact · Collaboration |
| `impact` | text (nullable) | e.g., "$16M annual savings", "300% adoption" |
| `created_at` | integer timestamp | — |

Indexes: `role_bullet_id`, composite `(role_bullet_id, source)`.

---

#### [NEW] [role-bullet-patterns.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schemas/role-bullet-patterns.ts)

Two tables for cross-bullet pattern intelligence:

**`role_bullet_patterns`** — holistic observations across bullets

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK auto | — |
| `role_id` | text FK → `roles.id` | — |
| `observation` | text | Pattern detected (e.g., "no-code/low-code emphasis in 4/6 categories") |
| `recommendation` | text | Actionable advice for downstream agents building resumes/cover letters/podcasts |
| `insight` | text | Strategic insight for the frontend (what this signals about the role and hiring manager priorities) |
| `created_at` | integer timestamp | — |

**`role_bullet_pattern_map`** — M:M relationship linking patterns ↔ bullets

| Column | Type | Description |
|--------|------|-------------|
| `id` | integer PK auto | — |
| `pattern_id` | integer FK → `role_bullet_patterns.id` | — |
| `role_bullet_id` | integer FK → `role_bullets.id` | — |

---

#### [MODIFY] [schema.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/schema.ts)

Add barrel exports for the 2 new schema files.

---

### Pipeline Orchestration — AgentWorkflow Architecture

> [!IMPORTANT]
> **Architecture Decision: `AgentWorkflow`**
> 
> After reviewing the [Cloudflare Agents SDK Workflows docs](file:///Volumes/Projects/workers/core-resumes/docs/cloudflare-docs/agents-llm-full.md), `AgentWorkflow` is the correct primitive here. Key advantages:
> 
> - **30 min per step** — each LLM call gets its own step with independent timeout
> - **Automatic retries** — `step.do("name", { retries: { limit: 3, delay: "10 seconds", backoff: "exponential" } }, fn)` handles AI Gateway intermittent failures
> - **Durable state sync** — `step.mergeAgentState()` broadcasts progress to connected WebSocket clients (our `RoleProcessingStatus.tsx` component)
> - **Agent RPC** — the workflow has a typed `this.agent` stub back to the `OrchestratorAgent` for persistence calls
> - **Real-time frontend** — `this.reportProgress()` + `this.broadcastToClients()` give granular step-by-step visibility that our current `ctx.waitUntil()` approach can't provide
> 
> The `OrchestratorAgent` will orchestrate workflows via `this.runWorkflow("ROLE_ANALYSIS_WORKFLOW", params)` and handle lifecycle callbacks (`onWorkflowProgress`, `onWorkflowComplete`, `onWorkflowError`).

#### [NEW] [role-analysis-workflow.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/workflows/role-analysis-workflow.ts)

A 4-step `AgentWorkflow` that replaces the current monolithic `analyzeRole()` function:

```
Step 1: "score-bullets"
├── Load role_bullets, query NotebookLM per type
├── Score each bullet → { score, rationale, interview_tip, mitigation_strategy }
├── Persist to role_bullet_analyses
└── reportProgress({ step: "score-bullets", status: "complete", percent: 0.25 })

Step 2: "holistic-analysis"  
├── Load Phase 1 scored bullets as context
├── Generate holistic analysis (hire_likelihood, hook, strategy, counter_positioning)
├── Persist to role_analyses + role_alignment_scores
└── reportProgress({ step: "holistic-analysis", status: "complete", percent: 0.50 })

Step 3: "resume-bullet-ideation"
├── Load resume_bullets from config (the user's verified inventory)
├── Load role_resume_bullets from previous roles (for cross-role intelligence)
├── For each role_bullet, ask AI to match/generate resume bullets
├── Persist to role_resume_bullets
└── reportProgress({ step: "resume-ideation", status: "complete", percent: 0.75 })

Step 4: "pattern-recognition"
├── Load all role_bullet_analyses (with scores, rationale, tips)
├── Ask AI to identify thematic clusters, scoring inconsistencies, strategic signals
├── Persist to role_bullet_patterns + role_bullet_pattern_map
├── step.reportComplete(result)
└── reportProgress({ step: "pattern-recognition", status: "complete", percent: 1.0 })
```

#### [MODIFY] [orchestrator/index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/orchestrator/index.ts)

- Add `onWorkflowProgress`, `onWorkflowComplete`, `onWorkflowError` lifecycle handlers
- These will broadcast to WebSocket clients, enabling real-time frontend updates
- The existing `handleProcessPendingTasks` will be updated to call `this.runWorkflow("ROLE_ANALYSIS_WORKFLOW", ...)` instead of directly calling `analyzeRole()`

#### [MODIFY] [wrangler.jsonc](file:///Volumes/Projects/workers/core-resumes/wrangler.jsonc)

Add the new workflow binding:

```jsonc
"workflows": [
  {
    "name": "role-analysis-workflow",
    "binding": "ROLE_ANALYSIS_WORKFLOW",
    "class_name": "RoleAnalysisWorkflow"
  }
]
```

---

### AI Task Changes

#### [MODIFY] [analyze-role.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/analyze-role.ts)

**Phase 1 Schema Update:**

```typescript
const BulletScoringSchema = z.object({
  scores: z.array(
    z.object({
      bullet_id: z.number(),
      score: z.number().int().min(0).max(100),
      rationale: z.string(),
      interview_tip: z.string().describe(
        "Actionable advice for how to speak to this requirement in an interview. Reference specific evidence."
      ),
      mitigation_strategy: z.string().nullable().describe(
        "For scores below 75: how to bridge this gap or reframe the narrative. null if score >= 75."
      ),
    }),
  ),
});
```

**Phase 1 System Prompt Addition:**

```
For EACH bullet, also provide:
- interview_tip: A specific, actionable interview talking point. NOT generic advice.
  Reference specific metrics ($16M, 300%, 70%) or projects (BumbleBee, DOTS, MatterSpace).
- mitigation_strategy: If score < 75, explain how to bridge the gap. If score >= 75, set to null.
```

#### [NEW] [generate-resume-bullets.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/generate-resume-bullets.ts)

New AI task for Phase 3 resume bullet ideation. The prompt will:

1. Receive the full list of user's `resume_bullets` (from config) as the baseline inventory
2. Receive the scored `role_bullets` with their analysis
3. For each role_bullet, identify the best matching resume bullet(s) or generate new ones
4. Classify each as `verbatim_config`, `modified_config`, `past_role`, or `ai_generated`
5. Extract the `impact` metric and `category`

#### [NEW] [recognize-patterns.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/recognize-patterns.ts)

New AI task for Phase 4 pattern recognition. The prompt will receive ALL scored bullets and ask the LLM to:

1. Identify thematic clusters (e.g., "no-code/low-code appears in bullets #22, #28, #35, #38")
2. Flag scoring inconsistencies within clusters and recommend normalization
3. Generate strategic recommendations for downstream agents
4. Return the pattern → bullet ID mappings for the M:M table

---

### Frontend Updates (Deferred — Phase 2)

> [!NOTE]
> Frontend changes will be scoped in a follow-up plan after the backend pipeline is stable. Key surfaces to update:
> - `RoleProcessingStatus.tsx` — consume workflow progress events for step-by-step status
> - `AlignmentBreakdown.tsx` — show `interview_tip` and `mitigation_strategy` per bullet
> - New `ResumeIdeation.tsx` component — browse/filter suggested resume bullets by role requirement
> - New `PatternInsights.tsx` component — display cross-cutting patterns with linked bullet cards

---

## Verification Plan

### Automated
1. `pnpm run db:generate` — verify Drizzle migrations generate cleanly
2. `pnpm run build` — verify TypeScript compilation with new schemas
3. Deploy to staging and trigger a role analysis via `OrchestratorAgent.enqueueTask({ type: "role_analysis", roleId })`

### Manual
1. Verify `role_bullet_analyses` rows now contain `interview_tip` and `mitigation_strategy`
2. Verify `role_resume_bullets` populates with a mix of sources
3. Verify `role_bullet_patterns` correctly links to multiple bullets via the map table
4. Monitor WebSocket broadcasts for step-by-step workflow progress on the frontend
