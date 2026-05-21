import type { JobAnalysisAgent } from "./index";

export async function checkHealth(agent: JobAnalysisAgent, _env: Env) {
  try {
    const inFlightCount = agent.state.inFlight ? Object.keys(agent.state.inFlight).length : 0;
    return {
      status: "healthy",
      inFlightCount,
      lastError: agent.state.lastError,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    return {
      status: "unhealthy",
      error: String(err),
      timestamp: new Date().toISOString(),
    };
  }
}
