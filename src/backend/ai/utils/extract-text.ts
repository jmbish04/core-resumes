/**
 * @fileoverview Extract text content from AI model responses.
 *
 * Supports both Workers AI native format ({ response: string }) and
 * OpenAI Chat Completions format ({ choices: [{ message: { content } }] }).
 */

/**
 * Extract the text content from a model response, regardless of format.
 *
 * @param result - Raw model response (either Workers AI or OpenAI format)
 * @returns The extracted text string
 */
export function extractText(result: unknown): string {
  const r = result as Record<string, unknown>;

  // Workers AI simple format: { response: string }
  if (typeof r.response === "string") return r.response;

  // OpenAI Chat Completions format: { choices: [{ message: { content } }] }
  if (Array.isArray(r.choices) && r.choices.length > 0) {
    const content = (r.choices[0] as Record<string, any>)?.message?.content;
    if (typeof content === "string") return content;
  }

  return String(r.response ?? "");
}
