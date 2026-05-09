/**
 * @fileoverview AI Gateway /compat client + ModelProvider for the OpenAI Agents SDK.
 *
 * Configures an OpenAI client to route requests through Cloudflare AI Gateway's
 * compatibility endpoint. Workers AI models are addressed with the
 * "workers-ai/@cf/..." prefix per AI Gateway spec.
 *
 * AI Gateway provides observability (request logs, latency, token usage, cache hits)
 * automatically for every request — no additional tracing configuration needed.
 */

import OpenAI from "openai";
import {
  OpenAIChatCompletionsModel,
  setTracingDisabled,
} from "@openai/agents";
import type { ModelProvider } from "@openai/agents";
import {
  getCloudflareAiGatewayUrl,
  getCloudflareAiGatewayToken,
} from "../../utils/secrets";

// Disable the SDK's built-in trace exporter — it would try to POST spans to
// api.openai.com/v1/traces with our Cloudflare token, resulting in 401s.
// AI Gateway tracing is completely independent and unaffected.
setTracingDisabled(true);

// ---------------------------------------------------------------------------
// Default model constants
// ---------------------------------------------------------------------------

/** Workers AI model for structured/analytical tasks */
export const WORKERS_AI_GPT_OSS = "workers-ai/@cf/openai/gpt-oss-120b";

/** Workers AI model for tabular/mechanical data generation */
export const WORKERS_AI_LLAMA_70B = "workers-ai/@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

/**
 * Build an OpenAI client pointing at AI Gateway /compat.
 * All requests are routed through the gateway for observability + caching.
 *
 * Model format: "workers-ai/@cf/openai/gpt-oss-120b"
 */
export async function getAIGatewayCompatClient(env: Env): Promise<OpenAI> {
  const baseURL = await getCloudflareAiGatewayUrl(env);
  const apiKey = await getCloudflareAiGatewayToken(env);

  return new OpenAI({
    apiKey,
    baseURL,
  });
}

// ---------------------------------------------------------------------------
// ModelProvider for the OpenAI Agents SDK
// ---------------------------------------------------------------------------

/**
 * Routes all agent calls through AI Gateway /compat → Workers AI.
 *
 * Usage:
 * ```
 * const client = await getAIGatewayCompatClient(env);
 * const provider = new AIGatewayModelProvider(client);
 * const runner = new Runner({ modelProvider: provider });
 * ```
 */
export class AIGatewayModelProvider implements ModelProvider {
  constructor(private client: OpenAI) {}

  getModel(modelName?: string) {
    const model = modelName ?? WORKERS_AI_GPT_OSS;
    return new OpenAIChatCompletionsModel(this.client, model as string);
  }
}
