/**
 * @fileoverview Synchronous chat task — single-turn AI response.
 */

import type { ChatMessage } from "./types";

import { extractText } from "../../utils/extract-text";
import {streamChat} from "./stream";
import { getModelRegistry } from "../../models";
import { getProvider } from "../../providers";

export {streamChat}
export * from "./types";
export * from "./health";

export async function chat(
  env: Env,
  opts: {
    messages: ChatMessage[];
    cacheTtl?: number;
  },
): Promise<string> {
  const provider = await getProvider(env);
  const model = getModelRegistry(env).chat;
  const result = await provider.invokeModel(
    model,
    {
      messages: opts.messages,
      temperature: 0.3,
    },
    { cacheTtl: opts.cacheTtl },
  );

  return extractText(result);
}
