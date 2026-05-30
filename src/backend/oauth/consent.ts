/**
 * @fileoverview OAuth consent + authorize handler.
 *
 * Renders a minimal consent UI for `/oauth/authorize`, completes the
 * authorization on POST, and redirects back to the OAuth client's
 * redirect_uri with the authorization code attached.
 *
 * Auth model: single-user. The user is "authorized" iff they have a valid
 * `cr_session` cookie. If they're not signed in we 302 them to /login with
 * the original /oauth/authorize URL preserved as a return path.
 */
import { verifySessionCookie } from "@/backend/lib/cookies";

type OAuthHelpers = {
  parseAuthRequest(request: Request): Promise<any>;
  lookupClient(clientId: string): Promise<any>;
  completeAuthorization(args: {
    request: any;
    userId: string;
    metadata?: Record<string, unknown>;
    scope: string[];
    props?: Record<string, unknown>;
  }): Promise<{ redirectTo: string }>;
};

type ConsentEnv = Env & { OAUTH_PROVIDER: OAuthHelpers };

const SCOPES_SUPPORTED = ["mcp"];

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Handle GET /oauth/authorize — show consent UI.
 * Handle POST /oauth/authorize — complete the authorization & redirect.
 *
 * The OAuth provider library auto-attaches `OAUTH_PROVIDER` to env when the
 * default handler is invoked.
 */
export async function handleAuthorize(request: Request, env: ConsentEnv): Promise<Response> {
  const url = new URL(request.url);

  // Require a valid local session before showing OR completing consent.
  const session = await verifySessionCookie(env, request.headers.get("cookie"));
  if (!session) {
    const returnTo = encodeURIComponent(url.pathname + url.search);
    return Response.redirect(`${url.origin}/login?returnTo=${returnTo}`, 302);
  }

  let oauthReqInfo: any;
  try {
    oauthReqInfo = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  } catch (err) {
    return new Response(
      `Invalid OAuth authorization request: ${err instanceof Error ? err.message : String(err)}`,
      { status: 400 },
    );
  }

  let clientInfo: any = null;
  try {
    clientInfo = await env.OAUTH_PROVIDER.lookupClient(oauthReqInfo.clientId);
  } catch {
    // Client may have just registered — proceed without metadata.
  }

  // POST = user clicked Approve in the consent form.
  if (request.method === "POST") {
    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
      request: oauthReqInfo,
      userId: session.sub, // "single-user"
      metadata: {
        clientName: clientInfo?.clientName ?? "Unknown MCP client",
        approvedAt: new Date().toISOString(),
      },
      scope: oauthReqInfo.scope?.length ? oauthReqInfo.scope : SCOPES_SUPPORTED,
      props: { userId: session.sub },
    });
    return Response.redirect(redirectTo, 302);
  }

  // GET = render the consent HTML.
  const clientName: string =
    (clientInfo?.clientName as string | undefined) ?? "An MCP client";
  const clientUri: string | undefined = clientInfo?.clientUri;
  const requestedScopes: string[] =
    Array.isArray(oauthReqInfo.scope) && oauthReqInfo.scope.length
      ? oauthReqInfo.scope
      : SCOPES_SUPPORTED;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize ${escapeHtml(clientName)} · Core Resumes MCP</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0c0a09;
      --fg: #fafaf9;
      --muted: #a8a29e;
      --border: #292524;
      --accent: #f97316;
      --accent-fg: #0c0a09;
      --danger: #ef4444;
      --card: #18181b;
    }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--fg);
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem 1rem;
    }
    .card {
      width: 100%;
      max-width: 28rem;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 2rem;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.45);
    }
    h1 {
      margin: 0 0 0.5rem;
      font-size: 1.5rem;
      letter-spacing: -0.01em;
    }
    .sub {
      color: var(--muted);
      font-size: 0.9rem;
      margin-bottom: 1.5rem;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--border);
      font-size: 0.9rem;
    }
    .row:last-child { border: none; }
    .row .k { color: var(--muted); }
    .row .v { color: var(--fg); font-weight: 500; word-break: break-all; text-align: right; }
    ul.scopes {
      list-style: none;
      padding: 0;
      margin: 1rem 0 1.5rem;
      font-size: 0.9rem;
    }
    ul.scopes li {
      padding: 0.5rem 0.75rem;
      background: rgba(249, 115, 22, 0.08);
      border: 1px solid rgba(249, 115, 22, 0.35);
      border-radius: 0.4rem;
      margin-bottom: 0.5rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    }
    .actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 1.5rem;
    }
    .btn {
      flex: 1;
      padding: 0.65rem 1rem;
      border-radius: 0.5rem;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--fg);
      transition: all 120ms ease;
    }
    .btn:hover { background: rgba(255, 255, 255, 0.04); }
    .btn-approve {
      background: var(--accent);
      color: var(--accent-fg);
      border-color: var(--accent);
    }
    .btn-approve:hover { filter: brightness(1.1); background: var(--accent); }
    .footer { margin-top: 1.25rem; font-size: 0.75rem; color: var(--muted); text-align: center; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.85em; }
  </style>
</head>
<body>
  <main class="card">
    <h1>Authorize ${escapeHtml(clientName)}</h1>
    <p class="sub">This MCP client is requesting access to your Core Resumes data via the Model Context Protocol.</p>

    <div class="row">
      <span class="k">Client</span>
      <span class="v">${escapeHtml(clientName)}</span>
    </div>
    ${
      clientUri
        ? `<div class="row"><span class="k">Website</span><span class="v">${escapeHtml(clientUri)}</span></div>`
        : ""
    }
    <div class="row">
      <span class="k">Redirect URI</span>
      <span class="v"><code>${escapeHtml(oauthReqInfo.redirectUri ?? "")}</code></span>
    </div>

    <h3 style="margin: 1.25rem 0 0.5rem; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted);">Requested Access</h3>
    <ul class="scopes">
      ${requestedScopes.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}
    </ul>
    <p class="sub" style="margin: -0.5rem 0 1rem;">
      Approving this connection lets the client invoke any of the ~60 MCP tools — including reading & editing roles, documents, freelance proposals, salary data, and career memory.
    </p>

    <form method="POST" action="${escapeHtml(url.pathname + url.search)}">
      <div class="actions">
        <a class="btn" href="/" style="text-align: center; text-decoration: none; line-height: 1.4;">Deny</a>
        <button class="btn btn-approve" type="submit">Approve</button>
      </div>
    </form>
    <p class="footer">You're signed in as <strong>${escapeHtml(session.sub)}</strong>.</p>
  </main>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * OAuth default handler — covers `/oauth/authorize` and `/.well-known/oauth-protected-resource`.
 *
 * `/.well-known/oauth-authorization-server` is implemented by the
 * OAuthProvider itself; the protected-resource metadata document points
 * MCP clients at our authorization server.
 */
export function makeOAuthDefaultHandler(authorizationServerUrl: string) {
  return {
    async fetch(request: Request, env: ConsentEnv): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === "/oauth/authorize") {
        return handleAuthorize(request, env);
      }
      if (url.pathname === "/.well-known/oauth-protected-resource") {
        return new Response(
          JSON.stringify({
            resource: url.origin,
            authorization_servers: [authorizationServerUrl],
            scopes_supported: SCOPES_SUPPORTED,
            bearer_methods_supported: ["header"],
            resource_documentation: `${url.origin}/mcp`,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("Not found", { status: 404 });
    },
  };
}
