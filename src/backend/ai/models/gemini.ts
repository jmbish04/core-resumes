import { GoogleGenAI } from "@google/genai";

import type { AIProvider, InvokeOpts, ModelDescriptor } from "../providers/base";

import { getCloudflareAiGatewayUrl, getSecret } from "../../utils/secrets";

/**
 * Initialize the Google GenAI official SDK (@google/genai).
 * Routes all traffic through Cloudflare AI Gateway (google-ai-studio endpoint).
 */
export async function getGemini(env: Env) {
  const aiGatewayUrl = await getCloudflareAiGatewayUrl(env);
  const apiKey = await getSecret(env, "CLOUDFLARE_AI_GATEWAY_TOKEN");

  return new GoogleGenAI({
    apiKey: apiKey ?? "",
    httpOptions: {
      baseUrl: `${aiGatewayUrl}/google-ai-studio`,
    },
  });
}

export class GeminiProvider implements AIProvider {
  constructor(private readonly client: GoogleGenAI) {}

  private prepareContents(serialized: any) {
    const contents: any[] = [];
    let systemInstruction = "";

    for (const msg of serialized.messages || []) {
      if (msg.role === "system") {
        systemInstruction += (systemInstruction ? "\n" : "") + msg.content;
      } else {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        });
      }
    }

    return { systemInstruction, contents };
  }

  async invokeModel<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    _opts: InvokeOpts = {},
  ): Promise<TOutput> {
    const parsed = model.input.parse(input);
    const serialized = model.serialize(parsed) as any;
    const { systemInstruction, contents } = this.prepareContents(serialized);

    const response = await this.client.models.generateContent({
      model: model.id,
      contents,
      config: {
        systemInstruction: systemInstruction ? systemInstruction : undefined,
        temperature: serialized.temperature ?? 0,
        maxOutputTokens: serialized.max_tokens ?? 8192,
      },
    });

    const content = response.text;
    if (!content) {
      throw new Error(`Gemini Provider: No content returned for ${model.id}`);
    }

    return model.parseResponse({ response: content });
  }

  async invokeStructured<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    _opts: InvokeOpts = {},
  ): Promise<unknown> {
    const parsed = model.input.parse(input);
    const serialized = model.serialize(parsed) as any;
    const { systemInstruction, contents } = this.prepareContents(serialized);

    const jsonSchema = serialized.response_format?.json_schema?.schema;

    const response = await this.client.models.generateContent({
      model: model.id,
      contents,
      config: {
        systemInstruction: systemInstruction ? systemInstruction : undefined,
        temperature: serialized.temperature ?? 0,
        maxOutputTokens: serialized.max_tokens ?? 8192,
        responseMimeType: "application/json",
        responseSchema: jsonSchema as any,
      },
    });

    const content = response.text;
    if (!content) {
      throw new Error(`Gemini Provider: No content returned for ${model.id}`);
    }

    return JSON.parse(content);
  }

  async streamModel<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    _opts: InvokeOpts = {},
  ): Promise<ReadableStream<Uint8Array>> {
    const parsed = model.input.parse(input);
    const serialized = model.serialize(parsed) as any;
    const { systemInstruction, contents } = this.prepareContents(serialized);

    const stream = await this.client.models.generateContentStream({
      model: model.id,
      contents,
      config: {
        systemInstruction: systemInstruction ? systemInstruction : undefined,
        temperature: serialized.temperature ?? 0,
        maxOutputTokens: serialized.max_tokens ?? 8192,
      },
    });

    const encoder = new TextEncoder();
    return new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          if (chunk.text) {
            // Emulate OpenAI SSE shape for broad compatibility
            const sseEvent = {
              choices: [{ delta: { content: chunk.text } }],
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
