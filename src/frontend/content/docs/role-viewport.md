# Role Viewport

Last updated: May 4, 2026

The Role Viewport is the per-opportunity workspace at `/roles/:id`. It keeps role status, analysis, documents, podcast output, recruiting email, notes, recordings, and configuration in one full-width tabbed surface.

## Layout

The viewport renders as a single content column inside `src/frontend/components/role/RoleViewport.tsx`. The page no longer reserves a persistent right-hand assistant sidebar, so the role tabs can use the full available width next to the global app navigation.

Primary controls live above the tabs:

- **Notes** opens a dialog containing interview notes and recordings for the current role.
- **Config** opens a dialog containing role-specific guidance and configuration.
- **Role assistant** is exposed through a floating assistant-ui modal button at the bottom-right of the viewport.

## Assistant Modal

`src/frontend/components/assistant-ui/assistant-modal.tsx` wraps `AssistantModalPrimitive` from `@assistant-ui/react` and renders the existing `Thread` chat surface inside the modal content. It is imported only by `RoleViewport`, which keeps Colby chat scoped to role pages instead of mounting it globally.

The modal lives inside `RoleChatProvider`, so the assistant-ui runtime still receives the current `roleId` in the `/api/chat` request body. The existing dictation, TTS, and tool UI registrations continue to come from `RoleChatProvider`.

## Tabs

The viewport tabs are URL-addressable through the `tab` query parameter:

- **Errors** appears only when processing errors exist.
- **Status** shows role processing state.
- **Overview** combines interactive resume bullets (with draft clarifications, direct content editing tracking, vibration alerts for low scores, and batch reprocessing) and saved role metadata. The "Pending Changes" counter intelligently tracks both Clarification drafts and Inline content edits, preventing UX discrepancies when a user directly edits a bullet rather than submitting a contextual clarification.
- **Analysis** shows hireability, location, compensation, and combined value scoring.
- **Documents** lists generated Google Docs artifacts.
- **Podcast** shows generated NotebookLM podcast output.
- **Emails** shows recruiting email matched to the role.

## File Reference

- `src/frontend/pages/roles/[id].astro` — SSR role lookup and role page shell
- `src/frontend/components/role/RoleViewport.tsx` — Tabbed role workspace and modal mount point
- `src/frontend/components/role/RoleChatProvider.tsx` — assistant-ui runtime, `/api/chat` transport, dictation, TTS, and tool UI registration
- `src/frontend/components/assistant-ui/assistant-modal.tsx` — Floating role assistant modal
- `src/frontend/components/assistant-ui/thread.tsx` — assistant-ui chat thread surface
