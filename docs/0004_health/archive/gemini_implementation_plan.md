# STOP! DO NOT USE THIS! - ARCHIVED

# Decentralize Health Service

The goal of this task is to refactor the health monitoring system to use a decentralized module pattern. `src/backend/services/health-service.ts` will be transformed into a lightweight orchestrator (`services/health.ts`) that simply imports health check methods from across the codebase, executes them, and saves the results to D1.

Crucially, we will fix the agent RPC caller syntax to properly utilize the Cloudflare Agents SDK. The `@callable` decorator on agent methods exposes them over RPC. By using `getAgentByName<Env, AgentClass>(env.BINDING as any, "global")`, we obtain a fully-typed RPC stub that allows us to invoke `await stub.checkHealth()` seamlessly and correctly.

## User Review Required

> [!NOTE]
> Please review the module extraction map below. The logic is simply being moved, not rewritten, to ensure the health dashboard remains perfectly stable.

## Proposed Changes

### 1. Rename Central Service

#### [NEW] [src/backend/services/health.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/health.ts)

#### [DELETE] [src/backend/services/health-service.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/services/health-service.ts)

- Will become the central orchestrator that imports module checkers from across the codebase, executes `runFullScreening`, and persists to `health_screenings` in D1.

### 2. Extract Infrastructure Checks

#### [NEW] [src/backend/db/health.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/db/health.ts)

- Move `checkD1(env)` and `checkKV(env)` here.

#### [NEW] [src/backend/utils/health.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/utils/health.ts)

- Move `checkSecrets(env)` and `checkEnvVars(env)` here.

### 3. Extract AI & Tool Checks

#### [NEW] [src/backend/ai/workersai/health.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/workersai/health.ts)

- Move `checkWorkersAI(env)` and `checkAIGateway(env)` here.

#### [NEW] [src/backend/ai/tools/google/health.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/tools/google/health.ts)

- Move `checkGoogleDrive(env)` here.

#### [NEW] [src/backend/lib/speech/health.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/lib/speech/health.ts)

- Move `checkTTS(env)` and `checkSTT(env)` here.

### 4. Fix Agent SDK Integrations

For all four agents, we will export a new RPC caller method directly from their existing `health.ts` modules. This method will properly implement `getAgentByName` from the Agents SDK and provide the generic type for the agent class so TS understands the `@callable` method signatures.

#### [MODIFY] [src/backend/ai/agents/orchestrator/health.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/orchestrator/health.ts)

- Add `export async function checkOrchestratorAgentRPC(env: Env)`.
- Impl: `const stub = await getAgentByName<Env, OrchestratorAgent>(env.ORCHESTRATOR_AGENT as any, "global"); return stub.checkHealth();`

#### [MODIFY] [src/backend/ai/agents/notebooklm/health.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/notebooklm/health.ts)

- Move `checkNotebookLMSystem(env)` system test here (verifies auth cookies & Notebook ID).
- Add `export async function checkNotebookLMAgentRPC(env: Env)`.
- Impl: `const stub = await getAgentByName<Env, NotebookLMAgent>(env.NOTEBOOKLM_AGENT as any, "global"); return stub.checkHealth();`

#### [MODIFY] [src/backend/ai/agents/notebooklm-mcp/health.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/notebooklm-mcp/health.ts)

- Add `export async function checkNotebookLMMcpAgentRPC(env: Env)`.
- Impl: `const stub = await getAgentByName<Env, NotebookLMMcpAgent>(env.NOTEBOOKLM_MCP_AGENT as any, "global"); return stub.checkHealth();`

#### [MODIFY] [src/backend/ai/agents/transcription-agent/health.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/ai/agents/transcription-agent/health.ts)

- Add `export async function checkTranscriptionAgentRPC(env: Env)`.
- Impl: `const stub = await getAgentByName<Env, TranscriptionAgent>(env.TRANSCRIPTION_AGENT as any, "global"); return stub.checkHealth();`

### 5. Update API Route and CRON Handlers

#### [MODIFY] [src/backend/api/routes/health.ts](file:///Volumes/Projects/workers/core-resumes/src/backend/api/routes/health.ts)

- Update import path from `services/health-service` to `services/health`.

#### [MODIFY] [src/\_worker.ts](file:///Volumes/Projects/workers/core-resumes/src/_worker.ts)

- Update import path for the scheduled CRON job from `services/health-service` to `services/health`.

## Verification Plan

1. Run `pnpm run types` to verify no import paths are broken, that `getAgentByName` generics correctly map to `@callable` agent methods, and all module exports properly map to the central health orchestrator.
2. Manually trigger a POST `/api/health/run` to ensure all decentralized methods successfully execute over RPC and return a valid 200 payload.
