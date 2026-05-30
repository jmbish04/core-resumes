/**
 * @fileoverview SalaryAgent — Cloudflare Agents SDK stateful Durable Object
 * designed for deep market salary trend analytics.
 *
 * ## Modes
 * 1. Single-Role: Evaluates a specific role against market benchmarks and computes leverage.
 * 2. Aggregate: Computes macro trends for the Career Dreamer dashboard.
 * 3. Chat: Interactive Q&A backed by deterministic SQL tools.
 */

import { Agent, type Connection, callable } from "agents";
import { checkHealth as healthProbeImpl } from "./health";
import { runSingleRoleMode } from "./modes/single-role";
import { runAggregateMode } from "./modes/aggregate";
import { runChatMode } from "./modes/chat";

export class SalaryAgent extends Agent<Env, Record<string, never>> {
  // -------------------------------------------------------------------------
  // DO Lifecycle Hooks
  // -------------------------------------------------------------------------

  onConnect(connection: Connection): void {
    console.log(`[SalaryAgent] Client connected – id=${connection.id}`);
  }

  onClose(connection: Connection): void {
    console.log(`[SalaryAgent] Client disconnected – id=${connection.id}`);
  }

  @callable()
  async healthProbe() {
    return healthProbeImpl(this, this.env);
  }

  // -------------------------------------------------------------------------
  // Agent Methods (Mode Routing)
  // -------------------------------------------------------------------------

  /**
   * Mode A: Single-Role Analysis
   */
  @callable()
  async analyzeRole(roleId: string): Promise<any> {
    return runSingleRoleMode(this, this.env, roleId);
  }

  /**
   * Mode B: Aggregate / Career Dreamer Analysis
   */
  @callable()
  async analyzeAggregate(input: any): Promise<any> {
    return runAggregateMode(this, this.env, input);
  }

  /**
   * Mode C: Interactive Chat
   */
  @callable()
  async chat(messages: any[], context: any): Promise<any> {
    return runChatMode(this, this.env, messages, context);
  }

  // -------------------------------------------------------------------------
  // Docs Metadata for /api/docs/agents
  // -------------------------------------------------------------------------

  static docsMetadata() {
    return {
      name: "Salary Intelligence",
      className: "SalaryAgent",
      description:
        "Autonomous compensation agent. Utilizes a deterministic SQL benchmark battery and Workers AI to deliver salary trends & negotiation advice.",
      docsPath: "/docs/agents/salary",
      invocationPattern: "Worker → Agent DO RPC via getAgentByName.",
      methods: [
        {
          name: "analyzeRole",
          description: "Runs role-specific benchmark battery and leverage scorer.",
          params: "roleId: string",
          returns: "Promise<any>",
        },
        {
          name: "analyzeAggregate",
          description: "Synthesizes macro trends for the Career Dreamer dashboard.",
          params: "input: any",
          returns: "Promise<any>",
        },
        {
          name: "chat",
          description: "Performs Q&A backed by deterministic SQL tools.",
          params: "messages: any[], context: any",
          returns: "Promise<any>",
        },
      ],
    };
  }
}
