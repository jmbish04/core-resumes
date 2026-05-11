import OpenAI from "openai";
import { getCloudflareAiGatewayUrl, getSecret } from "../../utils/secrets";
import type { AIProvider, InvokeOpts, ModelDescriptor } from "../providers/base";

/**
 * Initialize the OpenAI official SDK.
 * Routes all traffic through Cloudflare AI Gateway.
 */
export async function getOpenAI(env: Env) {
  const aiGatewayUrl = await getCloudflareAiGatewayUrl(env);
  const apiKey = await getSecret(env, "OPENAI_API_KEY");

  // Fix: If aiGatewayUrl ends with /compat, strip it to append /openai correctly
  const baseUrl = aiGatewayUrl.replace(/\/compat\/?$/, "");

  return new OpenAI({
    apiKey: apiKey ?? "",
    baseURL: `${baseUrl}/openai`,
  });
}

export class OpenAIProvider implements AIProvider {
  constructor(private readonly client: OpenAI) {}

  async invokeModel<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    opts: InvokeOpts = {}
  ): Promise<TOutput> {
    const parsed = model.input.parse(input);
    const serialized = model.serialize(parsed) as any;

    const response = await this.client.chat.completions.create(
      {
        model: model.id,
        messages: serialized.messages,
        temperature: serialized.temperature ?? 0,
        max_tokens: serialized.max_tokens,
        stream: false,
      },
      { signal: opts.signal }
    );

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`OpenAI Provider: No content returned for ${model.id}`);
    }

    return model.parseResponse({ response: content });
  }

  async invokeStructured<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    opts: InvokeOpts = {}
  ): Promise<unknown> {
    const parsed = model.input.parse(input);
    const serialized = model.serialize(parsed) as any;

    const response = await this.client.chat.completions.create(
      {
        model: model.id,
        messages: serialized.messages,
        temperature: serialized.temperature ?? 0,
        max_tokens: serialized.max_tokens,
        response_format: serialized.response_format,
        stream: false,
      },
      { signal: opts.signal }
    );

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error(`OpenAI Provider: No content returned for ${model.id}`);
    }

    return JSON.parse(content);
  }

  async streamModel<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    opts: InvokeOpts = {}
  ): Promise<ReadableStream<Uint8Array>> {
    const parsed = model.input.parse(input);
    const serialized = model.serialize(parsed) as any;

    const stream = await this.client.chat.completions.create(
      {
        model: model.id,
        messages: serialized.messages,
        temperature: serialized.temperature ?? 0,
        max_tokens: serialized.max_tokens,
        stream: true,
      },
      { signal: opts.signal }
    );

    const encoder = new TextEncoder();
    return new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      },
    });
  }
}
