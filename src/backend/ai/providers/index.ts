/**
 * @fileoverview AI provider facade — exposes centralized methods for
 * structured output generation, chat, and streaming.
 *
 * All methods resolve the model from the environment-based registry
 * and route through the active provider (currently Workers AI only).
 */

import { z } from "zod";

import type { GptOssMessage } from "../models/gpt-oss-120b";
import type { AIProvider, ModelDescriptor } from "./base";

import { getModelRegistry } from "../models";
import { WorkersAIProvider } from "./workers-ai";
import { Logger } from "@/backend/lib/logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModelDescriptor = ModelDescriptor<any, any>;

// Re-export the shared message type for consumers
export type { GptOssMessage as ChatMessage } from "../models/gpt-oss-120b";

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export type ProviderName = "workers-ai" | "openai" | "anthropic" | "gemini";

export async function getProvider(env: Env, name: ProviderName = "workers-ai"): Promise<AIProvider> {
  switch (name) {
    case "workers-ai":
      return new WorkersAIProvider(env);
    case "openai": {
      const { getOpenAI, OpenAIProvider } = await import("../models/openai");
      const client = await getOpenAI(env);
      return new OpenAIProvider(client);
    }
    case "anthropic": {
      const { getAnthropic, AnthropicProvider } = await import("../models/anthropic");
      const client = await getAnthropic(env);
      return new AnthropicProvider(client);
    }
    case "gemini": {
      const { getGemini, GeminiProvider } = await import("../models/gemini");
      const client = await getGemini(env);
      return new GeminiProvider(client);
    }
    default:
      throw new Error(`Unknown provider: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// generateStructuredOutput — structured JSON output via json_schema
// ---------------------------------------------------------------------------

/**
 * Generate a structured output object that conforms to the given Zod schema.
 *
 * Uses `response_format: { type: "json_schema" }` to instruct the model
 * (gpt-oss-120b) to return valid JSON matching the schema.  The response
 * is parsed and validated against the schema directly — no regex stripping.
 *
 * @param env      Worker environment bindings
 * @param opts     Messages, Zod schema, and optional generation params
 * @returns        Parsed and validated output matching TSchema
 */
export async function generateStructuredOutput<TSchema extends z.ZodTypeAny>(
  env: Env,
  opts: {
    messages: GptOssMessage[];
    schema: TSchema;
    extractionSchema?: z.ZodTypeAny;
    schemaName?: string;
    temperature?: number;
    max_tokens?: number;
    cacheTtl?: number;
    /** Override the resolved `extract` model (e.g. force gpt-oss-120b for a hot path). */
    model?: AnyModelDescriptor;
  },
): Promise<z.infer<TSchema>> {
  const logger = new Logger(env);
  const provider = await getProvider(env);
  const model = opts.model ?? getModelRegistry(env).extract;

  // Convert Zod schema to JSON Schema via Zod v4 native method
  const schemaName = opts.schemaName ?? "Schema";
  const sourceSchema = opts.extractionSchema ?? opts.schema;
  const { $schema: _, ...resolvedSchema } = z.toJSONSchema(sourceSchema);

  await logger.info("[AI] generateStructuredOutput — invoking", {
    schemaName,
    model: model.id,
    messageCount: opts.messages.length,
    temperature: opts.temperature ?? 0,
    max_tokens: opts.max_tokens ?? null,
  });

  const start = Date.now();
  let raw: unknown;
  try {
    raw = await provider.invokeStructured(
      model,
      {
        messages: opts.messages,
        temperature: opts.temperature ?? 0,
        max_tokens: opts.max_tokens,
        response_format: {
          type: "json_schema" as const,
          json_schema: {
            name: schemaName,
            schema: resolvedSchema as Record<string, unknown>,
            strict: true,
          },
        },
      },
      { cacheTtl: opts.cacheTtl },
    );
  } catch (err) {
    const elapsed = Date.now() - start;
    await logger.error("[AI] generateStructuredOutput — model invocation FAILED", {
      schemaName,
      model: model.id,
      elapsedMs: elapsed,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  const elapsed = Date.now() - start;

  let parsed = raw;
  if (Array.isArray(parsed) && resolvedSchema.type === "object" && resolvedSchema.properties) {
    const keys = Object.keys(resolvedSchema.properties);
    if (keys.length === 1) {
      parsed = { [keys[0]]: parsed };
    }
  }

  try {
    const validated = opts.schema.parse(parsed);
    const preview = JSON.stringify(validated);
    await logger.info("[AI] generateStructuredOutput — success", {
      schemaName,
      model: model.id,
      elapsedMs: elapsed,
      responsePreview: preview.length > 500 ? preview.slice(0, 500) + "…" : preview,
    });
    return validated;
  } catch (err) {
    await logger.error("[AI] generateStructuredOutput — Zod validation FAILED", {
      schemaName,
      model: model.id,
      elapsedMs: elapsed,
      rawPreview: JSON.stringify(raw)?.slice(0, 500),
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// generateStructuredAnalysis — structured JSON via the `analyze` model role
// ---------------------------------------------------------------------------

/**
 * Generate structured analysis output using the `analyze` model
 * (Kimi K2.5 — 256k context window).
 *
 * Identical contract to `generateStructuredOutput` but routes through the
 * higher-capacity `analyze` model, ideal for heavy data analysis tasks
 * like company trend analysis where large context is essential.
 */
export async function generateStructuredAnalysis<TSchema extends z.ZodTypeAny>(
  env: Env,
  opts: {
    messages: GptOssMessage[];
    schema: TSchema;
    extractionSchema?: z.ZodTypeAny;
    schemaName?: string;
    temperature?: number;
    max_tokens?: number;
    cacheTtl?: number;
    /**
     * Override the resolved `analyze` model. Useful for tasks that empirically
     * need a specific model (e.g. the hybrid extraction pipeline pins
     * gpt-oss-120b because it's 3-5x faster and equally accurate).
     */
    model?: AnyModelDescriptor;
  },
): Promise<z.infer<TSchema>> {
  const logger = new Logger(env);
  const provider = await getProvider(env);
  const model = opts.model ?? getModelRegistry(env).analyze;

  // Convert Zod schema to JSON Schema via Zod v4 native method
  const schemaName = opts.schemaName ?? "Schema";
  const sourceSchema = opts.extractionSchema ?? opts.schema;
  const { $schema: _, ...resolvedSchema } = z.toJSONSchema(sourceSchema);

  await logger.info("[AI] generateStructuredAnalysis — invoking", {
    schemaName,
    model: model.id,
    messageCount: opts.messages.length,
    temperature: opts.temperature ?? 0,
    max_tokens: opts.max_tokens ?? null,
  });

  const start = Date.now();
  let raw: unknown;
  try {
    raw = await provider.invokeStructured(
      model,
      {
        messages: opts.messages,
        temperature: opts.temperature ?? 0,
        max_tokens: opts.max_tokens,
        // Disable thinking mode — it interferes with structured JSON output
        chat_template_kwargs: { enable_thinking: false },
        response_format: {
          type: "json_schema" as const,
          json_schema: {
            name: schemaName,
            schema: resolvedSchema as Record<string, unknown>,
            strict: true,
          },
        },
      },
      { cacheTtl: opts.cacheTtl },
    );
  } catch (err) {
    const elapsed = Date.now() - start;
    await logger.error("[AI] generateStructuredAnalysis — model invocation FAILED", {
      schemaName,
      model: model.id,
      elapsedMs: elapsed,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  const elapsed = Date.now() - start;

  let parsed = raw;
  if (Array.isArray(parsed) && resolvedSchema.type === "object" && resolvedSchema.properties) {
    const keys = Object.keys(resolvedSchema.properties);
    if (keys.length === 1) {
      parsed = { [keys[0]]: parsed };
    }
  }

  try {
    const validated = opts.schema.parse(parsed);
    const preview = JSON.stringify(validated);
    await logger.info("[AI] generateStructuredAnalysis — success", {
      schemaName,
      model: model.id,
      elapsedMs: elapsed,
      responsePreview: preview.length > 500 ? preview.slice(0, 500) + "…" : preview,
    });
    return validated;
  } catch (err) {
    await logger.error("[AI] generateStructuredAnalysis — Zod validation FAILED", {
      schemaName,
      model: model.id,
      elapsedMs: elapsed,
      rawPreview: JSON.stringify(raw)?.slice(0, 500),
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// streamChat — streaming SSE for frontend chat UI
// ---------------------------------------------------------------------------

/**
 * Stream chat tokens from the model as a ReadableStream<Uint8Array>.
 *
 * Returns raw SSE from Workers AI — callers can pipe this to the frontend
 * or wrap it in an SSE-formatted stream via `toSseStream()`.
 *
 * @param env      Worker environment bindings
 * @param opts     Chat messages and optional generation params
 * @returns        ReadableStream of raw model output chunks
 */
export async function streamChat(
  env: Env,
  opts: {
    messages: GptOssMessage[];
    temperature?: number;
    max_tokens?: number;
    cacheTtl?: number;
  },
): Promise<ReadableStream<Uint8Array>> {
  const logger = new Logger(env);
  const provider = await getProvider(env);
  const model = getModelRegistry(env).chat;

  await logger.info("[AI] streamChat — starting", {
    model: model.id,
    messageCount: opts.messages.length,
    temperature: opts.temperature ?? 0.3,
    max_tokens: opts.max_tokens ?? null,
  });

  try {
    const stream = await provider.streamModel(
      model,
      {
        messages: opts.messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.max_tokens,
      },
      { cacheTtl: opts.cacheTtl },
    );
    await logger.info("[AI] streamChat — stream opened", { model: model.id });
    return stream;
  } catch (err) {
    await logger.error("[AI] streamChat — FAILED", {
      model: model.id,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
