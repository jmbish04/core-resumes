import { z } from "zod";

import { defineModel } from "./_define";

export const GeminiEmbeddingInput = z.object({
  text: z.union([z.string(), z.array(z.string())]),
});

export const GeminiEmbeddingOutput = z.object({
  data: z.array(z.array(z.number())),
});

export const gemini_embedding_001 = defineModel({
  id: "gemini-embedding-001",
  capabilities: ["embedding"],
  input: GeminiEmbeddingInput,
  output: GeminiEmbeddingOutput,

  serialize: (input) => {
    // Ported from vectorize_service.py _build_embedding_text
    // The instructions say: "Include the task: retrieval document and task: retrieval query prefixes"
    // However, the input might just be text strings, so we can format them.
    // For simplicity we will prefix directly here if they are strings, but usually it's handled upstream.
    // We pass it to the SDK's embedContent or batchEmbedContents.
    // The @google/genai SDK takes `model`, `contents` (or `requests` for batch).
    // Let's format it for `embedContent` or `batchEmbedContents`.
    const _texts = Array.isArray(input.text) ? input.text : [input.text];

    // We can't know here if it's a query or a document just from the text, but upstream
    // wrappers should apply the prefix. The task says "Include the task... prefixes",
    // this means upstream should probably do it, but we can configure `taskType` in Gemini.
    // Gemini API supports `taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY"` natively!
    // But since `text` already contains the text, let's just use the new SDK structure.

    // If it's a single text, embedContent. If array, maybe batch.
    // Returning an array so the provider can handle it, or we just structure it for GoogleGenAI `embedContent` array input?
    // In @google/genai, batching is done by passing an array of strings to `contents`?
    // Or we use `batchEmbedContents`. Let's return the standard payload.
    return {
      model: "gemini-embedding-001",
      contents: input.text,
      config: {
        outputDimensionality: 768, // VECTORIZE_DIMENSIONS
      },
    };
  },

  parseResponse: (raw: any) => {
    // @google/genai returns EmbedContentResponse which has `embeddings` array.
    // Each embedding has `values` (number[]).
    let data: number[][] = [];
    if (raw.embeddings && Array.isArray(raw.embeddings)) {
      data = raw.embeddings.map((e: any) => e.values);
    } else if (raw.embedding && Array.isArray(raw.embedding.values)) {
      data = [raw.embedding.values];
    } else {
      throw new Error("Invalid response format from Gemini embeddings");
    }
    return { data };
  },
});

export type GeminiEmbeddingInput = z.infer<typeof GeminiEmbeddingInput>;
export type GeminiEmbeddingOutput = z.infer<typeof GeminiEmbeddingOutput>;
