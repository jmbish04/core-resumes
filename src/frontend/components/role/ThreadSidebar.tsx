import { useAgent } from "agents/react";
import { SendHorizontal } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiGet, toast } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import type { MessageRow, ThreadRow } from "../dashboard/types";

type ThreadResponse = {
  threads: ThreadRow[];
  messages: MessageRow[];
};

export function ThreadSidebar({ roleId }: { roleId: string }) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [content, setContent] = useState("");
  const agent = useAgent({
    agent: "OrchestratorAgent",
    name: roleId,
    onMessage: (event) => {
      const parsed = parseAgentMessage(event.data);

      if (parsed?.type === "message" && typeof parsed.content === "string") {
        const agentContent = parsed.content;
        setMessages((current) => [
          ...current,
          {
            author: "agent",
            content: agentContent,
            id: crypto.randomUUID(),
            roleId,
            threadId: "live",
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    },
  });

  useEffect(() => {
    apiGet<ThreadResponse>(`/api/threads/${roleId}`).then((data) => setMessages(data.messages));
  }, [roleId]);

  function send() {
    const trimmed = content.trim();

    if (!trimmed) {
      return;
    }

    const message: MessageRow = {
      author: "user",
      content: trimmed,
      id: crypto.randomUUID(),
      roleId,
      threadId: "live",
      timestamp: new Date().toISOString(),
    };
    setMessages((current) => [...current, message]);
    setContent("");

    try {
      agent.send(JSON.stringify({ type: "chat", content: trimmed, roleId }));
    } catch (error) {
      toast({
        title: "Message not sent",
        description: error instanceof Error ? error.message : "Agent socket is unavailable.",
        variant: "destructive",
      });
    }
  }

  return (
    <aside className="grid h-[calc(100svh-6rem)] min-h-[32rem] grid-rows-[auto_1fr_auto] rounded-lg border border-border bg-card">
      <div className="border-b border-border p-4">
        <div className="text-sm font-medium">Colby</div>
        <div className="text-xs text-muted-foreground">
          {typeof WebSocket !== "undefined" && agent.readyState === WebSocket.OPEN
            ? "Connected"
            : "Connecting"}
        </div>
      </div>

      <div className="grid content-start gap-3 overflow-auto p-4">
        {messages.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            No thread messages yet.
          </p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[90%] rounded-lg px-3 py-2 text-sm",
                message.author === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
                message.author === "system" &&
                  "border border-border bg-transparent text-muted-foreground",
              )}
            >
              {message.content}
            </div>
          ))
        )}
      </div>

      <form
        className="grid gap-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <Textarea value={content} onChange={(event) => setContent(event.target.value)} rows={3} />
        <Button type="submit" className="justify-self-end">
          <SendHorizontal className="size-4" />
          Send
        </Button>
      </form>
    </aside>
  );
}

function parseAgentMessage(data: unknown) {
  if (typeof data !== "string") {
    return null;
  }

  try {
    return JSON.parse(data) as { type?: string; content?: string };
  } catch {
    return null;
  }
}
