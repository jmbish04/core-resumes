/**
 * @fileoverview Core Resumes OAuth provider — issues OAuth 2.1 access tokens
 * that grant clients (Claude Chat, Claude Desktop, etc.) access to the MCP
 * server at `/mcp` and `/sse`.
 *
 * Two auth paths coexist on the MCP routes:
 *   1. Pre-shared `Authorization: Bearer $WORKER_API_KEY` — fast path for
 *      programmatic clients (Claude Code CLI, internal scripts). Checked in
 *      `_worker.ts` before this provider is invoked.
 *   2. OAuth 2.1 dynamic-client-registration flow — for clients that don't
 *      support pre-shared keys (Claude Chat web).
 *
 * Storage: backed by the `OAUTH_KV` namespace binding declared in
 * `wrangler.jsonc` (aliased to the existing `KV` namespace).
 */
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";

import { makeOAuthDefaultHandler } from "./consent";

const SCOPES_SUPPORTED = ["mcp"];

/**
 * Build and configure the OAuthProvider with the two MCP transport
 * endpoints registered as protected API routes.
 *
 * The provider implements:
 *   - GET  /.well-known/oauth-authorization-server  (RFC 8414 metadata)
 *   - POST /oauth/token                              (token exchange)
 *   - POST /oauth/register                           (RFC 7591 dynamic registration)
 *
 * Non-API requests (notably GET /oauth/authorize, used to render the
 * consent UI) are forwarded to the consent handler defined in `consent.ts`.
 *
 * @param origin - The worker's public origin (e.g. https://core-resumes.example.workers.dev).
 *                 Used for the `authorization_servers` field of the
 *                 protected-resource metadata document.
 * @param apiHandlers - The Streamable HTTP + SSE handlers from
 *                      `CoreResumesMcpAgent.serve()` / `.serveSSE()`.
 */
export function createOAuthProvider(
  origin: string,
  apiHandlers: {
    mcp: { fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> };
    sse: { fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> };
  },
): OAuthProvider {
  return new OAuthProvider({
    apiHandlers: {
      // Multi-handler mode: prefix → handler.
      "/mcp": apiHandlers.mcp as any,
      "/sse": apiHandlers.sse as any,
    },
    defaultHandler: makeOAuthDefaultHandler(origin) as any,
    authorizeEndpoint: "/oauth/authorize",
    tokenEndpoint: "/oauth/token",
    clientRegistrationEndpoint: "/oauth/register",
    scopesSupported: SCOPES_SUPPORTED,
    accessTokenTTL: 3600, // 1 hour
    refreshTokenTTL: 60 * 60 * 24 * 30, // 30 days
  });
}
