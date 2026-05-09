import { Agent, callable, type Connection } from "agents";

import { checkNotebookLMSession } from "@/ai/tools/notebooklm/notebooklm";

import { handleConsult, handleMessage } from "./methods/consult";

export class NotebookLMAgent extends Agent<Env> {
  static docsMetadata() {
    return {
      name: "NotebookLM",
      className: "NotebookLMAgent",
      description:
        "A specialized knowledge-retrieval agent that interfaces with Google NotebookLM. Provides callable RPC and WebSocket-based access to the career knowledge base for answering questions about the user's experience, skills, and career history.",
      docsPath: "/docs/agents/notebooklm",
      methods: [
        {
          name: "consult",
          description: "Query the NotebookLM career knowledge base via callable RPC",
          params: "query: string",
          returns: "NotebookConsultation",
        },
        {
          name: "onMessage",
          description: "Handle WebSocket messages — accepts { query: string } or raw string",
          params: "connection: Connection, message: unknown",
          returns: "void (sends result via WebSocket)",
        },
      ],
      tools: [
        "NotebookLM SDK (career knowledge base with conversation context, references, and turn tracking)",
      ],
    };
  }

  @callable()
  async consult(query: string) {
    return handleConsult(this, this.env, query);
  }

  /**
   * Lightweight health probe — delegates session checks to the centralized
   * auth module. The agent itself never touches KV or secrets directly.
   */
  @callable()
  async healthProbe() {
    const start = Date.now();

    if (!this.env.CAREER_NOTEBOOKLM_ID) {
      return {
        status: "fail",
        latencyMs: Date.now() - start,
        error: "CAREER_NOTEBOOKLM_ID not set",
        details: { notebookId: "missing", sessionAvailable: false },
      };
    }

    const session = await checkNotebookLMSession(this.env);

    return {
      status: session.available ? "ok" : "fail",
      latencyMs: Date.now() - start,
      error: session.available ? undefined : "No active session (KV or Secret)",
      details: {
        notebookId: this.env.CAREER_NOTEBOOKLM_ID,
        sessionAvailable: session.available,
        sessionSource: session.source,
      },
    };
  }

  async onMessage(connection: Connection, message: unknown) {
    return handleMessage(this, this.env, connection, message);
  }
}
