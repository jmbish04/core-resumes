"use client";

import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { type ReactNode } from "react";

import {
  ConsultNotebookToolUI,
  ScrapeJobToolUI,
  DraftDocumentToolUI,
  SearchCareerMemoryToolUI,
  GenerateMockInterviewToolUI,
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

export function RoleChatProvider({ roleId, threadId, children }: RoleChatProviderProps) {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
      body: { roleId, threadId },
    }),
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
      {children}
    </AssistantRuntimeProvider>
  );
}
