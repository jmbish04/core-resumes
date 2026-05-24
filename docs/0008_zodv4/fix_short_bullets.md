# Bullet Fidelity Enforcement: DOM Fallback + Truncation Detection

## Problem

AI models intermittently truncate or summarize bullet text during structured extraction, producing lossy results like:

> `Coordinate the legal team's AI tooling roadmap`

Instead of the verbatim original:

> `Coordinate the legal team's AI tooling roadmap — maintaining visibility into what's in progress, tracking timelines across multiple concurrent workstreams, and communicating status to stakeholders`

This happens despite verbatim extraction prompts because LLMs have inherent summarization bias, especially for long bullets. The existing `reconcileJobExtractions()` function compares AI extraction against Browser Rendering JSON extraction, but both are AI-powered and can independently truncate. The HTML DOM `<li>` elements are the **ground truth** and should be the authoritative fallback.

## Architecture Overview

The current pipeline produces **4 parallel data sources** during scrape:

| Source                         | Method                                     | Trust Level           |
| ------------------------------ | ------------------------------------------ | --------------------- |
| **Workers AI extraction**      | Markdown → `generateStructuredAnalysis`    | Medium (summarizes)   |
| **BR /json extraction**        | Browser model cascade                      | Medium (summarizes)   |
| **BR `/scrape` HTML elements** | `scrapeElements("ul > li")` → DOM text     | **High (verbatim)**   |
| **HTML bullet parser**         | `classifyScrapedElements()` → typed groups | **High (classified)** |

Today, `reconcileJobExtractions()` picks between AI sources 1 and 2, using DOM source 3 only for match counting. **The fix is to use the DOM elements as the authoritative source when they're available, and flag truncation when detected.**

---

## Proposed Changes

### 1. Backend: Enhance Reconciliation with DOM Fallback

#### [MODIFY] [scrape.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/orchestrator/methods/jobs/scrape.ts)

Upgrade `reconcileJobExtractions()`:

1. **Add `htmlBulletParser` integration** — run `classifyScrapedElements()` on the DOM elements to get ground-truth typed bullet groups
2. **Per-bullet fidelity check** — for each AI-extracted bullet, find the best-matching DOM `<li>` using substring matching. If the DOM version is longer (i.e. the AI truncated it), **replace** the AI bullet with the full DOM text
3. **Missing bullet detection** — any DOM bullets that have NO matching AI bullet at all get added to the result
4. **Flag truncated bullets** — track which bullets were replaced/added as `fidelityFlags` metadata on the extraction result, so the frontend can highlight them

New return shape from reconciliation:

```typescript
{
  ...extractedFields,
  _fidelityMeta: {
    truncatedBullets: Array<{ field: string; index: number; aiBullet: string; domBullet: string }>,
    missingBullets: Array<{ field: string; domBullet: string }>,
    domBulletCount: number,
    aiBulletCount: number,
  }
}
```

### 2. Backend: Persist Fidelity Flags on Role Bullets

#### [MODIFY] [tasks.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/orchestrator/methods/core/tasks.ts)

When persisting bullets during `job_extract`, carry the `_fidelityMeta` through to the role's metadata so the frontend can read it:

- `metadata.bulletFidelity.truncatedBullets` — array of `{ type, bulletContent, aiBullet }`
- `metadata.bulletFidelity.missingBullets` — array of `{ type, bulletContent }`

### 3. Backend: API — Expose Fidelity Flags on Bullets GET

#### [MODIFY] [role-bullets.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/role-bullets.ts)

Enrich the `GET /:roleId/bullets` response to include fidelity status:

- Read `bulletFidelity` from role metadata
- For each bullet, check if its content appears in the `truncatedBullets` array (was auto-corrected from a truncation) or was a `missingBullet` (added from DOM only)
- Return a new `fidelityStatus` field: `"verified"` | `"auto_corrected"` | `"dom_only"` | `null`

### 4. Frontend: Visual Fidelity Indicators

#### [MODIFY] [RoleBullets.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/RoleBullets.tsx)

- Add `fidelityStatus` to `RoleBulletRow` interface
- **`"auto_corrected"`** → Amber left-border and subtle amber text highlight with tooltip: "Auto-corrected: AI truncated this bullet. Full text restored from DOM."
- **`"dom_only"`** → Red left-border with tooltip: "Added from DOM: AI missed this bullet entirely. Please verify."
- **`"verified"`** → Subtle green left-border (optional, for confidence)
- The visual treatment should be non-intrusive (colored left border like a Git diff) so users can scan for issues at a glance

---

## Reconciliation Algorithm Detail

```
For each bullet array field (responsibilities, requiredQualifications, etc.):
  1. Get AI bullets from best source (existing reconcile logic)
  2. Get DOM bullets from classifyScrapedElements() for this type
  3. For each AI bullet:
     a. Find best-matching DOM bullet via normalized substring match
     b. If DOM bullet is >20% longer → REPLACE AI bullet with DOM text
        Flag as "auto_corrected"
     c. If DOM bullet matches → mark as "verified"
     d. If no DOM match → keep AI bullet as-is (DOM might not cover everything)
  4. For each DOM bullet with NO AI match:
     a. Add to the bullet array
     b. Flag as "dom_only"
```

> [!IMPORTANT]
> The DOM `<li>` elements are the purest source of truth because they're raw text nodes with zero AI interpretation. But they lack **classification** (which heading group does this `<li>` belong to). The `html-bullet-parser.ts` handles this via heading proximity, which is already implemented and works well.

---

## Verification Plan

### Automated Tests

1. `pnpm run types` — TypeScript clean
2. `pnpm run build` — Build succeeds

### Manual Verification

1. Submit a job with long bullet points and verify:
   - Truncated bullets are auto-corrected from DOM
   - Frontend shows amber indicators on auto-corrected bullets
   - Frontend shows red indicators on DOM-only bullets
2. Run health diagnostic to verify `extraction_fidelity` passes with new reconciliation
