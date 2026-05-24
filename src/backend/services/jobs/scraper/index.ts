/**
 * @fileoverview Scraper service for Greenhouse jobs.
 */

export async function fetchBoard(env: Env, token: string) {
  const url = `${env.GREENHOUSE_API_BASE}/${token}/jobs?content=true`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch jobs for ${token}: ${res.status}`);
  }
  const data = (await res.json()) as any;
  return data.jobs || [];
}

export async function parse(rawHtml: string): Promise<string> {
  let accumulatedText = "";
  const rewriter = new HTMLRewriter().on("*", {
    text(chunk) {
      accumulatedText += chunk.text;
    },
  });

  const response = new Response(rawHtml);
  await rewriter.transform(response).text();

  return accumulatedText.replace(/\s+/g, " ").trim();
}

export async function applyTemplate(env: Env, company: string, rawHtml: string): Promise<string> {
  // CSS selector based stripping
  // Stub implementation
  return rawHtml;
}
