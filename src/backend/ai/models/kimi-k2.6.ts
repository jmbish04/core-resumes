/**
 * @fileoverview Kimi K2.6 model module for Cloudflare Workers AI.
 *
 * Supports multi-turn tool calling, vision inputs, structured outputs.
 *
 * Schema sources:
 *   Sync input:  https://developers.cloudflare.com/workers-ai/models/kimi-k2.6/sync-input.json
 *   Sync output: https://developers.cloudflare.com/workers-ai/models/kimi-k2.6/sync-output.json
 */

import { z } from "zod";

import { defineModel, readTextResponse } from "./_define";

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export const KimiMessage = z.object({
  role: z.enum(["developer", "system", "user", "assistant", "tool", "function"]),
  content: z.union([z.string(), z.array(z.any())]).optional(),
  name: z.string().optional(),
  tool_call_id: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Messages API input (multi-turn chat, structured output, tool use)
// ---------------------------------------------------------------------------

export const KimiK26Input = z.object({
  messages: z.array(KimiMessage).min(1),
  max_tokens: z.number().int().optional(),
  max_completion_tokens: z.number().int().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  seed: z.number().int().optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  reasoning_effort: z.enum(["low", "medium", "high"]).optional(),
  chat_template_kwargs: z
    .object({
      thinking: z.boolean().optional(),
      clear_thinking: z.boolean().optional(),
    })
    .optional(),
  response_format: z
    .object({
      type: z.enum(["text", "json_object", "json_schema"]),
      json_schema: z.unknown().optional(),
    })
    .optional(),
  tools: z.array(z.any()).optional(),
  tool_choice: z.any().optional(),
  parallel_tool_calls: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Output schema (same for sync and structured output)
// ---------------------------------------------------------------------------

export const KimiK26Output = z.object({ response: z.string() });

export const KimiK26Usage = z
  .object({
    prompt_tokens: z.number().default(0),
    completion_tokens: z.number().default(0),
    total_tokens: z.number().default(0),
  })
  .optional();

// ---------------------------------------------------------------------------
// Model descriptor
// ---------------------------------------------------------------------------

export const kimi_k2_6 = defineModel({
  id: "@cf/moonshotai/kimi-k2.6",
  capabilities: ["chat", "json-mode", "streaming", "function-calling", "vision", "reasoning"],
  input: KimiK26Input,
  output: KimiK26Output,

  serialize: (input) => {
    const body: Record<string, unknown> = {
      messages: input.messages,
    };

    // Only include optional params if they were explicitly set
    if (input.max_tokens !== undefined) body.max_tokens = input.max_tokens;
    if (input.max_completion_tokens !== undefined)
      body.max_completion_tokens = input.max_completion_tokens;
    if (input.temperature !== undefined) body.temperature = input.temperature;
    if (input.top_p !== undefined) body.top_p = input.top_p;
    if (input.seed !== undefined) body.seed = input.seed;
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

    return body;
  },

  parseResponse: (raw) => KimiK26Output.parse(readTextResponse(raw)),
});

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type KimiK26Input = z.infer<typeof KimiK26Input>;
export type KimiK26Output = z.infer<typeof KimiK26Output>;
export type KimiMessage = z.infer<typeof KimiMessage>;
