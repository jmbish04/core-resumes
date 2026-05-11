# NotebookLM AI Orchestration & Unified Role Viewport

## Goal Description

Refactor the NotebookLM integration to give users full control over AI content generation. Move from automatic background artifact generation to an on-demand, user-triggered model. Add D1-backed prompt template configurations so users can customize the instructions for every NotebookLM artifact type. Consolidate the "Podcast" and "NotebookLM" tabs into a single, unified tab in the Role Viewport. Replace the current single-step instruction dialog with a 3-state prompt confirmation modal.

## User Review Required

> [!IMPORTANT]
> - **Tab Merge:** The "Podcast" tab will be absorbed into the "NotebookLM" tab. All existing podcast functionality (audio player, transcript viewer, timed transcript) will render inside the unified tab. The `<TabsTrigger value="podcast">` will be removed.
> - **On-Demand Only:** The intake pipeline already uses `mode: "assets_only"`. Users must explicitly trigger artifacts via the NotebookLM Command Menu. No changes needed to intake.
> - **Prompt Templates in `global_config`:** Each artifact type gets a dedicated config key (e.g., `notebooklm_prompt_podcast`). These are editable via Config page and consumed by the actions route.

## Open Questions

> [!NOTE]
> - No blocking open questions.

---

## Proposed Changes

### Phase 1: D1 Prompt Template Configuration

#### [MODIFY] [config.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/config.ts)
- Add default prompt templates for each artifact type to the `defaultConfig` array:
  - `notebooklm_prompt_podcast` — Instructions for generating podcasts
  - `notebooklm_prompt_mind_map` — Instructions for mind map generation
  - `notebooklm_prompt_report` — Report generation instructions
  - `notebooklm_prompt_quiz` — Quiz generation instructions
  - `notebooklm_prompt_flashcards` — Flashcard generation instructions
  - `notebooklm_prompt_infographic` — Infographic generation instructions
  - `notebooklm_prompt_slide_deck` — Slide deck generation instructions
  - `notebooklm_prompt_data_table` — Data table generation instructions
  - `notebooklm_prompt_deep_research` — Deep research query template
- Each template includes `{{jobTitle}}`, `{{companyName}}`, and `{{instruction}}` placeholders

#### [NEW] [seed-notebooklm-prompts.sql](file:///Volumes/Projects/workers/core-resumes/src/backend/db/seeds/seed-notebooklm-prompts.sql)
- SQL seed file with `INSERT OR IGNORE` statements to populate all 9 prompt templates into `global_config`

---

### Phase 2: Backend — Actions Route Uses Config Prompts

#### [MODIFY] [notebooklm-blobs.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/notebooklm-blobs.ts)
- Refactor the `POST /:roleId/notebooklm/actions` handler:
  - Accept a new optional `prompt` field in the request body (the user-modified prompt from the frontend)
  - If `prompt` is provided, use it directly (user has already confirmed it)
  - If `prompt` is not provided, fetch the matching template from `global_config` and hydrate placeholders
  - Fall back to hardcoded defaults only if no config row exists
- Update `actionSchema` to include `prompt: z.string().optional()`

#### [NEW] `GET /:roleId/notebooklm/prompt/:action` endpoint
- Returns the hydrated prompt for a given action and role
- Fetches the template from `global_config`, hydrates `{{jobTitle}}`, `{{companyName}}`
- Frontend calls this when opening the confirmation modal to display the current prompt

---

### Phase 3: Frontend — Config Tab for NotebookLM Prompts

#### [NEW] [NotebookLMPromptEditor.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/config/NotebookLMPromptEditor.tsx)
- Accordion editor showing all 9 artifact prompt templates
- Each template has a `Textarea` pre-filled from `GET /api/config/notebooklm_prompt_{type}`
- Save button triggers `PUT /api/config/notebooklm_prompt_{type}`
- Shows `isDefault` badge when using fallback values
- Displays available placeholder variables (`{{jobTitle}}`, `{{companyName}}`, `{{instruction}}`)

#### [MODIFY] [ConfigTabs.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/config/ConfigTabs.tsx)
- Add a new "NotebookLM Prompts" tab containing `<NotebookLMPromptEditor />`

---

### Phase 4: 3-State Prompt Confirmation Modal

#### [MODIFY] [NotebookLMCommandMenu.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/NotebookLMCommandMenu.tsx)

**Replace** the current single-step instruction dialog with a 3-state modal. The modal tracks `modalView` state:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐
│   CONFIRM    │────▶│    EDIT      │────▶│  CONFIRM (modified)  │
│  (read-only) │     │  (textarea)  │     │    (read-only)       │
└──────────────┘     └──────────────┘     └──────────────────────┘
     │                    │                        │
     │ Submit             │ Cancel                 │ Submit
     ▼                    ▼                        ▼
  Execute API       Back to CONFIRM           Execute API
                    (discard edits)          (with modified prompt)
```

**State: `confirm` (Initial View)**
- Fetches the hydrated prompt from `GET /api/roles/:roleId/notebooklm/prompt/:action` on mount
- Displays the prompt read-only in a styled `<pre>` / `<code>` block with proper word wrapping
- Shows a "modified" badge if the prompt has been edited in a previous edit cycle
- **Buttons:**
  - `Cancel` — closes the modal. If prompt was modified, shows "Are you sure?" guard dialog (unsaved modifications will be lost). If no modifications were made, closes immediately without confirmation.
  - `Edit Prompt` — transitions to `edit` state, pre-fills textarea with current prompt
  - `Submit` — executes the action with the current prompt (default or modified)

**State: `edit` (Editing View)**
- `Textarea` pre-filled with the current prompt text
- **Template tag documentation panel** above or below the textarea:
  ```
  Available template tags:
  • {{jobTitle}} — The role's job title (e.g., "Senior Software Engineer")
  • {{companyName}} — The company name (e.g., "Google")
  • {{instruction}} — Additional user instructions appended at runtime
  ```
- **Buttons:**
  - `Cancel` — reverts to `confirm` state, **discards edits** (restores the prompt to what it was before entering edit mode)
  - `Save & Review` — transitions back to `confirm` state with the edited prompt. Sets `isModified = true`.

**State: `confirm` (After Editing — Modified View)**
- Same layout as initial confirm, but:
  - Shows a `Badge variant="secondary"` reading "Modified" next to the title
  - The displayed prompt is the user's edited version
- **Buttons:**
  - `Cancel` — shows "Are you sure? Your prompt modifications will be lost." guard dialog (shadcn `AlertDialog`). If confirmed, closes modal and resets state. If dismissed, stays on confirm view.
  - `Edit Prompt` — goes back to `edit` state with the modified prompt pre-filled
  - `Submit` — executes the action, sending the modified prompt text to the backend

**State tracking:**
```typescript
type ModalView = "confirm" | "edit";

// State variables:
const [modalView, setModalView] = useState<ModalView>("confirm");
const [defaultPrompt, setDefaultPrompt] = useState("");   // fetched from API
const [editingPrompt, setEditingPrompt] = useState("");    // textarea value
const [activePrompt, setActivePrompt] = useState("");      // what will be submitted
const [isModified, setIsModified] = useState(false);       // tracks if user has edited
const [showDiscardGuard, setShowDiscardGuard] = useState(false); // "are you sure?" dialog
```

**Execution:** The final `Submit` sends `{ action, prompt: activePrompt }` to `POST /api/roles/:roleId/notebooklm/actions`. The backend uses the prompt directly when provided.

---

### Phase 5: Unified NotebookLM Tab (Merge Podcast + NotebookLM)

#### [NEW] [NotebookLMTab.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/NotebookLMTab.tsx)
- Unified component that renders:
  1. **Header row** with the `NotebookLMCommandMenu` button
  2. **Podcast section** — the existing `RolePodcast` content (audio player, transcript, timed transcript)
  3. **Blobs section** — the existing `NotebookLMBlobs` content (sources + artifacts list with clawback/delete)
- Uses section headers with dividers to organize podcast/blobs vertically

#### [MODIFY] [RoleViewport.tsx](file:///Volumes/Projects/workers/core-resumes/src/frontend/components/role/RoleViewport.tsx)
- **Remove** `<TabsTrigger value="podcast">` and its `<TabsContent>`
- **Replace** the `<TabsContent value="notebooklm">` with `<NotebookLMTab roleId={role.id} />`
- **Remove** `NotebookLMCommandMenu` from the header button row (it moves into the tab)

---

### Phase 6: Decommission Auto-Generation (Already Done)

> [!TIP]
> The intake pipeline already uses `mode: "assets_only"` (line 593 of `intake.ts`). No changes needed. This phase is verification only.

---

## Verification Plan

### Automated Tests
```bash
# Type check
pnpm tsc --noEmit

# Build verification
pnpm run build

# Seed the prompt configs (after deploy)
wrangler d1 execute DB --remote --file=src/backend/db/seeds/seed-notebooklm-prompts.sql
```

### Manual Verification
1. **Config page:** Navigate to `/config?tab=NotebookLM+Prompts` → verify all 9 templates render → edit one → save → reload → confirm persisted
2. **Command Menu → Confirm view:** Select "Create Podcast" → verify hydrated prompt displays read-only → click Submit → verify action fires with default prompt
3. **Command Menu → Edit flow:** Select "Create Report" → click "Edit Prompt" → verify textarea pre-filled + template tag docs visible → modify text → click "Save & Review" → verify confirm view shows "Modified" badge + edited text → click Submit → verify backend receives modified prompt
4. **Cancel guard:** After editing a prompt, click Cancel → verify "Are you sure?" dialog appears → confirm → verify modal closes. Repeat without editing → verify no guard dialog (closes immediately)
5. **Prompt endpoint:** `GET /api/roles/:roleId/notebooklm/prompt/create_podcast` returns hydrated prompt with real role data
6. **Role Viewport:** Open a role → verify single "NotebookLM" tab → verify podcast player and blobs render within it
7. **Intake:** Confirm a new role → verify no artifact auto-generation
