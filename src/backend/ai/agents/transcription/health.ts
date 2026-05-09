import { getAgentByName } from "agents";

import type { ModuleResult } from "@/backend/health/types";

import type { TranscriptionAgent } from "./index";

import { provisionSandbox, destroySandbox } from "./methods/sandbox-sdk/lifecycle";

export async function checkHealth(agent: TranscriptionAgent, env: Env) {
  const start = Date.now();
  try {
    // Verifying bindings exist
    if (!env.R2_AUDIO_BUCKET) {
      throw new Error("Missing R2_AUDIO_BUCKET binding");
    }
    if (!env.SANDBOX) {
      throw new Error("Missing SANDBOX binding");
    }

    // Ping Sandbox via Python script
    const sandbox = await provisionSandbox(env, "health-check-ping");
    if (!sandbox) {
      throw new Error("Sandbox provision failed for health check");
    }

    try {
      const result = await sandbox.exec("python3 /workspace/process_audio.py ping", {
        timeout: 10_000,
      });
      if (!result.success || !result.stdout.includes("PONG")) {
        throw new Error(`Sandbox python ping failed: ${result.stderr || result.stdout}`);
      }
    } finally {
      await destroySandbox(sandbox, () => {});
    }

    return {
      status: "ok",
      latencyMs: Date.now() - start,
      details: {
        stateStatus: agent.state.status,
        jobId: agent.state.jobId,
      },
    };
  } catch (error) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: `TranscriptionAgent health check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function checkTranscriptionAgentRPC(env: Env): Promise<ModuleResult> {
  const start = Date.now();
  try {
    const stub = await getAgentByName<Env, TranscriptionAgent>(
      env.TRANSCRIPTION_AGENT as any,
      "global",
    );
    const result = await stub.healthProbe();
    if (!result || typeof result !== "object" || !("status" in result)) {
      throw new Error("Invalid response from agent");
    }
    return result as ModuleResult;
  } catch (e) {
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: `TranscriptionAgent RPC failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}
