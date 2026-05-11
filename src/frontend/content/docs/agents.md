# AI Agents

The Career Orchestrator uses three AI agents built on the **Cloudflare Agents SDK** as **Durable Objects**. Together, they form the intelligence layer that automates the job application process.

## The Bigger Picture

The agents exist to solve a real problem: applying for jobs is repetitive, time-consuming, and error-prone. Each application requires reading the posting, tailoring a resume, writing a cover letter, tracking progress, and responding to recruiter emails. The agents handle the mechanical work so you can focus on strategy and preparation.

## How the Agents Collaborate

The three agents form a layered architecture:

- **[OrchestratorAgent](/docs/agents/orchestrator)** is the primary orchestrator. It manages the full application lifecycle — scraping job postings, extracting data, drafting documents, handling email, and coordinating with the other agents. When Colby needs career knowledge (e.g., "What relevant experience do I have for this role?"), it delegates to the NotebookLM knowledge base.

- **[NotebookLMAgent](/docs/agents/notebooklm)** provides direct access to the career knowledge base via callable RPC and WebSocket. It wraps the NotebookLM SDK and injects agent rules into every query. Both internal code and the frontend chat can query it.

- **[NotebookLMMcpAgent](/docs/agents/notebooklm-mcp)** exposes the same knowledge base as a **remote MCP server** at `/mcp/notebooklm`. This allows external AI tools (Claude, Cursor, etc.) to query your career knowledge using the standard Model Context Protocol.

## Agent Summary

### OrchestratorAgent

The main orchestrator. Handles job scraping, data extraction, document generation, email drafting, and role management. Runs scheduled task processing every 30 seconds. Has persistent state tracking role context and pending tasks.

### NotebookLMAgent

Knowledge retrieval specialist. Provides callable RPC (`consult()`) and WebSocket access to the NotebookLM career knowledge base. Injects configurable agent rules into every query.

### NotebookLMMcpAgent

MCP server wrapper. Exposes the `consult` tool via the Model Context Protocol for external AI tool integration. Authenticated via Bearer token (`WORKER_API_KEY`).
