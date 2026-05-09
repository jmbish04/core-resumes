import { X, Copy } from "lucide-react";
import { useEffect, useState } from "react";

import { toast, type ToastMessage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type ToastRecord = ToastMessage & { id: string };

export function Toaster() {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  useEffect(() => {
    function onToast(event: Event) {
      const detail = (event as CustomEvent<ToastMessage>).detail;
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { ...detail, id }].slice(-4));
      window.setTimeout(() => dismiss(id), 6000);
    }

    window.addEventListener("app:toast", onToast);
    return () => window.removeEventListener("app:toast", onToast);
  }, []);

  function dismiss(id: string) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  }

  return (
    <div className="fixed top-4 right-4 z-50 flex w-[min(100%-2rem,24rem)] flex-col gap-2">
      {toasts.map((toastItem) => (
        <div
          key={toastItem.id}
          className={cn(
            "rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg",
            toastItem.variant === "destructive" && "border-destructive/40 text-destructive",
            toastItem.variant === "success" && "border-emerald-500/40 text-emerald-400",
          )}
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{toastItem.title}</div>
              {toastItem.description && (
                <div className="mt-1 text-sm text-muted-foreground break-words">
                  {toastItem.description}
                </div>
              )}
              {toastItem.copyable && toastItem.description && !toastItem.codingPrompt && (
                <button
                  type="button"
                  className="mt-2 flex items-center gap-1.5 rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  onClick={() => copyToClipboard(toastItem.description!)}
                >
                  <Copy className="size-3" />
                  Copy details
                </button>
              )}
              {toastItem.codingPrompt && (
                <button
                  type="button"
                  className="mt-2 flex items-center gap-1.5 rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  onClick={() => copyToClipboard(toastItem.codingPrompt!)}
                >
                  <Copy className="size-3" />
                  Copy Prompt for AI
                </button>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              onClick={() => dismiss(toastItem.id)}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
