/**
 * @fileoverview NotebookLM agent consult method handlers.
 *
 * The consultation pipeline:
 *   1. Prepare — Workers AI refines the raw query into an evidence-seeking prompt
 *   2. Recall — Check career memory for relevant past interactions
 *   3. Consult — Send refined query to NotebookLM via the auth module
 *   4. Evaluate — Workers AI assesses response completeness
 *   5. Follow-up — If gaps detected, one automatic follow-up query
 *   6. Remember — Store the full exchange in career memory (D1 + Vectorize)
 */

import type { Connection } from "agents";

import { prepareNotebookQuery, evaluateNotebookResponse } from "@/ai/tasks";
import { consultNotebook } from "@/ai/tools/notebooklm/notebooklm";
import { CareerMemoryService } from "@/services/career-memory";

import type { NotebookLMAgent } from "../index";

// ---------------------------------------------------------------------------
// Callable RPC handler
// ---------------------------------------------------------------------------

export async function handleConsult(
  agent: NotebookLMAgent,
  env: Env,
  rawQuery: string,
  context?: { roleTitle?: string; companyName?: string; roleId?: string },
) {
  const memory = new CareerMemoryService(env);

  // Step 1: Prepare — refine the query for optimal NotebookLM results
  const prepared = await prepareNotebookQuery(env, rawQuery, {
    roleTitle: context?.roleTitle,
    companyName: context?.companyName,
    queryPurpose: "career knowledge base consultation",
  });

  // Step 2: Recall — fetch relevant past interactions for enrichment
  const pastMemories = await memory.recall(rawQuery, {
    limit: 3,
    roleId: context?.roleId,
    activeOnly: true,
  });

  // Step 3: Consult NotebookLM with the refined query
  const primaryResult = await consultNotebook(env, prepared.refinedQuery);

  // Step 4: Evaluate completeness
  const evaluation = await evaluateNotebookResponse(
    env,
    prepared.refinedQuery,
    primaryResult.answer,
  );

  // Step 5: Follow-up if gaps detected (max 1 cycle)
  let followUpResult: { query: string; answer: string } | undefined;

  if (!evaluation.sufficient && evaluation.followUpQuery) {
    try {
      const followUp = await consultNotebook(env, evaluation.followUpQuery);
      followUpResult = {
        query: evaluation.followUpQuery,
        answer: followUp.answer,
      };
    } catch {
      // Follow-up failure is non-fatal — primary result is still usable
    }
  }

  // Step 6: Remember — store the exchange in career memory
  const combinedAnswer = followUpResult
    ? `${primaryResult.answer}\n\n--- Follow-up ---\n${followUpResult.answer}`
    : primaryResult.answer;

  const memoryId = await memory.remember({
    query: rawQuery,
    answer: combinedAnswer,
    source: "notebooklm",
    agent: "notebooklm",
    category: context?.roleId ? "role_analysis" : "general",
    roleId: context?.roleId,
    references: primaryResult.references ?? [],
    metadata: {
      refinedQuery: prepared.refinedQuery,
      followUpQueries: prepared.followUpQueries,
      evaluation: {
        sufficient: evaluation.sufficient,
        gaps: evaluation.gaps,
      },
      hasFollowUp: !!followUpResult,
      pastMemoryIds: pastMemories.map((m) => m.id),
    },
  });

  return {
    answer: primaryResult.answer,
    references: primaryResult.references,
    followUp: followUpResult,
    evaluation,
    memoryId,
    refinedQuery: prepared.refinedQuery,
  };
}

// ---------------------------------------------------------------------------
// WebSocket handler
// ---------------------------------------------------------------------------

export async function handleMessage(
  agent: NotebookLMAgent,
  env: Env,
  connection: Connection,
  message: unknown,
) {
  let query = "";
  let context: { roleTitle?: string; companyName?: string; roleId?: string } | undefined;

  if (typeof message === "string") {
    query = message;
  } else if (typeof message === "object" && message !== null && "query" in message) {
    const msg = message as Record<string, unknown>;
    query = msg.query as string;
    if (msg.roleTitle || msg.companyName || msg.roleId) {
      context = {
        roleTitle: msg.roleTitle as string | undefined,
        companyName: msg.companyName as string | undefined,
        roleId: msg.roleId as string | undefined,
      };
    }
  } else {
    connection.send(
      JSON.stringify({ error: "Invalid message format, expected { query: string } or a string" }),
    );
    return;
  }

  try {
    connection.send(
      JSON.stringify({ type: "status", phase: "preparing", message: "Refining query..." }),
    );

    const result = await handleConsult(agent, env, query, context);

    connection.send(JSON.stringify({ type: "result", data: result }));
  } catch (error) {
    connection.send(
      JSON.stringify({
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    );
  }
}
