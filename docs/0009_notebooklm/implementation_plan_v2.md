# NotebookLM Integration Updates, Transcription & Artifact Pipelines

## Goal Description
Enhance the NotebookLM integration to establish strict tracking of all uploaded sources and downloaded artifacts. Sources must be uploaded using UUID-based filenames to prevent collisions and duplicates, and they will be logged in a new `notebooklm_blobs` table. Generated podcast artifacts will have their audio transcribed using the SandboxSDK, storing the transcript (with start/stop timestamps for line ordering) in a new `notebooklm_podcast_transcript` table. 

Furthermore, the architecture will be expanded to support dedicated generation paths for various NotebookLM artifacts (Mind Maps, Reports, Quizzes, Flashcards, Infographics, Slide Decks, and Data Tables). The frontend Role Viewport will be updated to display the podcast transcript, provide an audio player to listen to it, and manage NotebookLM sources (with full delete/clawback support) and artifacts (read-only/soft-delete, as NotebookLM doesn't support artifact deletion).

## User Review Required
> [!IMPORTANT]
> - The new `notebooklm_blobs` and `notebooklm_podcast_transcript` tables will require a D1 schema migration.
> - The existing `role-assets.ts` workflow polling mechanism will be retained and expanded to support polling for all new artifact types (slide decks, mind maps, etc.) since they use the same async generation pattern.
> - Because NotebookLM doesn't support deleting artifacts, the "Delete Artifact" UI action will perform a **soft-delete** in our D1 database (`isActiveNotebooklmBlob = false`) and delete it from Google Drive/R2 if applicable.
> - Sources *can* be deleted from NotebookLM, so the "Clawback Source" action will trigger a hard delete via the SDK (`client.sources.delete()`) and mark the blob inactive in D1.

## Open Questions
> [!WARNING]
> - For the new artifact types (Mind Maps, Quizzes, etc.), should they be integrated immediately into the default `role-assets` pipeline triggered upon role creation, or should they be explicitly triggered via user interaction/chat commands in the UI? 

## Proposed Changes

### Database Schema
#### [NEW] `src/backend/db/schemas/notebooklm-blobs.ts`
- Table: `notebooklm_blobs`
- Fields: `id` (PK, UUID), `roleId` (FK), `notebooklmId` (Notebook ID), `notebooklmMsgId` (D1 msg identifier for context), `notebooklmSourceUuid` (UUID filename generated for sources, or artifact ID), `filename` (original filename), `md5` (hash for deduplication), `pipelineDocType` (e.g., "job_description", "podcast", "mind_map"), `notebooklmType` (enum: "source", "artifact"), `isActiveNotebooklmBlob` (boolean), timestamps.

#### [NEW] `src/backend/db/schemas/notebooklm-podcast-transcript.ts`
- Table: `notebooklm_podcast_transcript`
- Fields: `id` (PK), `roleId` (FK), `notebooklmMsgId`, `speakerName`, `speakerUsecStart` (integer for sorting/highlighting), `speakerUsecStop` (integer), `speakerMessage`, timestamps.

#### [MODIFY] `src/backend/db/schema.ts`
- Export the two new schemas.

### Backend Services & Workflows
#### [MODIFY] `src/backend/ai/tools/notebooklm/notebooklm-sources.ts` (and adjacent files)
- Add methods to delete sources using `client.sources.delete(notebookId, sourceId)`.
- Add methods to list sources `client.sources.list(notebookId)`.
- Add artifact polling and download helpers for new types (`listMindMaps`, `createMindMap`, `downloadSlideDeck`, `getInteractiveHtml`, etc.).
- Update `uploadMarkdownSource` to accept the new UUID filename logic and return/accept md5 if applicable.

#### [MODIFY] `src/backend/workflows/role-assets.ts`
- **Source Upload Step:** Generate a UUID filename, calculate MD5 (to prevent duplicates by checking `notebooklm_blobs`), and insert a record into `notebooklm_blobs` as `type: "source"`. Ensure we wait for sources to be ready using `waitUntilReady`.
- **Artifact Polling Step:** Update the step where artifacts are polled and downloaded to log them into `notebooklm_blobs` as `type: "artifact"`.
- **Transcription Step:** Add a step to execute SandboxSDK transcription on the podcast audio (via Whisper API) and save the segmented/timestamped results to `notebooklm_podcast_transcript`. Ensure rows are inserted in sequential chronological order.

#### [NEW/MODIFY] API Routes
- Create endpoints in `src/backend/api/routes/notebooklm.ts` for:
  - Listing sources/artifacts for a role.
  - Deleting a source (Clawback).
  - Soft-deleting an artifact.
  - Fetching podcast transcripts.
  - Initiating generation for specific artifacts (Mind Maps, Reports, etc.).

### Frontend
#### [MODIFY] `src/frontend/components/role/RolePodcast.tsx`
- Integrate a `VerticalVideoPlayer` or custom audio player component.
- Fetch and display the interactive transcript from `notebooklm_podcast_transcript`. Ensure it is sorted by `speakerUsecStart`.

#### [NEW] `src/frontend/components/role/NotebookLMBlobs.tsx`
- A management tab/section to list all sources and artifacts.
- "Clawback Source" button (triggers hard delete in SDK + soft delete in D1).
- "Hide Artifact" button (soft delete in D1).

## Verification Plan
### Automated Tests
- Run `pnpm run types` to ensure full type-safety.
- Generate and apply D1 migrations (`pnpm run db:generate` & `wrangler d1 migrations apply DB --local`).

### Manual Verification
- Kick off a Role intake and verify that the Markdown source is logged in `notebooklm_blobs` with a UUID filename and the worker waits for it to be ready.
- Verify the podcast generation creates an "artifact" entry in `notebooklm_blobs`.
- Verify the SandboxSDK transcribes the audio and correctly populates `notebooklm_podcast_transcript` with start/stop timestamps.
- Open the frontend Role Viewport, play the podcast, view the transcript, and verify the blob management UI can successfully clawback a source.
