"use client";

/**
 * @fileoverview SalaryIntelChatProvider — assistant-ui runtime provider that
 * connects to the existing RoleChatAgent Durable Object with a
 * `salary-intel` instance name and an enriched system prompt for career
 * pivot advice.
 *
 * Pattern: useAgent → useAgentChat → useAISDKRuntime (Cloudflare Agents DO).
 * Exactly mirrors RoleChatProvider but with salary-intelligence-scoped context.
 */

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { useEffect, useState, type ReactNode } from "react";

import {
  ConsultNotebookToolUI,
  SearchCareerMemoryToolUI,
  ProcessingStatusToolUI,
} from "@/components/assistant-ui/tool-ui";
import { CloudflareWhisperAdapter } from "@/lib/speech/stt-whisper";
import { CustomTTSAdapter } from "@/lib/speech/tts-adapter";
import { AssistantModal } from "@/components/assistant-ui/assistant-modal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CareerContext = {
  userName: string;
  roles: {
    id: string;
    companyName: string;
    jobTitle: string;
    status: string;
    salaryMin: number | null;
    salaryMax: number | null;
  }[];
  marketSummary: {
    avgNationalMedian: number | null;
    avgLocalMedian: number | null;
    totalCompanies: number;
    totalDataPoints: number;
  };
  bullets: { category: string; content: string; impactMetric: string | null }[];
};

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(ctx: CareerContext | null, filterSummary: string): string {
  const name = ctx?.userName || "Justin";

  // Build dynamic context sections
  const rolesSection =
    ctx && ctx.roles.length > 0
      ? `
## ${name}'s Active Roles (${ctx.roles.length} tracked)
${ctx.roles
  .map(
    (r) =>
      `- **${r.companyName}** — ${r.jobTitle} [${r.status}]${r.salaryMin ? ` ($${(r.salaryMin / 1000).toFixed(0)}k–$${((r.salaryMax ?? r.salaryMin) / 1000).toFixed(0)}k)` : ""}`,
  )
  .join("\n")}`
      : "";

  const marketSection =
    ctx && ctx.marketSummary.totalDataPoints > 0
      ? `
## Current Market Overview
- National median: ${ctx.marketSummary.avgNationalMedian ? `$${(ctx.marketSummary.avgNationalMedian / 1000).toFixed(0)}k` : "N/A"}
- SF local median: ${ctx.marketSummary.avgLocalMedian ? `$${(ctx.marketSummary.avgLocalMedian / 1000).toFixed(0)}k` : "N/A"}
- Companies tracked: ${ctx.marketSummary.totalCompanies}
- Data points: ${ctx.marketSummary.totalDataPoints}`
      : "";

  const bulletsSection =
    ctx && ctx.bullets.length > 0
      ? `
## ${name}'s Career Background (verified accomplishments)
${ctx.bullets
  .slice(0, 20)
  .map((b) => {
    const metric = b.impactMetric ? ` (${b.impactMetric})` : "";
    return `- [${b.category}]${metric} ${b.content}`;
  })
  .join("\n")}`
      : "";

  return `You are ${name}'s Headhunter, Salary Intelligence Analyst, and Career Pivot Advisor — embedded directly in the Salary Intelligence dashboard.

## Your Mission
Help ${name} understand compensation trends, identify career pivot opportunities, negotiate offers, and make data-driven career decisions.

## Your Capabilities
- **consultNotebook**: Query NotebookLM for verified career evidence (packed with the user's full career history, performance reviews, project achievements)
- **searchCareerMemory**: Search the semantic career memory store for past analyses, interview prep, and saved insights
- **consultSalaryAgent**: Ask the SalaryAgent for real-time market data, geographic premiums, remote discounts, H1B filings, and aggregate insights
- **getProcessingStatus**: Check pipeline status for background tasks

## Instructions
- Always ground advice in real data — use your tools proactively
- When ${name} asks about their background, qualifications, or experience → use consultNotebook
- When ${name} asks about salary ranges, market rates, or compensation → use consultSalaryAgent
- When asked to filter or adjust the dashboard → emit a filter update event
- Be proactive about identifying career pivots, salary negotiation leverage, and emerging high-paying segments
- Format responses with clear headings, bullet points, and data citations
- When you find salary data, present it as a comparison table when possible
${rolesSection}
${marketSection}
${bulletsSection}

## Current Dashboard State
${filterSummary}`;
}

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

interface SalaryIntelChatProviderProps {
  filterSummary: string;
  children?: ReactNode;
}

export function SalaryIntelChatProvider({
  filterSummary,
  children,
}: SalaryIntelChatProviderProps) {
  const [careerContext, setCareerContext] = useState<CareerContext | null>(null);

  // Fetch career context on mount
  useEffect(() => {
    fetch("/api/pipeline/salary-intelligence/context")
      .then((r) => (r.ok ? (r.json() as Promise<CareerContext>) : null))
      .then((data) => {
        if (data) setCareerContext(data);
      })
      .catch(() => {
        /* non-critical — agent can still function without pre-loaded context */
      });
  }, []);

  const systemPrompt = buildSystemPrompt(careerContext, filterSummary);

  const agentConnection = useAgent({
    agent: "RoleChatAgent",
    name: "salary-intel",
  });

  const chatHelpers = useAgentChat({
    agent: agentConnection,
    body: {
      system: systemPrompt,
    },
  });

  const runtime = useAISDKRuntime(chatHelpers, {
    adapters: {
      speech: new CustomTTSAdapter({ apiUrl: "/api/tts" }),
      dictation: new CloudflareWhisperAdapter({ endpoint: "/api/transcribe" }),
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* Tool UIs for visual feedback during tool calls */}
      <ConsultNotebookToolUI />
      <SearchCareerMemoryToolUI />
      <ProcessingStatusToolUI />

      {children}

      {/* Floating assistant modal */}
      <AssistantModal />
    </AssistantRuntimeProvider>
  );
}
