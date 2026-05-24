/**
 * @fileoverview AI provider facade — exposes centralized methods for
 * structured output generation, chat, and streaming.
 *
 * All methods resolve the model from the environment-based registry
 * and route through the active provider.
 */

import { z } from "zod";

import { Logger } from "@/backend/lib/logger";

import type { GptOssMessage } from "../models/gpt-oss-120b";
import type { AIProvider as IAIProvider, ModelDescriptor } from "./base";

import { getModelRegistry } from "../models";
import { WorkersAIProvider } from "./workers-ai";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModelDescriptor = ModelDescriptor<any, any>;

// Re-export the shared message type for consumers
export type { GptOssMessage as ChatMessage } from "../models/gpt-oss-120b";

export type ProviderName = "workers-ai" | "openai" | "anthropic" | "gemini" | "google-ai-studio";

export class AiProvider {
  private logger: Logger;

  constructor(private env: Env) {
    this.logger = new Logger(env);
  }

  private async getProviderInstance(name?: ProviderName): Promise<IAIProvider> {
    const providerName = name ?? "workers-ai";
    switch (providerName) {
      case "workers-ai":
        return new WorkersAIProvider(this.env);
      case "openai": {
        const { getOpenAI, OpenAIProvider } = await import("../models/openai");
        const client = await getOpenAI(this.env);
        return new OpenAIProvider(client);
      }
      case "anthropic": {
        const { getAnthropic, AnthropicProvider } = await import("../models/anthropic");
        const client = await getAnthropic(this.env);
        return new AnthropicProvider(client);
      }
      case "gemini": {
        const { getGemini, GeminiProvider } = await import("../models/gemini");
        const client = await getGemini(this.env);
        return new GeminiProvider(client);
      }
      case "google-ai-studio": {
        const { GoogleAIStudioProvider } = await import("./google-ai-studio");
        return new GoogleAIStudioProvider(this.env);
      }
      default:
        throw new Error(`Unknown provider: ${providerName}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Provider delegate methods (implements AIProvider)
  // ---------------------------------------------------------------------------

  async invokeModel<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    opts?: { cacheTtl?: number; provider?: ProviderName },
  ): Promise<TOutput> {
    const provider = await this.getProviderInstance(opts?.provider);
    return provider.invokeModel(model, input, opts);
  }

  async streamModel<TInput>(
    model: ModelDescriptor<TInput, any>,
    input: TInput,
    opts?: { cacheTtl?: number; provider?: ProviderName },
  ): Promise<ReadableStream<Uint8Array>> {
    const provider = await this.getProviderInstance(opts?.provider);
    return provider.streamModel(model, input, opts);
  }

  async invokeStructured<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    opts?: { cacheTtl?: number; provider?: ProviderName },
  ): Promise<unknown> {
    const provider = await this.getProviderInstance(opts?.provider);
    return provider.invokeStructured(model, input, opts);
  }

  /**
   * Generate a structured output object that conforms to the given Zod schema.
   */
  async generateStructuredOutput<TSchema extends z.ZodTypeAny>(opts: {
    messages: GptOssMessage[];
    schema: TSchema;
    extractionSchema?: z.ZodTypeAny;
    schemaName?: string;
    temperature?: number;
    max_tokens?: number;
    cacheTtl?: number;
    provider?: ProviderName;
    model?: AnyModelDescriptor;
  }): Promise<z.infer<TSchema>> {
    const provider = await this.getProviderInstance(opts.provider);

    // If no provider is passed, use default worker ai model for the method
    // If provider is passed but no model, we should fall back to default model for that provider (for now we fallback to getModelRegistry)
    const model = opts.model ?? getModelRegistry(this.env).extract;

    const schemaName = opts.schemaName ?? "Schema";
    const sourceSchema = opts.extractionSchema ?? opts.schema;
    const { $schema: _, ...resolvedSchema } = z.toJSONSchema(sourceSchema);

    await this.logger.info("[AI] generateStructuredOutput — invoking", {
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
      await this.logger.error("[AI] generateStructuredOutput — model invocation FAILED", {
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
      await this.logger.info("[AI] generateStructuredOutput — success", {
        schemaName,
        model: model.id,
        elapsedMs: elapsed,
        responsePreview: preview.length > 500 ? preview.slice(0, 500) + "…" : preview,
      });
      return validated;
    } catch (err) {
      await this.logger.error("[AI] generateStructuredOutput — Zod validation FAILED", {
        schemaName,
        model: model.id,
        elapsedMs: elapsed,
        rawPreview: JSON.stringify(raw)?.slice(0, 500),
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * Generate structured analysis output using the `analyze` model.
   */
  async generateStructuredAnalysis<TSchema extends z.ZodTypeAny>(opts: {
    messages: GptOssMessage[];
    schema: TSchema;
    extractionSchema?: z.ZodTypeAny;
    schemaName?: string;
    temperature?: number;
    max_tokens?: number;
    cacheTtl?: number;
    provider?: ProviderName;
    model?: AnyModelDescriptor;
  }): Promise<z.infer<TSchema>> {
    const provider = await this.getProviderInstance(opts.provider);
    const model = opts.model ?? getModelRegistry(this.env).analyze;

    const schemaName = opts.schemaName ?? "Schema";
    const sourceSchema = opts.extractionSchema ?? opts.schema;
    const { $schema: _, ...resolvedSchema } = z.toJSONSchema(sourceSchema);

    await this.logger.info("[AI] generateStructuredAnalysis — invoking", {
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
      await this.logger.error("[AI] generateStructuredAnalysis — model invocation FAILED", {
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
      await this.logger.info("[AI] generateStructuredAnalysis — success", {
        schemaName,
        model: model.id,
        elapsedMs: elapsed,
        responsePreview: preview.length > 500 ? preview.slice(0, 500) + "…" : preview,
      });
      return validated;
    } catch (err) {
      await this.logger.error("[AI] generateStructuredAnalysis — Zod validation FAILED", {
        schemaName,
        model: model.id,
        elapsedMs: elapsed,
        rawPreview: JSON.stringify(raw)?.slice(0, 500),
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * Stream chat tokens from the model as a ReadableStream<Uint8Array>.
   */
  async streamChat(opts: {
    messages: GptOssMessage[];
    temperature?: number;
    max_tokens?: number;
    cacheTtl?: number;
    provider?: ProviderName;
    model?: AnyModelDescriptor;
  }): Promise<ReadableStream<Uint8Array>> {
    const provider = await this.getProviderInstance(opts.provider);
    const model = opts.model ?? getModelRegistry(this.env).chat;

    await this.logger.info("[AI] streamChat — starting", {
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
      await this.logger.info("[AI] streamChat — stream opened", { model: model.id });
      return stream;
    } catch (err) {
      await this.logger.error("[AI] streamChat — FAILED", {
        model: model.id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * embedJobs — generate vector embeddings for jobs using Gemini
   */
  async embedJobsBatch(
    texts: string[],
    opts: { provider?: ProviderName; model?: AnyModelDescriptor } = {},
  ): Promise<number[][]> {
    const provider = await this.getProviderInstance(opts.provider ?? "google-ai-studio");
    const model = opts.model ?? getModelRegistry(this.env).embedJobs;

    await this.logger.info("[AI] embedJobsBatch — starting", {
      model: model.id,
      count: texts.length,
    });

    try {
      const result = await provider.invokeModel(model, { text: texts });
      return result.data;
    } catch (err) {
      await this.logger.error("[AI] embedJobsBatch — FAILED", {
        model: model.id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  async embedJobsQuery(
    text: string,
    opts: { provider?: ProviderName; model?: AnyModelDescriptor } = {},
  ): Promise<number[]> {
    const provider = await this.getProviderInstance(opts.provider ?? "google-ai-studio");
    const model = opts.model ?? getModelRegistry(this.env).embedJobs;

    await this.logger.info("[AI] embedJobsQuery — starting", {
      model: model.id,
    });

    try {
      const result = await provider.invokeModel(model, { text });
      return result.data[0];
    } catch (err) {
      await this.logger.error("[AI] embedJobsQuery — FAILED", {
        model: model.id,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }
}
