import { getSandbox } from "@cloudflare/sandbox";

import { sandboxOptions } from "../../types";

export async function provisionSandbox(env: Env, normalizedRecordingId: string) {
  return getSandbox(env.SANDBOX as any, normalizedRecordingId, sandboxOptions);
}

export async function destroySandbox(
  sandbox: Awaited<ReturnType<typeof getSandbox>>,
  log: (msg: string) => void,
) {
  try {
    await sandbox.destroy();
    log("🗑️ Sandbox destroyed in cleanup");
  } catch (error) {
    // Sandbox may already be destroyed
    const errorMsg = error instanceof Error ? error.message : String(error);
    log(`🗑️ Sandbox destroy error: ${errorMsg}`);
  }
}
