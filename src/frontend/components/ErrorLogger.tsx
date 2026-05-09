import { useEffect } from "react";

import { toast } from "@/lib/api-client";

import { Toaster } from "./ui/toaster";

export function ErrorLogger() {
  useEffect(() => {
    function report(payload: Record<string, unknown>) {
      fetch("/api/__client-error", {
        body: JSON.stringify(payload),
        credentials: "include",
        headers: { "content-type": "application/json" },
        method: "POST",
      }).catch(() => undefined);
    }

    function onError(event: ErrorEvent) {
      toast({
        title: "Runtime error",
        description: event.message,
        variant: "destructive",
        codingPrompt: `Please fix the following frontend runtime error:\n\nMessage: ${event.message}\nURL: ${window.location.href}\nUserAgent: ${navigator.userAgent}\nStack Trace:\n\`\`\`text\n${event.error instanceof Error ? event.error.stack : "No stack trace available"}\n\`\`\``,
      });
      report({
        message: event.message,
        stack: event.error instanceof Error ? event.error.stack : undefined,
        url: window.location.href,
        userAgent: navigator.userAgent,
      });
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      toast({
        title: "Unhandled promise rejection",
        description: reason.message,
        variant: "destructive",
        codingPrompt: `Please fix the following frontend unhandled promise rejection:\n\nMessage: ${reason.message}\nURL: ${window.location.href}\nUserAgent: ${navigator.userAgent}\nStack Trace:\n\`\`\`text\n${reason.stack || "No stack trace available"}\n\`\`\``,
      });
      report({
        message: reason.message,
        stack: reason.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
      });
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return <Toaster />;
}
