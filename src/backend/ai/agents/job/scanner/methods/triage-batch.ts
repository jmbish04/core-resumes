import { Logger } from "@/backend/lib/logger";

import type { JobScannerAgent } from "../index";

export async function handleTriageBatch(env: Env, agent: JobScannerAgent) {
  if (!agent.state.queue || agent.state.queue.length === 0) {
    return;
  }

  // Drain the queue
  const jobsToProcess = [...agent.state.queue];
  agent.setState({
    ...agent.state,
    queue: [],
  });

  try {
    const { getAgentByName } = await import("agents");
    const analysisAgent = await getAgentByName(env.JOB_ANALYSIS_AGENT, "global");

    for (const job of jobsToProcess) {
      await analysisAgent.analyze(job.snapshotId);
    }
  } catch (err) {
    // Re-queue on failure
    agent.setState({
      ...agent.state,
      queue: [...agent.state.queue, ...jobsToProcess],
    });
    const logger = new Logger(env);
    await logger.error(`[JobScannerAgent] Failed to forward jobs to analysis`, {
      error: String(err),
    });
  }
}
