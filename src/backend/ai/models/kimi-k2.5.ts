/**
 * @fileoverview Kimi K2.5 model module for Cloudflare Workers AI.
 *
 * Frontier-scale model with 256k context window, multi-turn tool calling,
 * vision inputs, and structured outputs for agentic workloads.
 *
 * CRITICAL: This model uses OpenAI Chat Completions format for both input
 * and output (choices[0].message.content), NOT the simple { response } format.
 *
 * Schema sources:
 *   Sync input:  https://developers.cloudflare.com/workers-ai/models/kimi-k2.5/sync-input.json
 *   Sync output: https://developers.cloudflare.com/workers-ai/models/kimi-k2.5/sync-output.json
 */

import { z } from "zod";

import { defineModel } from "./_define";

// ---------------------------------------------------------------------------
// Message types (OpenAI Chat Completions format)
// ---------------------------------------------------------------------------

export const KimiK25Message = z.object({
  role: z.enum(["developer", "system", "user", "assistant", "tool", "function"]),
  content: z.union([z.string(), z.null(), z.array(z.any())]).optional(),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
  tool_calls: z.array(z.any()).optional(),
});

// ---------------------------------------------------------------------------
// Messages API input
// ---------------------------------------------------------------------------

export const KimiK25Input = z.object({
  messages: z.array(KimiK25Message).min(1),
  max_tokens: z.number().int().optional(),
  max_completion_tokens: z.number().int().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  seed: z.number().int().optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  n: z.number().int().min(1).max(128).optional(),
  reasoning_effort: z.enum(["low", "medium", "high"]).optional(),
  chat_template_kwargs: z
    .object({
      enable_thinking: z.boolean().optional(),
      clear_thinking: z.boolean().optional(),
    })
    .optional(),
  response_format: z
    .union([
      z.object({ type: z.literal("text") }),
      z.object({ type: z.literal("json_object") }),
      z.object({
        type: z.literal("json_schema"),
        json_schema: z.object({
          name: z.string(),
          description: z.string().optional(),
          schema: z.record(z.string(), z.unknown()),
          strict: z.boolean().nullable().optional(),
        }),
      }),
    ])
    .optional(),
  tools: z.array(z.any()).optional(),
  tool_choice: z.any().optional(),
  parallel_tool_calls: z.boolean().optional(),
  stop: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
});

// ---------------------------------------------------------------------------
// Output schema — OpenAI Chat Completions format
// choices[0].message.content is the actual model response text
// ---------------------------------------------------------------------------

const KimiK25Choice = z.object({
  index: z.number().int(),
  message: z.object({
    role: z.literal("assistant"),
    content: z.union([z.string(), z.null()]),
    refusal: z.union([z.string(), z.null()]).optional(),
    tool_calls: z.array(z.any()).optional(),
  }),
  finish_reason: z.enum(["stop", "length", "tool_calls", "content_filter", "function_call"]),
  logprobs: z.any().optional(),
});

export const KimiK25Output = z.object({
  id: z.string(),
  object: z.string(),
  created: z.number().int(),
  model: z.string(),
  choices: z.array(KimiK25Choice).min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int(),
      completion_tokens: z.number().int(),
      total_tokens: z.number().int(),
    })
    .optional(),
  system_fingerprint: z.union([z.string(), z.null()]).optional(),
});

// ---------------------------------------------------------------------------
// Model descriptor
// ---------------------------------------------------------------------------

export const kimi_k2_5 = defineModel({
  id: "@cf/moonshotai/kimi-k2.5",
  capabilities: ["chat", "json-mode", "streaming", "function-calling", "vision", "reasoning"],
  input: KimiK25Input,
  output: KimiK25Output,

  serialize: (input) => {
    const body: Record<string, unknown> = {
      messages: input.messages,
    };

    // Only include optional params if explicitly set
    if (input.max_tokens !== undefined) body.max_tokens = input.max_tokens;
    if (input.max_completion_tokens !== undefined)
      body.max_completion_tokens = input.max_completion_tokens;
    if (input.temperature !== undefined) body.temperature = input.temperature;
    if (input.top_p !== undefined) body.top_p = input.top_p;
    if (input.seed !== undefined) body.seed = input.seed;
    if (input.n !== undefined) body.n = input.n;
    if (input.frequency_penalty !== undefined) body.frequency_penalty = input.frequency_penalty;
    if (input.presence_penalty !== undefined) body.presence_penalty = input.presence_penalty;
    if (input.reasoning_effort !== undefined) body.reasoning_effort = input.reasoning_effort;
    if (input.chat_template_kwargs !== undefined)
      body.chat_template_kwargs = input.chat_template_kwargs;
    if (input.response_format !== undefined) body.response_format = input.response_format;
    if (input.tools !== undefined) body.tools = input.tools;
    if (input.tool_choice !== undefined) body.tool_choice = input.tool_choice;
    if (input.parallel_tool_calls !== undefined)
      body.parallel_tool_calls = input.parallel_tool_calls;
    if (input.stop !== undefined) body.stop = input.stop;

    return body;
  },

  // K2.5 returns OpenAI Chat Completions format — the raw response IS the
  // parsed output directly (choices array, usage, etc.)
  parseResponse: (raw) => {
    // env.AI.run returns the full response object directly
    if (typeof raw === "object" && raw !== null) {
      // If wrapped in { result: ... }, unwrap
      const result =
        "result" in (raw as Record<string, unknown>)
          ? (raw as Record<string, unknown>).result
          : raw;
      return KimiK25Output.parse(result);
    }
    throw new Error(`Unexpected Kimi K2.5 response type: ${typeof raw}`);
  },
});

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type KimiK25Input = z.infer<typeof KimiK25Input>;
export type KimiK25Output = z.infer<typeof KimiK25Output>;
export type KimiK25Message = z.infer<typeof KimiK25Message>;
