import { getSandbox } from "@cloudflare/sandbox";
import type { SalaryAgent } from "./index";

/**
 * Health check runner for SalaryAgent.
 *
 * Verifies that:
 * 1. env.SANDBOX binding is configured.
 * 2. A temporary sandbox container can be successfully provisioned.
 * 3. Standard Python execution works correctly (runs python3 -c 'print(1 + 1)').
 * 4. Custom Python-on-demand compilation, writing, and execution functions properly.
 * 5. Lifecycle cost protection cleans up/destroys the sandbox immediately afterwards.
 */
export async function checkHealth(agent: SalaryAgent, env: Env) {
  const start = Date.now();
  try {
    // 1. Validate environment bindings
    if (!env.SANDBOX) {
      throw new Error("Missing env.SANDBOX binding configuration.");
    }

    // 2. Provision an ephemeral health check sandbox container
    const sandboxId = `health-salary-${Date.now()}`;
    const sandbox = getSandbox(env.SANDBOX, sandboxId, { sleepAfter: "1m" });

    try {
      // 3. Test standard Python execution (e.g. basic shell/python arithmetic evaluation)
      const stdMathResult = await sandbox.exec('python3 -c "print(1 + 1)"', {
        timeout: 10000,
      });

      if (!stdMathResult.success || stdMathResult.stdout.trim() !== "2") {
        throw new Error(
          `Standard Python arithmetic check failed. success=${stdMathResult.success}, ` +
          `stdout=${stdMathResult.stdout}, stderr=${stdMathResult.stderr}`
        );
      }

      // 4. Test custom Python-on-demand code compilation, writing, and execution
      const testPythonCode = `
import json
print(json.dumps({"status": "ok", "message": "Python on-demand working perfectly!"}))
`;
      await sandbox.writeFile("/workspace/health_demand.py", testPythonCode);

      const customRunResult = await sandbox.exec("python3 /workspace/health_demand.py", {
        timeout: 10000,
      });

      if (!customRunResult.success) {
        throw new Error(
          `Custom Python-on-demand run failed. stdout=${customRunResult.stdout}, ` +
          `stderr=${customRunResult.stderr}`
        );
      }

      let parsedJson: any;
      try {
        parsedJson = JSON.parse(customRunResult.stdout.trim());
      } catch (parseError) {
        throw new Error(
          `Failed to parse Sandbox custom python output as JSON. Raw stdout: ${customRunResult.stdout}`
        );
      }

      if (parsedJson?.status !== "ok") {
        throw new Error(`Custom Python-on-demand script returned non-ok status: ${customRunResult.stdout}`);
      }

      return {
        status: "ok" as const,
        latencyMs: Date.now() - start,
        details: {
          sandbox: "present",
          stdPython: "ok",
          pythonOnDemand: "ok",
          output: parsedJson.message,
        },
      };
    } finally {
      // 5. Cost control: Ensure Sandbox is immediately destroyed
      await sandbox.destroy();
      console.log(`[SalaryAgent] Cleaned up health check sandbox: ${sandboxId}`);
    }
  } catch (error) {
    return {
      status: "fail" as const,
      latencyMs: Date.now() - start,
      error: `SalaryAgent health check failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
