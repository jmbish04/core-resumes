/**
 * @fileoverview AI Provider for Google AI Studio (Gemini).
 * Routes through Cloudflare AI Gateway for observability.
 */
import { GoogleGenAI } from "@google/genai";

import type { AIProvider, InvokeOpts, ModelDescriptor } from "./base";

import {
  getCloudflareAccountId,
  getCloudflareAiGatewayToken,
  getGeminiApiKey,
} from "../../utils/secrets";

export class GoogleAIStudioProvider implements AIProvider {
  constructor(private env: Env) {}

  private async getClient(): Promise<GoogleGenAI> {
    const accountId = await getCloudflareAccountId(this.env);
    const gatewayId = this.env.AI_GATEWAY_ID;
    const token = await getCloudflareAiGatewayToken(this.env);
    const apiKey = await getGeminiApiKey(this.env);

    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        baseUrl: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/google-ai-studio`,
        headers: {
          "cf-aig-authorization": `Bearer ${token}`,
        },
      },
    });
  }

  async invokeModel<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    _opts?: InvokeOpts,
  ): Promise<TOutput> {
    const client = await this.getClient();
    const serialized = model.serialize(input) as any;

    if (model.capabilities.includes("embedding")) {
      const response = await client.models.embedContent(serialized);
      return model.parseResponse(response);
    }

    const response = await client.models.generateContent(serialized);
    return model.parseResponse(response);
  }

  async streamModel<TInput, TOutput>(
    _model: ModelDescriptor<TInput, TOutput>,
    _input: TInput,
    _opts?: InvokeOpts,
  ): Promise<ReadableStream<Uint8Array>> {
    throw new Error("streamModel not yet implemented for GoogleAIStudioProvider");
  }

  async invokeStructured<TInput, TOutput>(
    model: ModelDescriptor<TInput, TOutput>,
    input: TInput,
    _opts?: InvokeOpts,
  ): Promise<unknown> {
    const client = await this.getClient();
    const serialized = model.serialize(input) as any;
    const response = await client.models.generateContent(serialized);
    return model.parseResponse(response);
  }
}
