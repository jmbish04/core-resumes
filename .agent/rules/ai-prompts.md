# AI Prompts & Context Construction

When creating, updating, or maintaining AI Prompts and System Contexts across this codebase, you MUST strictly adhere to the following rules to ensure the models interpret formatting, instructions, and context windows correctly.

## 1. No `.join("\\n")` or `join("\n")` for Prompt Strings

**Do NOT** construct prompts using an array of strings joined by escaped line breaks like `.join("\\n")` or `.join("\n")`. This practice escapes the backslash, injecting literal `\n` character strings instead of an actual new line, which degrades the LLM's ability to read and parse structural markdown.

**INSTEAD:** Use Native ES6 Template Literals (`` ` ``) with real line breaks.

```typescript
// ❌ WRONG
export const PROMPT = ["You are a helpful assistant.", "1. Do X.", "2. Do Y."].join("\\n");

// ✅ CORRECT
export const PROMPT = `
You are a helpful assistant.
1. Do X.
2. Do Y.
`.trim();
```

## 2. Use Aggressive XML Wrappers for Critical Instructions

When instructing the model to perform rigid non-summarizing tasks (like extracting an entire job post without dropping words), standard markdown bullet points can be ignored if the context is large.

**RULE:** Wrap non-negotiable instruction blocks or verbatim extraction targets in aggressive XML tags.

```typescript
// ✅ CORRECT
export const EXTRACT_PROMPT = `
Extract the information into the JSON schema.

<STRICT_VERBATIM_EXTRACTION>
For all array fields (responsibilities, qualifications), extract each bullet item VERBATIM. 
Do NOT summarize, shorten, paraphrase, or truncate.
</STRICT_VERBATIM_EXTRACTION>
`.trim();
```

## 3. Explicit `max_tokens` Allocation

When utilizing `generateStructuredOutput` or dealing with large source material (like entire job postings), LLMs will frequently attempt to summarize output if they believe they do not have enough token space to emit a complete verbatim response.

**RULE:** Always supply an explicit high `max_tokens` limit (e.g., `8096`) for intensive extraction or analysis tasks to guarantee the model has ample room to return every single character without summarization.

```typescript
// ✅ CORRECT
return generateStructuredOutput(env, {
  messages: [...],
  schema: opts.schema,
  max_tokens: 8096, // Explicit boundary mapping
});
```

## 4. Context Provisioning for Integrations

When integrating newly provided services that require state management:
- Always explicitly dictate the Drizzle schema definitions and migration commands (e.g., `pnpm run migrate:local` / `pnpm run migrate:remote`) in the prompt.
- Always instruct the agent to update the `Env` interface with any new secret bindings (e.g., `Secret`) before asking it to integrate code that relies on `env.NEW_SECRET.get()`.

## 5. CV Optimization & ATS Parsing Rules (Global)

### 5.1 Resume Bullet Standards
- **Structure:** Every bullet must follow the format: "What you did + How + Result/Impact".
- **Tone:** Professional and metric-driven.
- **Forbidden Words:** Never use fluff words such as "spearheaded", "synergized", "passionate", or "guru".
- **Hallucination Prevention:** The agent must never invent new jobs, degrees, certifications, or projects. Dates and company names must remain completely unchanged from the source material.
- **Applies to:** `resume-bullets.ts` AND `respond-to-comments.ts`.

### 5.2 ATS Taxonomy Extraction
When parsing job descriptions for ATS keywords, the LLM must extract 30-50+ atomic tags categorized exactly as follows:
- `programmingLanguagesAndFrameworks` (e.g., extract both "PHP" and "Symfony" if mentioned).
- `testingAndQuality` (e.g., TDD, Jest, Cypress).
- `engineeringPractices` (e.g., SOLID, microservices, clean architecture).
- `businessDomain` (e.g., SaaS, fintech, B2B).
- `infrastructureAndDevOps` (e.g., Docker, AWS, Terraform).

### 5.3 Implicit Skill Mapping
The agent must infer hard skills from contextual phrasing in job descriptions. For example:
- "high traffic" → "scalability", "high availability"
- "multiple services" → "distributed systems", "microservices"
- "complex codebase" → "complex systems thinking", "refactoring"

### 5.4 Holistic Role Analysis (`role.ts`)
- Must map implicit skills contextually (e.g., "complex codebase" → "complex systems thinking", "refactoring").
- Must evaluate the candidate's alignment against the 5 core ATS taxonomy categories: Programming/Frameworks, Testing/Quality, Engineering Practices, Business Domain, and Infrastructure/DevOps.
- Phase 2 prompts must reference the ATS taxonomy when computing `hire_likelihood` and `counter_positioning`.
