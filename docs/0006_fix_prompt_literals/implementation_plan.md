# Prompt Formatting & AI Configuration Modernization

This plan addresses the identified issues with prompt serialization (`.join("\\n")`) and max_token limits by standardizing how prompts are defined across the AI tasks.

## User Review Required

- Please review the `.agent/rules/ai-prompts.md` creation and `AGENTS.md` updates to ensure the guidelines match your expectations for AI interactions in this repository.
- Does a `max_tokens` allocation of `8096` work globally for extraction tasks, or should we limit it exclusively to `extract.ts` and `analyze-role.ts`?

## Proposed Changes

### Documentation Updates

#### [MODIFY] [AGENTS.md](file:///Volumes/Projects/workers/core-resumes/AGENTS.md)

Add a "Prompt Engineering & Token Allocation" section detailing the usage of template literals, XML tags for strict instructions, and `max_tokens` configuration.

#### [NEW] [.agent/rules/ai-prompts.md](file:///Volumes/Projects/workers/core-resumes/.agent/rules/ai-prompts.md)

Create a new rule file strictly enforcing:

1. No `.join("\\n")` for system prompts. Always use template literals (`` ` ``) to preserve real newlines.
2. Use aggressive XML tags (e.g. `<STRICT_VERBATIM_EXTRACTION>`) for non-negotiable instructions.
3. explicitly configure `max_tokens` when large context extraction is required.

---

### Code Refactoring

The following files will be refactored to replace `.join("\n")` array prompts with native template literals and aggressive XML tags where applicable.

#### [MODIFY] [extract.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/extract.ts)

- Convert `DEFAULT_EXTRACT_PROMPT` to a template literal.
- Wrap the critical instruction regarding array fields in `<STRICT_VERBATIM_EXTRACTION>...</STRICT_VERBATIM_EXTRACTION>`.
- Set `max_tokens: 8096` in the `generateStructuredOutput` call to ensure the model does not summarize due to context limitations.

#### [MODIFY] [analyze-role.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/analyze-role.ts)

- Refactor the multiple prompt arrays into template literals.
- Increase `max_tokens` to `8096` for the comprehensive analysis.

#### [MODIFY] [draft-with-notebook.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/draft-with-notebook.ts)

- Convert phase prompts into template literals.
- Add `<STRICT_VERBATIM_EXTRACTION>` around evidence-gathering guidelines to prevent summary loss.

#### [MODIFY] [prepare-query.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/prepare-query.ts)

- Convert `SYSTEM_PROMPT` arrays into template literals.

#### [MODIFY] [respond-to-comments.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/respond-to-comments.ts)

- Convert prompts to template literals.

#### [MODIFY] [classify-email-status.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/classify-email-status.ts)

- Convert prompt arrays to template literals.

#### [MODIFY] [draft.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tasks/draft.ts)

- Convert prompt arrays to template literals.

#### [MODIFY] [role-podcast-prompt.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tools/role-podcast-prompt.ts)

- Convert to template literal.

## Verification Plan

### Automated Tests

- Run `pnpm run check` to ensure no syntax errors were introduced during the string replacements.

### Manual Verification

- Review the `extractStructuredRolePosting` method to confirm `max_tokens` is properly passed to the AI provider.
