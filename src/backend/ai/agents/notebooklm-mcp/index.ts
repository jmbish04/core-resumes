import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { callable } from "agents";
import { McpAgent } from "agents/mcp";

import { checkHealth as healthProbeImpl } from "./health";
import { initMcpServer } from "./methods/mcp";

export class NotebookLMMcpAgent extends McpAgent<Env, any, any> {
  static docsMetadata() {
    return {
      name: "NotebookLM MCP",
      className: "NotebookLMMcpAgent",
      description:
        "Exposes the NotebookLM career knowledge base as a remote MCP (Model Context Protocol) server. External AI tools and agents can connect via the /mcp/notebooklm endpoint (Bearer token auth) to query career knowledge using the standard MCP tool-calling interface.",
      docsPath: "/docs/agents/notebooklm-mcp",
      methods: [
        {
          name: "init",
          description: "Registers MCP tools on server startup",
          params: "none",
          returns: "void",
        },
      ],
      tools: ["NotebookLM SDK (via MCP tool interface)"],
      mcpTools: [
        {
          name: "consult",
          description: "Consult the NotebookLM knowledge base",
          inputSchema: '{ "query": "z.string()" }',
        },
      ],
    };
  }

  server = new McpServer({
    name: "NotebookLM",
    version: "1.0.0",
  });

  async init() {
    await initMcpServer(this, this.env);
  }

  @callable()
  async healthProbe() {
    return healthProbeImpl(this, this.env);
  }
}
