/**
 * @fileoverview JobScannerAgent — manages long-running scraping sessions
 * across Greenhouse job boards.
 */
import { Agent, callable, type Connection } from "agents";

import { Logger } from "@/backend/lib/logger";

import type { JobScannerState, ScanProgress } from "./types";

import { checkScannerHealth } from "./health";
import { handleScanAll } from "./methods/scan-all";
import { handleScanBoard } from "./methods/scan-board";

export class JobScannerAgent extends Agent<Env, JobScannerState> {
  static docsMetadata() {
    return {
      name: "Job Scanner",
      className: "JobScannerAgent",
      description:
        "Manages continuous scanning and polling of Greenhouse job boards. Responsible for discovering new job postings and queuing them for AI triage.",
      docsPath: "/docs/agents/job-scanner",
      methods: [
        {
          name: "scanBoard",
          description: "Scan a specific Greenhouse board token.",
          params: "token: string",
          returns: "sessionId",
        },
        {
          name: "scanAll",
          description: "Scan all configured default boards.",
          params: "void",
          returns: "sessionIds",
        },
        {
          name: "getRunStatus",
          description: "Get the status of a specific scan session.",
          params: "sessionId: string",
          returns: "RunState",
        },
      ],
      tools: ["Greenhouse API", "Linkedom HTML Parser"],
    };
  }

  initialState: JobScannerState = {
    runs: {},
    queue: [],
  };

  onConnect(_connection: Connection) {
    const logger = new Logger(this.env);
    logger.info(`[JobScannerAgent] WebSocket connected`);
  }

  onClose(_connection: Connection) {
    const logger = new Logger(this.env);
    logger.info(`[JobScannerAgent] WebSocket disconnected`);
  }

  onError(error: unknown) {
    const logger = new Logger(this.env);
    logger.error(`[JobScannerAgent] Error: ${error}`);
  }

  @callable()
  async scanBoard(token: string) {
    const sessionId = crypto.randomUUID();
    // Start background scan without awaiting
    this.ctx.waitUntil(handleScanBoard(this.env, this.state, sessionId, token, this));
    return sessionId;
  }

  @callable()
  async scanAll() {
    const sessionIds = await handleScanAll(this.env, this.state, this);
    return sessionIds;
  }

  @callable()
  async getRunStatus(sessionId: string) {
    return this.state.runs[sessionId] || null;
  }

  @callable()
  async checkHealth() {
    return checkScannerHealth(this.env);
  }

  // Allow methods to broadcast progress
  public emitProgress(progress: ScanProgress) {
    this.broadcast(JSON.stringify(progress));
  }
}
