import Anthropic from "@anthropic-ai/sdk";

import type { AIProvider, InvokeOpts, ModelDescriptor } from "../providers/base";

import { getCloudflareAiGatewayUrl, getSecret } from "../../utils/secrets";

/**
 * Initialize the Anthropic official SDK.
 * Routes all traffic through Cloudflare AI Gateway.
 */
export async function getAnthropic(env: Env) {
  const aiGatewayUrl = await getCloudflareAiGatewayUrl(env);
  const apiKey = await getSecret(env, "ANTHROPIC_API_KEY");

  const baseUrl = aiGatewayUrl.replace(/\/compat\/?$/, "");

  return new Anthropic({
    apiKey: apiKey ?? "",
    baseURL: `${baseUrl}/anthropic`,
  });
}

export class AnthropicProvider implements AIProvider {
  constructor(private readonly client: Anthropic) {}

  private prepareMessages(serialized: any) {
    const messages: Anthropic.MessageParam[] = [];
    let system = "";

    for (const msg of serialized.messages || []) {
      if (msg.role === "system") {
        system += (system ? "\n" : "") + msg.content;
      } else {
        messages.push({
          role: msg.role === "assistant" ? "assistant" : "user",
          content: msg.content,
        });
      }
    }

    return { system, messages };
  }

  async invokeModel<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    opts: InvokeOpts = {},
  ): Promise<TOutput> {
    const parsed = model.input.parse(input);
    const serialized = model.serialize(parsed) as any;
    const { system, messages } = this.prepareMessages(serialized);

    const response = await this.client.messages.create(
      {
        model: model.id,
        system: system ? system : undefined,
        messages,
        temperature: serialized.temperature ?? 0,
        max_tokens: serialized.max_tokens ?? 4096,
      },
      { signal: opts.signal },
    );

    const contentBlock = response.content.find((c: any) => c.type === "text");
    const textContent = contentBlock?.type === "text" ? contentBlock.text : "";

    if (!textContent) {
      throw new Error(`Anthropic Provider: No text content returned for ${model.id}`);
    }

    return model.parseResponse({ response: textContent });
  }

  async invokeStructured<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    opts: InvokeOpts = {},
  ): Promise<unknown> {
    const parsed = model.input.parse(input);
    const serialized = model.serialize(parsed) as any;
    const { system, messages } = this.prepareMessages(serialized);

    const jsonSchema = serialized.response_format?.json_schema?.schema;
    const schemaName = serialized.response_format?.json_schema?.name ?? "json_schema";

    const response = await this.client.messages.create(
      {
        model: model.id,
        system: system ? system : undefined,
        messages,
        temperature: serialized.temperature ?? 0,
        max_tokens: serialized.max_tokens ?? 8192,
        tools: jsonSchema
          ? [
              {
                name: schemaName,
                description: "Output JSON according to this schema",
                input_schema: jsonSchema as any,
              },
            ]
          : undefined,
        tool_choice: jsonSchema ? { type: "tool", name: schemaName } : undefined,
      },
      { signal: opts.signal },
    );

    const toolUse = response.content.find((c: any) => c.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new Error(`Anthropic Provider: No JSON tool_use content returned for ${model.id}`);
    }

    return toolUse.input;
  }

  async streamModel<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    opts: InvokeOpts = {},
  ): Promise<ReadableStream<Uint8Array>> {
    const parsed = model.input.parse(input);
    const serialized = model.serialize(parsed) as any;
    const { system, messages } = this.prepareMessages(serialized);

    const stream = await this.client.messages.create(
      {
        model: model.id,
        system: system ? system : undefined,
        messages,
        temperature: serialized.temperature ?? 0,
        max_tokens: serialized.max_tokens ?? 4096,
        stream: true,
      },
      { signal: opts.signal },
    );

    const encoder = new TextEncoder();
    return new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
            // Emulate OpenAI SSE shape
            const sseEvent = {
              choices: [{ delta: { content: chunk.delta.text } }],
            };
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(sseEvent)}\n\n`));
          }
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      },
    });
  }
}
