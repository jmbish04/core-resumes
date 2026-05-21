import { eq } from "drizzle-orm";

import { getDb } from "@/backend/db";
import { boardTokens } from "@/backend/db/schema";

import type { JobScannerState } from "../types";

import { JobScannerAgent } from "../index";
import { handleScanBoard } from "./scan-board";

export async function handleScanAll(
  env: Env,
  state: JobScannerState,
  agent: JobScannerAgent,
): Promise<string[]> {
  const db = getDb(env);
  const activeBoards = await db
    .select({ token: boardTokens.token })
    .from(boardTokens)
    .where(eq(boardTokens.isActive, true));

  const tokens = activeBoards.map((b) => b.token);
  const sessionIds: string[] = [];

  for (const token of tokens) {
    const sessionId = crypto.randomUUID();
    sessionIds.push(sessionId);
    // Background execution per board
    (agent as any).ctx.waitUntil(handleScanBoard(env, state, sessionId, token, agent));
  }

  return sessionIds;
}
