/**
 * @fileoverview Utility to estimate token counts for AI inputs and enforce limits.
 */

/**
 * Estimates the token count of a string using a standard heuristic.
 * 1 token ~= 4 characters for standard English text.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Validates that the text does not exceed the provided token limit.
 * Throws a hard error if the limit is exceeded.
 * @param text The markdown or text content to validate
 * @param maxTokens The maximum allowed tokens for the context window
 * @param context Provide context for the error message (e.g., "Job Posting Extraction")
 */
export function enforceTokenLimit(
  text: string,
  maxTokens: number,
  context: string = "Content",
): void {
  const estimatedTokens = estimateTokens(text);
  if (estimatedTokens > maxTokens) {
    throw new Error(
      `${context} token limit exceeded. Estimated: ${estimatedTokens} tokens, Limit: ${maxTokens} tokens. ` +
        `DO NOT SUBSTRING CONTENT SENT TO AI. Either increase the model's context window or provide smaller input.`,
    );
  }
}
