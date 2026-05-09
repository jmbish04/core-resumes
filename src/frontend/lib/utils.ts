import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Converts basic Markdown formatting to HTML.
 * Handles bold, italics, code blocks, inline code, links, and lists.
 */
export function parseMarkdownToHtml(markdown: string): string {
  if (!markdown) return "";

  // 1. Escape HTML to prevent XSS
  let html = markdown.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // 2. Code blocks (```language\ncode\n```)
  html = html.replace(
    /```[a-z]*\n([\s\S]*?)\n```/g,
    '<pre class="bg-muted p-3 rounded-md overflow-x-auto my-2"><code class="text-xs font-mono">$1</code></pre>',
  );

  // 3. Inline code (`code`)
  html = html.replace(
    /`([^`\n]+)`/g,
    '<code class="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">$1</code>',
  );

  // 4. Bold (**text** or __text__)
  html = html.replace(/\*\*([^\*\n]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");

  // 5. Italic (*text* or _text_)
  html = html.replace(/\*([^\*\n]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^\_\n]+)_/g, "<em>$1</em>");

  // 6. Headers (# Header)
  html = html.replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold mt-4 mb-2">$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>');

  // 7. Links ([text](url))
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">$1</a>',
  );

  // 8. Lists (* item or - item or 1. item)
  // We wrap them in standard HTML list item tags but rely on Tailwind typography classes
  html = html.replace(/^[ \t]*[-*][ \t]+(.+)$/gm, '<li class="ml-4 list-disc">$1</li>');
  html = html.replace(/^[ \t]*\d+\.[ \t]+(.+)$/gm, '<li class="ml-4 list-decimal">$1</li>');

  return html;
}
