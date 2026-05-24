import { getModelRegistry } from "../models";
import { AiProvider } from "../providers";

export async function embed(
  env: Env,
  opts: {
    texts: string[];
    cacheTtl?: number;
  },
): Promise<number[][]> {
  const provider = new AiProvider(env);
  const model = getModelRegistry(env).embed;
  const result = await provider.invokeModel(
    model,
    { text: opts.texts },
    { cacheTtl: opts.cacheTtl },
  );

  return result.data;
}
