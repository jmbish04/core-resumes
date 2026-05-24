"use client";

import Markdown from "react-markdown";

/**
 * MarkdownText — renders assistant message text with rich markdown formatting.
 * Used as the Text component in MessagePrimitive.Content.
 *
 * Uses react-markdown for safe parsing (no dangerouslySetInnerHTML).
 */
export function MarkdownText({ text }: { text: string }) {
  return (
    <div className="text-sm leading-relaxed prose prose-sm prose-invert max-w-none">
      <Markdown
        components={{
          // Override default elements with Tailwind-friendly styling
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="mb-2 list-disc pl-4">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 list-decimal pl-4">{children}</ol>,
          li: ({ children }) => <li className="mb-0.5">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              {children}
            </a>
          ),
          code: ({ children, className }) => {
            // Inline code vs code blocks
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <code className="block bg-muted/50 rounded-md p-3 text-xs overflow-x-auto my-2">
                  {children}
                </code>
              );
            }
            return (
              <code className="bg-muted/50 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
            );
          },
          pre: ({ children }) => <pre className="my-2">{children}</pre>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-3 my-2 text-muted-foreground italic">
              {children}
            </blockquote>
          ),
          h1: ({ children }) => <h1 className="text-lg font-bold mt-3 mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-bold mt-2 mb-1">{children}</h3>,
          hr: () => <hr className="my-3 border-border" />,
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-muted/30 px-2 py-1 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
