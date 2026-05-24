/**
 * @fileoverview FreelanceScannerAgent — manages scanning of freelance platforms
 * (Upwork, Freelancer.com) via RapidAPI and AI-powered opportunity triage.
 */
import { Agent, callable, type Connection } from "agents";

import { Logger } from "@/backend/lib/logger";

import type { FreelanceScannerState, FreelanceScanProgress, SearchProfile } from "./types";

import { checkFreelanceScannerHealth } from "./health";
import { handleScanAll } from "./methods/scan-all";
import { handleScanFreelancer } from "./methods/scan-freelancer";
import { handleScanUpwork } from "./methods/scan-upwork";
import { handleTriageBatch } from "./methods/triage-batch";

export class FreelanceScannerAgent extends Agent<Env, FreelanceScannerState> {
  static docsMetadata() {
    return {
      name: "Freelance Scanner",
      className: "FreelanceScannerAgent",
      description:
        "Manages scanning of Upwork and Freelancer.com via RapidAPI. Discovers freelance opportunities, upserts them to D1, and runs AI triage to decide bid/skip.",
      docsPath: "/docs/agents/freelance-scanner",
      methods: [
        {
          name: "scanUpwork",
          description: "Scan Upwork listings with optional query/skills/filters.",
          params: "query?: string, skills?: string, filters?: Record<string, unknown>",
          returns: "sessionId",
        },
        {
          name: "scanFreelancer",
          description: "Scan Freelancer.com listings with optional query/skills/filters.",
          params: "query?: string, skills?: string, filters?: Record<string, unknown>",
          returns: "sessionId",
        },
        {
          name: "scanAll",
          description: "Scan all platforms using configured search profiles.",
          params: "void",
          returns: "sessionIds",
        },
        {
          name: "triagePending",
          description: "Run AI triage on all untriaged opportunities.",
          params: "void",
          returns: "{ triaged: number, errors: number }",
        },
        {
          name: "getRunStatus",
          description: "Get the status of a specific scan session.",
          params: "sessionId: string",
          returns: "FreelanceScanRunState",
        },
        {
          name: "addSearchProfile",
          description: "Add a search profile for recurring scans.",
          params: "profile: Omit<SearchProfile, 'id'>",
          returns: "SearchProfile",
        },
        {
          name: "removeSearchProfile",
          description: "Remove a search profile by ID.",
          params: "id: string",
          returns: "boolean",
        },
        {
          name: "getSearchProfiles",
          description: "List all configured search profiles.",
          params: "void",
          returns: "SearchProfile[]",
        },
        {
          name: "checkHealth",
          description: "Check RapidAPI and DB connectivity.",
          params: "void",
          returns: "{ rapidApi, db, error? }",
        },
      ],
      tools: ["RapidAPI (Upwork)", "RapidAPI (Freelancer.com)", "Workers AI (Triage)"],
    };
  }

  initialState: FreelanceScannerState = {
    runs: {},
    searchProfiles: [],
    lastScanAt: {},
  };

  onConnect(_connection: Connection) {
    const logger = new Logger(this.env);
    logger.info(`[FreelanceScannerAgent] WebSocket connected`);
  }

  onClose(_connection: Connection) {
    const logger = new Logger(this.env);
    logger.info(`[FreelanceScannerAgent] WebSocket disconnected`);
  }

  onError(error: unknown) {
    const logger = new Logger(this.env);
    logger.error(`[FreelanceScannerAgent] Error: ${error}`);
  }

  @callable()
  async scanUpwork(query?: string, skills?: string, filters?: Record<string, unknown>) {
    const sessionId = crypto.randomUUID();
    this.ctx.waitUntil(
      handleScanUpwork(this.env, this.state, sessionId, { query, skills, filters }, this),
    );
    return sessionId;
  }

  @callable()
  async scanFreelancer(query?: string, skills?: string, filters?: Record<string, unknown>) {
    const sessionId = crypto.randomUUID();
    this.ctx.waitUntil(
      handleScanFreelancer(this.env, this.state, sessionId, { query, skills, filters }, this),
    );
    return sessionId;
  }

  @callable()
  async scanAll() {
    const sessionIds = await handleScanAll(this.env, this.state, this);
    return sessionIds;
  }

  @callable()
  async triagePending() {
    return handleTriageBatch(this.env, this);
  }

  @callable()
  async getRunStatus(sessionId: string) {
    return this.state.runs[sessionId] || null;
  }

  @callable()
  async addSearchProfile(profile: Omit<SearchProfile, "id">) {
    const newProfile: SearchProfile = {
      ...profile,
      id: crypto.randomUUID(),
    };
    this.setState({
      ...this.state,
      searchProfiles: [...this.state.searchProfiles, newProfile],
    });
    return newProfile;
  }

  @callable()
  async removeSearchProfile(id: string) {
    const before = this.state.searchProfiles.length;
    this.setState({
      ...this.state,
      searchProfiles: this.state.searchProfiles.filter((p) => p.id !== id),
    });
    return this.state.searchProfiles.length < before;
  }

  @callable()
  async getSearchProfiles() {
    return this.state.searchProfiles;
  }

  @callable()
  async checkHealth() {
    return checkFreelanceScannerHealth(this.env);
  }

  // Allow methods to broadcast progress
  public emitProgress(progress: FreelanceScanProgress) {
    this.broadcast(JSON.stringify(progress));
  }
}
