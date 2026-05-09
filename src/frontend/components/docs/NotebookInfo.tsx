/**
 * @fileoverview NotebookInfo — React component that fetches and displays
 * live NotebookLM configuration metadata on the docs page.
 *
 * Rendered as `client:load` on the `/docs/integrations/notebooklm` page.
 * Fetches from `GET /api/docs/notebooklm` and displays:
 *  - Notebook name as a hyperlink to the Google NotebookLM UI
 *  - Notebook ID
 *  - Chat and MCP endpoint paths
 *  - Credential sources table
 *  - Agent integration cards with links to their docs pages
 */

import { BookOpen, ExternalLink, Key, Link2, Loader2, Cpu } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CredentialSource = {
  name: string;
  storage: string;
  binding: string;
};

type AgentIntegration = {
  agentName: string;
  agentDocsPath: string;
  description: string;
};

type NotebookInfo = {
  notebookId: string;
  notebookUrl: string;
  notebookName: string;
  chatEndpoint: string;
  mcpEndpoint: string;
  credentialSources: CredentialSource[];
  agentIntegrations: AgentIntegration[];
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Fetches live NotebookLM metadata from the API and renders it as a series
 * of cards: notebook identity, endpoints, credentials, and agent integrations.
 */
export function NotebookInfoCard() {
  const [info, setInfo] = useState<NotebookInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/docs/notebooklm", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load");
        setInfo(await res.json());
      })
      .catch(() => setInfo(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading NotebookLM configuration…
      </div>
    );
  }

  if (!info) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Failed to load NotebookLM configuration.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {/* Notebook identity */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 text-primary" />
            <CardTitle>
              <a
                href={info.notebookUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-primary underline underline-offset-4 hover:text-primary/80"
              >
                {info.notebookName}
                <ExternalLink className="size-3.5" />
              </a>
            </CardTitle>
          </div>
          <CardDescription>Google NotebookLM career knowledge base</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Notebook ID:</span>
              <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-xs">
                {info.notebookId}
              </code>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Endpoints */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Link2 className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Endpoints</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            <div className="flex items-baseline gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2">
              <Badge variant="secondary" className="font-mono text-xs">
                POST
              </Badge>
              <code className="font-mono text-sm">{info.chatEndpoint}</code>
              <span className="ml-auto text-xs text-muted-foreground">Frontend chat</span>
            </div>
            <div className="flex items-baseline gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2">
              <Badge variant="secondary" className="font-mono text-xs">
                MCP
              </Badge>
              <code className="font-mono text-sm">{info.mcpEndpoint}</code>
              <span className="ml-auto text-xs text-muted-foreground">External AI tools</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credentials */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Key className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Credential Sources</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {info.credentialSources.map((cred) => (
              <div
                key={cred.binding}
                className="flex items-center gap-3 rounded-md border border-border/40 bg-muted/20 px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground">{cred.name}</span>
                <Badge variant="outline" className="text-xs">
                  {cred.storage}
                </Badge>
                <code className="ml-auto font-mono text-xs text-muted-foreground">
                  {cred.binding}
                </code>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Agent integrations */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Cpu className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Agent Integrations</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {info.agentIntegrations.map((agent) => (
              <a
                key={agent.agentName}
                href={agent.agentDocsPath}
                className="block rounded-md border border-border/40 bg-muted/20 px-3 py-2 transition hover:border-primary/40 hover:bg-muted/40"
              >
                <div className="flex items-center gap-2">
                  <code className="font-mono text-sm font-semibold text-foreground">
                    {agent.agentName}
                  </code>
                  <ExternalLink className="size-3 text-muted-foreground" />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{agent.description}</p>
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
