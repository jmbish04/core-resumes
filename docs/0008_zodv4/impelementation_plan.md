# Fix AI Structured Output + Enhanced Commute Analysis

## Root Cause (CONFIRMED via local testing)

**`zod-to-json-schema@3.25.2` is incompatible with `zod@4.4.2`.** The library is deprecated and does not support Zod v4's internal schema representation. Every call to `zodToJsonSchema()` produces **`{}`** (empty object) as the JSON schema sent to the AI model.

```
$ npx tsx -e "zodToJsonSchema(z.object({ name: z.string() }), 'Test')"
→ { definitions: { Test: {} } }   // ← EMPTY! No properties, no types
```

This means **every** `generateStructuredOutput()` and `generateStructuredAnalysis()` call sends an empty schema to the model. The model then has zero guidance on what fields to produce, leading to:
- **Inconsistent failures** — simpler prompts sometimes work by luck (the model guesses the format from the text prompt), but complex schemas like `LocationInsightSchema` consistently fail
- **Zod validation errors** — `received undefined` for `rationale`, `commute_table`, `workplace_assessment`, `score`

> [!CAUTION]
> This affects ALL structured output calls system-wide, not just the health check. Production role extraction, compensation analysis, and email classification may also be silently degraded. The fix is critical.

### Fix: Replace with Zod v4 Native `z.toJSONSchema()`

Zod v4 has built-in JSON Schema conversion. Verified locally:
```
$ npx tsx -e "z.toJSONSchema(LocationInsightSchema)"
→ { type: "object", properties: { score: { type: "integer", minimum: 0, maximum: 100 }, ... }, required: [...] }
```

---

## Proposed Changes

### 1. AI Provider — Replace `zodToJsonSchema` with `z.toJSONSchema`

#### [MODIFY] [index.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/providers/index.ts)

- Remove `import { zodToJsonSchema } from "zod-to-json-schema"` 
- Add `import { z } from "zod"`
- Replace `zodToJsonSchema(opts.schema, schemaName)` → `z.toJSONSchema(opts.schema)` in both `generateStructuredOutput()` and `generateStructuredAnalysis()`
- Remove the `definitions` unwrapping logic (Zod v4's native output is flat, no `$ref`/`definitions` wrapping)
- Strip `$schema` key from the output (the AI model doesn't need the meta-schema URI)

---

### 2. Browser Rendering JSON Extraction — Fix Schema Conversion

#### [MODIFY] [scrape.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/orchestrator/methods/jobs/scrape.ts)

- Remove `import { zodToJsonSchema } from "zod-to-json-schema"`
- Replace with `z.toJSONSchema(JobPosting)` for the `captureJSON` response format
- Remove `definitions` unwrapping logic

#### [MODIFY] [extraction-fidelity.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/health/checks/extraction-fidelity.ts)

- Same pattern: replace `zodToJsonSchema` → `z.toJSONSchema`
- Remove `definitions` unwrapping

---

### 3. Remove Deprecated Dependency

After the code changes, remove `zod-to-json-schema` from `package.json` since it's fully replaced by Zod v4's native capability.

---

### 4. Enhanced Commute Table Schema

#### [MODIFY] [role-insights.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/role-insights.ts)

Update `LocationInsightSchema.commute_table` to request time-specific departure data:

**New schema:**
```typescript
commute_table: z.array(
  z.object({
    direction: z.enum(["to_office", "to_home"]),
    departure_time: z.string().describe("e.g. '8:30 AM', '5:00 PM'"),
    mode: z.string().describe("e.g. 'Driving (Tesla Model 3)', 'BART + Walk', 'Muni + Walk'"),
    duration_minutes: z.number().nullable(),
    monthly_cost: z.number().nullable().describe("Estimated monthly cost for this commute mode at this frequency"),
  }),
)
```

**Update the prompt** to explicitly request these time slots:
- **Morning departures (to office):** 8:30 AM, 9:00 AM, 9:30 AM, 10:00 AM
- **Evening departures (to home):** 4:00 PM, 4:30 PM, 5:00 PM, 5:30 PM, 6:00 PM
- **Modes:** Driving (Tesla Model 3), BART + Walk (door-to-door), Muni + Walk (door-to-door)

Update `LocationAnalysisPayload` type to match the new commute table structure.

---

### 5. California Location Extraction (Multi-City Jobs)

#### [MODIFY] [types.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/orchestrator/types.ts)

Add to `JobPostingSchema`:
```typescript
allLocations: z.array(z.string()).nullable().optional()
  .describe("All job locations as individual strings"),
californiaLocations: z.array(z.string()).nullable().optional()
  .describe("Only locations in California / SF Bay Area"),
```

#### [MODIFY] [tasks.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/orchestrator/methods/core/tasks.ts)

Backfill `allLocations` and `californiaLocations` into role metadata during `job_extract`.

#### [MODIFY] [role-insights.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/role-insights.ts)

In `generateLocationInsight()`, prefer `californiaLocations[0]` over raw `location` for commute calculation.

#### [MODIFY] [openroute.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/health/checks/openroute.ts)

Add `californiaLocations` field to `LocationExtractionSchema`, use it as commute target when available.

---

## Verification Plan

### Automated Tests
1. `pnpm run types` — TypeScript clean
2. `pnpm run build` — Build succeeds
3. Local schema test: `npx tsx -e "z.toJSONSchema(LocationInsightSchema)"` produces correct JSON Schema

### Production Verification
1. Deploy and run health diagnostic — `openroute_commute` should pass
2. Submit a multi-city job and verify `californiaLocations` is populated correctly
3. Verify the commute table contains time-specific rows for all requested departure slots

## Priority Order
1. **P0:** Fix `zodToJsonSchema` → `z.toJSONSchema` (affects ALL AI output system-wide)
2. **P1:** Enhanced commute table schema with time-specific departures
3. **P2:** California location extraction for multi-city jobs
