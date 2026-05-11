/**
 * @fileoverview Workers AI query preparation layer for NotebookLM.
 *
 * Refines vague user queries into specific, evidence-seeking questions
 * using gpt-oss-120b before sending them to NotebookLM. Also evaluates
 * NotebookLM responses for completeness and generates follow-up queries.
 *
 * This ensures NotebookLM receives optimized queries that maximize
 * citation quality and evidence coverage.
 */

import type { PreparedQuery, ResponseEvaluation } from "../types";

import { getModelRegistry } from "../../models";
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
import { getProvider } from "../../providers";
import { extractText } from "../../utils/extract-text";
import { enforceTokenLimit } from "../../utils/token-estimator";

// ---------------------------------------------------------------------------
// Query preparation
// ---------------------------------------------------------------------------

/**
 * Refine a raw query into an optimized NotebookLM query using Workers AI.
 *
 * The model rewrites vague questions into specific, evidence-seeking
 * prompts that maximize NotebookLM's citation quality.
 *
 * @param env - Worker environment bindings
 * @param rawQuery - The original user/agent query
 * @param context - Optional role context for domain-specific refinement
 */
export async function prepareNotebookQuery(
  env: Env,
  rawQuery: string,
  context?: {
    roleTitle?: string;
    companyName?: string;
    queryPurpose?: string;
  },
): Promise<PreparedQuery> {
  const provider = await getProvider(env);
  const model = getModelRegistry(env).chat;

  const contextBlock = context
    ? [
        "\nContext for refinement:",
        context.roleTitle ? `- Role: ${context.roleTitle}` : "",
        context.companyName ? `- Company: ${context.companyName}` : "",
        context.queryPurpose ? `- Purpose: ${context.queryPurpose}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";

  const result = await provider.invokeModel(model, {
    messages: [
      {
        role: "system",
        content: `You are a query refinement specialist for a career knowledge base.
Your job is to transform vague or broad questions into specific, evidence-seeking queries.

Rules:
1. Make the query ask for SPECIFIC examples, metrics, and achievements
2. Ask for chronological context (when, where, what role)
3. Request quantifiable evidence when possible
4. Break complex questions into 1 primary + up to 2 follow-up queries
5. The knowledge base contains 13 years of performance reviews, career history, and accomplishments

Respond in this exact format (no markdown, no code blocks):
REFINED: <the refined primary query>
FOLLOWUP1: <optional follow-up query>
FOLLOWUP2: <optional follow-up query>`,
      },
      {
        role: "user",
        content: `Refine this query for my career knowledge base:${contextBlock}\n\nOriginal query: ${rawQuery}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 500,
  });

  return parseQueryResponse(extractText(result), rawQuery);
}

// ---------------------------------------------------------------------------
// Response evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a NotebookLM answer is complete or needs follow-up.
 *
 * Uses Workers AI to assess the response quality and identify gaps.
 * Generates a single follow-up query if the answer is insufficient.
 *
 * @param env - Worker environment bindings
 * @param query - The query that was sent to NotebookLM
 * @param answer - The answer received from NotebookLM
 */
export async function evaluateNotebookResponse(
  env: Env,
  query: string,
  answer: string,
): Promise<ResponseEvaluation> {
  const provider = await getProvider(env);
  const model = getModelRegistry(env).chat;

  enforceTokenLimit(answer, 120000, "NotebookLM Answer");

  const result = await provider.invokeModel(model, {
    messages: [
      {
        role: "system",
        content: `You are evaluating whether a career knowledge base response adequately answers a query.

Assess completeness and identify any gaps. Be strict — the response should have:
1. Specific examples or evidence (not just generalities)
2. Quantifiable metrics where the query asks for them
3. Chronological context (when, what role, what company)

Respond in this exact format (no markdown, no code blocks):
SUFFICIENT: yes/no
GAPS: <comma-separated list of gaps, or 'none'>
FOLLOWUP: <a single follow-up query to fill the biggest gap, or 'none'>`,
      },
      {
        role: "user",
        content: `Query: ${query}\n\nAnswer: ${answer}`,
      },
    ],
    temperature: 0,
    max_tokens: 300,
  });

  return parseEvaluationResponse(extractText(result));
}

// ---------------------------------------------------------------------------
// Internal parsers
// ---------------------------------------------------------------------------

function parseQueryResponse(response: string, fallbackQuery: string): PreparedQuery {
  const lines = response
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let refinedQuery = fallbackQuery;
  const followUpQueries: string[] = [];

  for (const line of lines) {
    if (line.startsWith("REFINED:")) {
      refinedQuery = line.replace("REFINED:", "").trim();
    } else if (line.startsWith("FOLLOWUP1:")) {
      const fq = line.replace("FOLLOWUP1:", "").trim();
      if (fq && fq.toLowerCase() !== "none") followUpQueries.push(fq);
    } else if (line.startsWith("FOLLOWUP2:")) {
      const fq = line.replace("FOLLOWUP2:", "").trim();
      if (fq && fq.toLowerCase() !== "none") followUpQueries.push(fq);
    }
  }

  return { refinedQuery, followUpQueries };
}

function parseEvaluationResponse(response: string): ResponseEvaluation {
  const lines = response
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let sufficient = true;
  const gaps: string[] = [];
  let followUpQuery: string | undefined;

  for (const line of lines) {
    if (line.startsWith("SUFFICIENT:")) {
      sufficient = line.replace("SUFFICIENT:", "").trim().toLowerCase() === "yes";
    } else if (line.startsWith("GAPS:")) {
      const gapStr = line.replace("GAPS:", "").trim();
      if (gapStr.toLowerCase() !== "none") {
        gaps.push(
          ...gapStr
            .split(",")
            .map((g) => g.trim())
            .filter(Boolean),
        );
      }
    } else if (line.startsWith("FOLLOWUP:")) {
      const fq = line.replace("FOLLOWUP:", "").trim();
      if (fq.toLowerCase() !== "none") followUpQuery = fq;
    }
  }

  return { sufficient, gaps, followUpQuery };
}
