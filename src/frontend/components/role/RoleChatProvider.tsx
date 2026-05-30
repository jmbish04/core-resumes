"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { type ReactNode } from "react";

import {
  ConsultNotebookToolUI,
  ScrapeJobToolUI,
  DraftDocumentToolUI,
  SearchCareerMemoryToolUI,
  GenerateMockInterviewToolUI,
  ProcessingStatusToolUI,
  InvestigateTaskErrorToolUI,
} from "@/components/assistant-ui/tool-ui";
import { CloudflareWhisperAdapter } from "@/lib/speech/stt-whisper";
import { CustomTTSAdapter } from "@/lib/speech/tts-adapter";

// ---------------------------------------------------------------------------
// RoleChatProvider — wraps children in assistant-ui runtime
// ---------------------------------------------------------------------------

interface RoleChatProviderProps {
  roleId: string;
  threadId?: string;
  children: ReactNode;
}

export function RoleChatProvider({ roleId, threadId: _threadId, children }: RoleChatProviderProps) {
  const agentConnection = useAgent({
    agent: "RoleChatAgent",
    name: roleId,
  });

  const chatHelpers = useAgentChat({
    agent: agentConnection,
  });

  const runtime = useAISDKRuntime(chatHelpers, {
    adapters: {
      speech: new CustomTTSAdapter({ apiUrl: "/api/tts" }),
      dictation: new CloudflareWhisperAdapter({ endpoint: "/api/transcribe" }),
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {/* Register tool UIs for visual feedback */}
      <ConsultNotebookToolUI />
      <ScrapeJobToolUI />
      <DraftDocumentToolUI />
      <SearchCareerMemoryToolUI />
      <GenerateMockInterviewToolUI />
      <ProcessingStatusToolUI />
      <InvestigateTaskErrorToolUI />
      {children}
    </AssistantRuntimeProvider>
  );
}
