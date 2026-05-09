/**
 * @fileoverview Renders a single agent's metadata card for dedicated agent docs pages.
 * Fetches from /api/docs/agents and displays the matching agent's full details.
 */

import { Bot, Code, Cpu, Terminal, Wrench } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type AgentMethod = {
  name: string;
  description: string;
  params?: string;
  returns?: string;
};

type McpTool = {
  name: string;
  description: string;
  inputSchema: string;
};

type AgentMeta = {
  name: string;
  className: string;
  description: string;
  docsPath: string;
  methods: AgentMethod[];
  tools: string[];
  aiModels?: string[];
  mcpTools?: McpTool[];
  systemPrompt?: string;
  stateShape?: string;
  scheduledTasks?: string[];
};

export function AgentCard({ agentClassName }: { agentClassName: string }) {
  const [agent, setAgent] = useState<AgentMeta | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/docs/agents", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load");
        const data = (await res.json()) as { agents: AgentMeta[] };
        const found = data.agents.find((a: AgentMeta) => a.className === agentClassName);
        setAgent(found ?? null);
      })
      .catch(() => setAgent(null))
      .finally(() => setLoading(false));
  }, [agentClassName]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-6 text-sm text-muted-foreground">
        <Bot className="size-4 animate-pulse" />
        Loading agent metadata…
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        Agent not found: {agentClassName}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {/* Description */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="size-5 text-primary" />
            <CardTitle>{agent.name}</CardTitle>
            <Badge variant="secondary" className="font-mono text-xs">
              {agent.className}
            </Badge>
          </div>
          <CardDescription>{agent.description}</CardDescription>
        </CardHeader>
      </Card>

      {/* State shape */}
      {agent.stateShape && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Code className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">State Shape</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <code className="block rounded-md bg-muted/50 px-3 py-2 font-mono text-sm">
              {agent.stateShape}
            </code>
          </CardContent>
        </Card>
      )}

      {/* System prompt */}
      {agent.systemPrompt && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Terminal className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">System Prompt</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <blockquote className="border-l-2 border-primary/50 pl-4 text-sm italic text-muted-foreground">
              {agent.systemPrompt}
            </blockquote>
          </CardContent>
        </Card>
      )}

      {/* Methods */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Code className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Methods</CardTitle>
            <Badge variant="outline" className="text-xs">
              {agent.methods.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2">
            {agent.methods.map((method) => (
              <div
                key={method.name}
                className="rounded-md border border-border/40 bg-muted/20 px-3 py-2"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <code className="font-mono text-sm font-semibold text-foreground">
                    {method.name}
                  </code>
                  {method.params && (
                    <span className="font-mono text-xs text-muted-foreground">
                      ({method.params})
                    </span>
                  )}
                  {method.returns && (
                    <span className="font-mono text-xs text-primary/80">→ {method.returns}</span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{method.description}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* MCP Tools */}
      {agent.mcpTools && agent.mcpTools.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Wrench className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">MCP Tools</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {agent.mcpTools.map((tool) => (
                <div
                  key={tool.name}
                  className="rounded-md border border-border/40 bg-muted/20 px-3 py-2"
                >
                  <code className="font-mono text-sm font-semibold">{tool.name}</code>
                  <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
                  <code className="mt-1 block font-mono text-xs text-muted-foreground">
                    {tool.inputSchema}
                  </code>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tools */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Wrench className="size-4 text-muted-foreground" />
            <CardTitle className="text-base">Tools & Integrations</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1">
            {agent.tools.map((tool) => (
              <li key={tool} className="flex items-start gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                {tool}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* AI Models */}
      {agent.aiModels && agent.aiModels.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Cpu className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">AI Models</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {agent.aiModels.map((model) => (
                <Badge key={model} variant="secondary" className="font-mono text-xs">
                  {model}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scheduled Tasks */}
      {agent.scheduledTasks && agent.scheduledTasks.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Scheduled Tasks</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1">
              {agent.scheduledTasks.map((task) => (
                <li key={task} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                  {task}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
