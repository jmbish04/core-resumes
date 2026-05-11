# NotebookLMMcpAgent

**NotebookLMMcpAgent** exposes the career knowledge base as a **remote MCP (Model Context Protocol) server**, enabling external AI tools to query your career knowledge through a standardized interface.

## Overview

This agent extends `McpAgent` from the Cloudflare Agents SDK to implement an MCP server. It registers a single tool (`consult`) that wraps the same `consultNotebook()` function used by the other agents.

## Endpoint

The MCP server is accessible at:

`/mcp/notebooklm`

### Authentication

All requests require a Bearer token in the `Authorization` header. The token is validated against `WORKER_API_KEY` from the Cloudflare Secrets Store.

### MCP Tool: consult

- **Name:** `consult`
- **Description:** Consult the NotebookLM knowledge base
- **Input:** `{ query: string }` — A natural-language question about the user's career, experience, or skills
- **Output:** A text response containing the NotebookLM answer

## Use Cases

- **Claude Desktop** — Add the MCP endpoint as a remote tool so Claude can reference your career knowledge during conversations
- **Cursor IDE** — Connect the MCP server so your AI coding assistant understands your career context
- **Custom agents** — Any MCP-compatible agent can query your knowledge base for personalized career assistance

## Live Agent Metadata

The following is fetched live from the agent's `docsMetadata()` method:
