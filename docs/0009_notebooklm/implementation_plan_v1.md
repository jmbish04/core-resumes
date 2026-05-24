# NotebookLM Integration Updates & Transcription

## Goal Description

Enhance the NotebookLM integration to establish strict tracking of all uploaded sources and downloaded artifacts. Sources must be uploaded using UUID-based filenames to prevent collisions and duplicates. A new logging table (`notebooklm_blobs`) will track all sources and artifacts. Additionally, when a podcast artifact is generated, its audio will be transcribed using the SandboxSDK and the word-for-word transcript will be stored in a new `notebooklm_podcast_transcript` table. Finally, the frontend Role Viewport will be updated to display the podcast transcript, provide an audio player to listen to it, and manage (view, clawback, delete) the NotebookLM sources and artifacts.

## User Review Required

> [!IMPORTANT]
>
> - The new `notebooklm_blobs` and `notebooklm_podcast_transcript` tables will require a D1 schema migration. I will use `drizzle-kit` to generate the migration and apply it.
> - The NotebookLM artifact pipeline will be updated to automatically transcribe the downloaded audio and insert the transcript into the new table. I will need to verify SandboxSDK transcription output format.
> - Currently, `notebooklm_podcast_transcript` expects exact millisecond start/stop for speakers. Does the SandboxSDK Whisper API return word-level or segment-level timestamps by default? We may need to adapt based on the output format.

## Open Questions

> [!WARNING]
>
> 1. For the "clawback" (delete) feature of NotebookLM sources and artifacts, does the `notebooklm-sdk` currently support a `deleteSource(notebookId, sourceId)` or `deleteArtifact(notebookId, artifactId)` method? If not, we might only be able to soft-delete it in our database or mark it as inactive.
> 2. The instruction mentions checking `notebooklm_blobs` via a cron job if an artifact is requested but not yet logged. Should I implement a new Scheduled Worker (Cron) or stick to the existing Workflows polling mechanism (`role-assets.ts`) for now?

## Proposed Changes

### Database Schema

#### [NEW] `src/backend/db/schemas/notebooklm-blobs.ts`

- Table: `notebooklm_blobs`
- Fields: `id` (PK, UUID), `roleId` (FK), `notebooklmId` (Notebook ID), `notebooklmMsgId` (D1 msg identifier), `notebooklmSourceUuid` (UUID filename generated for sources), `filename` (original filename), `md5` (hash for deduplication), `pipelineDocType` (e.g. "job_description", "podcast"), `notebooklmType` (enum: "source", "artifact"), `isActiveNotebooklmBlob` (boolean), timestamps.

#### [NEW] `src/backend/db/schemas/notebooklm-podcast-transcript.ts`

- Table: `notebooklm_podcast_transcript`
- Fields: `id` (PK), `roleId` (FK), `notebooklmMsgId`, `speakerName`, `speakerUsecStart`, `speakerUsecStop`, `speakerMessage`, timestamps.

#### [MODIFY] `src/backend/db/schema.ts`

- Export the two new schemas.

### Backend Services & Workflows

#### [MODIFY] `src/backend/ai/tools/notebooklm/notebooklm-sources.ts`

- Expose delete methods if supported by the SDK (`deleteSource`, `deleteArtifact`).
- Update `uploadMarkdownSource` to accept the new UUID filename logic and return/accept md5 if applicable.

#### [MODIFY] `src/backend/workflows/role-assets.ts`

- Update the step "upload notebooklm source" to generate a UUID filename, calculate MD5 (to prevent duplicates), and insert a record into `notebooklm_blobs` as `type: "source"`.
- Update the step where the artifact is downloaded to log it into `notebooklm_blobs` as `type: "artifact"`.
- Add a step to execute SandboxSDK transcription on the podcast audio and save results to `notebooklm_podcast_transcript`.

#### [NEW/MODIFY] API Routes

- Create endpoints in `src/backend/api/routes/notebooklm.ts` or `role-podcasts.ts` for listing blobs, fetching transcripts, deleting sources/artifacts.

### Frontend

#### [MODIFY] `src/frontend/components/role/RolePodcast.tsx`

- Integrate the `VerticalVideoPlayer` or audio player.
- Fetch and display the interactive transcript from `notebooklm_podcast_transcript`.

#### [NEW] `src/frontend/components/role/NotebookLMBlobs.tsx`

- A management tab/section to list all sources and artifacts.
- Buttons to "Clawback Source" and "Delete Artifact".

## Verification Plan

### Automated Tests

- Run `pnpm run types` to ensure full type-safety.
- Generate and apply D1 migrations (`pnpm run db:generate` & `wrangler d1 migrations apply DB --local`).

### Manual Verification

- Kick off a Role intake and verify that the Markdown source is logged in `notebooklm_blobs` with a UUID filename.
- Verify the podcast generation creates an "artifact" entry in `notebooklm_blobs`.
- Verify the SandboxSDK transcribes the audio and populates `notebooklm_podcast_transcript`.
- Open the frontend Role Viewport, play the podcast, view the transcript, and verify the blob management UI can successfully delete a source.
