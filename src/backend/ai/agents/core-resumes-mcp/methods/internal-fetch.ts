/**
 * @fileoverview Internal-fetch helper used by every MCP tool to dispatch
 * through the existing Hono API router.
 *
 * Why this pattern: the API already has comprehensive zod-openapi
 * validation, the auth middleware accepts WORKER_API_KEY as a Bearer
 * fallback, and every route already wires up its services / D1 inserts /
 * orchestrator enqueues. Re-implementing all that inside MCP tools would
 * be a maintenance disaster. Instead, each tool builds a synthetic
 * `Request` (with Bearer auth header injected) and calls `app.fetch`.
 */
import { app as honoApp } from "@/backend/api";
import { getWorkerApiKey } from "@/utils/secrets";

const INTERNAL_BASE = "http://internal.core-resumes.local";

export type InternalFetchInit = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  headers?: Record<string, string>;
};

/**
 * Dispatch a request through the internal Hono router with Bearer auth.
 *
 * @param env - Worker bindings
 * @param path - Absolute API path, e.g. `/api/roles` or `/api/intake/confirm`
 * @param init - Method, query, body, extra headers
 * @returns The Response from the Hono router (caller decides how to parse)
 */
export async function internalFetch(env: Env, path: string, init: InternalFetchInit = {}) {
  const apiKey = await getWorkerApiKey(env);
  const url = new URL(path, INTERNAL_BASE);

  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v === undefined || v === null) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
    ...init.headers,
  };

  const req = new Request(url.toString(), {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  return honoApp.fetch(req, env);
}

/**
 * JSON-flavored helper: dispatches the request and returns the parsed body,
 * or an `{ error, status, body }` envelope if the response wasn't 2xx.
 *
 * MCP tools return text content, so we serialize the result via JSON.stringify
 * at the call site. The error envelope is JSON-stringifiable too, which
 * surfaces failures to the calling model in a structured way.
 */
export async function internalFetchJson(env: Env, path: string, init: InternalFetchInit = {}) {
  const res = await internalFetch(env, path, init);
  const ct = res.headers.get("content-type") ?? "";
  let parsed: unknown;
  if (ct.includes("application/json")) {
    parsed = await res.json().catch(() => undefined);
  } else {
    parsed = await res.text().catch(() => undefined);
  }
  if (!res.ok) {
    return {
      error: true as const,
      status: res.status,
      statusText: res.statusText,
      body: parsed,
    };
  }
  return parsed;
}

/**
 * Consume an SSE response and collect all events. Used by `submit_role_url`
 * which wraps the SSE-streaming `/api/intake/scrape` endpoint.
 *
 * @returns An array of `{ stage, payload }` objects in arrival order.
 */
export async function consumeSse(
  res: Response,
): Promise<Array<{ stage: string; payload?: unknown }>> {
  if (!res.body) return [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const events: Array<{ stage: string; payload?: unknown }> = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      const json = dataLine.slice(6);
      try {
        events.push(JSON.parse(json));
      } catch {
        // ignore malformed SSE frame
      }
    }
  }

  return events;
}

/**
 * Defensive cap on tool-result size. Claude's hosted surfaces (web,
 * desktop, iOS) enforce a hard ~150,000 character ceiling on each tool
 * response. We trim to 140k to leave headroom for JSON envelope overhead
 * the SDK adds on top of our `text` payload, then append a clear
 * truncation marker so the model knows to paginate / narrow the query.
 */
const MAX_TOOL_RESULT_CHARS = 140_000;
const TRUNCATION_NOTE =
  "\n\n…[result truncated — exceeded the 150,000-character tool-output limit. " +
  "Re-run with tighter filters (status=, limit=, offset=, q=), request a single " +
  "id, or set includeContent=false to fetch metadata only.]";

/**
 * Standard MCP tool result envelope. Defensively truncates results that
 * would otherwise blow the Claude tool-output limit.
 */
export function toolText(payload: unknown) {
  let text =
    typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);

  if (text.length > MAX_TOOL_RESULT_CHARS) {
    const cut = MAX_TOOL_RESULT_CHARS - TRUNCATION_NOTE.length;
    text = text.slice(0, cut) + TRUNCATION_NOTE;
  }

  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}
