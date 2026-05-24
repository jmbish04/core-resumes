/**
 * @fileoverview Session-cookie authentication middleware for protected API routes.
 *
 * API-key protected NotebookLM session endpoints bypass browser session auth so
 * local automation can manage cookies without a `cr_session` browser cookie.
 */

import { createMiddleware } from "hono/factory";

import { verifySessionCookie } from "@/backend/lib/cookies";
import { getWorkerApiKey } from "@/backend/utils/secrets";

export const authMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: { authed: true };
}>(async (c, next) => {
  if (
    c.req.path === "/api/auth/login" ||
    c.req.path === "/api/notebook/session/sync" ||
    c.req.path === "/api/notebook/session/check"
  ) {
    await next();
    return;
  }

  // 1. Try Session Cookie Auth
  const cookieHeader = c.req.header("cookie");
  const sessionPayload = await verifySessionCookie(c.env, cookieHeader);
  if (sessionPayload) {
    c.set("authed", true);
    return next();
  }

  // 2. Try API Key Auth (for programmatic/automation access)
  const workerApiKey = await getWorkerApiKey(c.env);
  const authHeader = c.req.header("Authorization") || c.req.header("x-api-key");

  if (workerApiKey && authHeader) {
    let providedKey = "";
    if (authHeader.startsWith("Bearer ")) {
      providedKey = authHeader.substring(7);
    } else {
      providedKey = authHeader;
    }

    if (providedKey === workerApiKey) {
      c.set("authed", true);
      return next();
    }
  }

  // If both fail, reject
  return c.json({ error: "Unauthorized" }, 401);
});
