import { Agent, callable, type Connection } from "agents";
import { eq } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { jobsPostings, jobSnapshots } from "@/backend/db/schema";

import type { JobAnalysisState } from "./types";

import { checkHealth } from "./health";
import {
  handleConsultNotebook,
  handleDeepAnalyze,
  handlePersist,
  handleArchive,
  handleEmbed,
} from "./methods";

export class JobAnalysisAgent extends Agent<Env, JobAnalysisState> {
  static docsMetadata() {
    return {
      name: "JobAnalysisAgent",
      className: "JobAnalysisAgent",
      description: "Handles multi-phase AI analysis of scraped job postings.",
      docsPath: "/docs/agents/job-analysis",
      methods: [
        {
          name: "analyze",
          description: "Run the full analysis pipeline for a snapshot",
          params: "snapshotId: string",
          returns: "void",
        },
        {
          name: "reanalyze",
          description: "Re-run analysis with HITL context",
          params: "jobSiteId: string, hitlContext: any",
          returns: "void",
        },
      ],
      tools: [
        "NotebookLM SDK",
        "Workers AI",
        "Cloudflare Vectorize",
        "Cloudflare Browser Rendering",
      ],
    };
  }

  initialState: JobAnalysisState = {
    inFlight: {},
  };

  onConnect(_connection: Connection) {
    this.getLogger().then((logger) => logger.info(`[JobAnalysisAgent] WebSocket connected.`));
  }

  onClose(_connection: Connection) {
    this.getLogger().then((logger) => logger.info(`[JobAnalysisAgent] WebSocket disconnected.`));
  }

  onError(error: unknown) {
    this.getLogger().then((logger) =>
      logger.error(`[JobAnalysisAgent] Server Error`, { error: String(error) }),
    );
  }

  private async getLogger() {
    const { Logger } = await import("@/backend/lib/logger");
    return new Logger(this.env);
  }

  @callable()
  async analyze(snapshotId: number) {
    // Record that we started
    this.setState({
      ...this.state,
      inFlight: {
        ...this.state.inFlight,
        [snapshotId]: "consult-notebook",
      },
    });

    // Run the phases sequentially using waitUntil so the caller is not blocked
    this.ctx.waitUntil(this.runPipeline(snapshotId));
    return { status: "started", snapshotId };
  }

  @callable()
  async reanalyze(jobSiteId: string, hitlContext: string) {
    const db = getDb(this.env);

    // Find the original job
    const [job] = await db
      .select()
      .from(jobsPostings)
      .where(eq(jobsPostings.jobSiteId, jobSiteId))
      .limit(1);

    if (!job) {
      throw new Error(`Cannot reanalyze: Job ${jobSiteId} not found`);
    }

    // Create a new snapshot for the re-analysis
    const [snapshot] = await db
      .insert(jobSnapshots)
      .values({
        jobId: job.id,
        isManualReprocess: true,
        reprocessRationale: hitlContext,
        sessionUuid: "hitl-reprocess",
      })
      .returning();

    if (!snapshot) {
      throw new Error("Failed to create new snapshot for reanalysis");
    }

    return this.analyze(snapshot.id);
  }

  private async runPipeline(snapshotId: number) {
    try {
      this.setPhase(snapshotId, "consult-notebook");
      await handleConsultNotebook(this.env, this, snapshotId);

      this.setPhase(snapshotId, "deep-analyze");
      const analysisResult = await handleDeepAnalyze(this.env, this, snapshotId);

      this.setPhase(snapshotId, "persist");
      await handlePersist(this.env, this, snapshotId, analysisResult);

      this.setPhase(snapshotId, "archive");
      await handleArchive(this.env, this, snapshotId);

      this.setPhase(snapshotId, "embed");
      await handleEmbed(this.env, this, snapshotId);

      this.setPhase(snapshotId, "done");

      // Cleanup
      const newInFlight = { ...this.state.inFlight };
      delete newInFlight[snapshotId];
      this.setState({ ...this.state, inFlight: newInFlight });
    } catch (err) {
      const logger = await this.getLogger();
      await logger.error(`[JobAnalysisAgent] Pipeline failed for ${snapshotId}`, {
        error: String(err),
      });
      this.setState({
        ...this.state,
        lastError: String(err),
      });
    }
  }

  private setPhase(snapshotId: number, phase: import("./types").Phase) {
    this.setState({
      ...this.state,
      inFlight: {
        ...this.state.inFlight,
        [snapshotId]: phase,
      },
    });
  }

  @callable()
  async checkHealth() {
    return checkHealth(this, this.env);
  }
}
