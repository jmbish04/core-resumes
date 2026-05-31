/**
 * @fileoverview Hono API application — the central REST API for the Career
 * Orchestrator Worker.
 *
 * This module creates the root `OpenAPIHono` app, registers global middleware
 * (CORS, logger, error handler, session-cookie auth), and mounts all domain
 * routers under `/api/*`.  It also exposes OpenAPI documentation at:
 *   - `/openapi.json` — machine-readable OpenAPI 3.1 spec
 *   - `/scalar`       — interactive Scalar API reference UI
 *   - `/swagger`      — Swagger UI
 *
 * Route mount order follows a logical grouping:
 *   auth → health → roles → intake → threads → notebook → documents →
 *   emails → config → admin → docs → dashboard → client-error
 */

import { swaggerUI } from "@hono/swagger-ui";
import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { authMiddleware } from "./middleware/auth";
import { errorHandler } from "./middleware/error";
import { analysisRouter } from "./routes/analysis";
import { authRouter } from "./routes/auth";
import { bulletsRouter } from "./routes/bullets";
import { clientErrorRouter } from "./routes/client-error";
import { commuteRouteRouter } from "./routes/commute-route";
import { companiesRouter } from "./routes/companies";
import { adminRouter, configRouter } from "./routes/config";
import { dashboardRouter } from "./routes/dashboard";
import { docsRouter } from "./routes/docs";
import { docsGeneratorRouter } from "./routes/docs-generator";
import { documentsRouter } from "./routes/documents";
import { emailsRouter } from "./routes/emails";
import { filesRouter } from "./routes/files";
import { freelanceRoutes } from "./routes/freelance";
import { geoRouter } from "./routes/geo";
import { healthRouter } from "./routes/health";
import { insightsRouter } from "./routes/insights";
import { intakeRouter } from "./routes/intake";
import { interviewNotesRouter } from "./routes/interview-notes";
import { interviewRecordingsRouter } from "./routes/interview-recordings";
import { memoryRouter } from "./routes/memory";
import { notebookRouter } from "./routes/notebook";
import { notebookSessionRouter } from "./routes/notebook-session";
import { notebooklmBlobsRouter } from "./routes/notebooklm-blobs";
import { pipelineRouter } from "./routes/pipeline";
import { salaryStatsRouter } from "./routes/pipeline/salary-stats";
import { roleBulletsRouter } from "./routes/role-bullets";
import { rolePodcastAssetsRouter, rolePodcastsRouter } from "./routes/role-podcasts";
import { rolesRouter } from "./routes/roles";
import { scoringRubricsRouter } from "./routes/scoring-rubrics";
import { threadsRouter } from "./routes/threads";
import { transcribeRouter } from "./routes/transcribe";
import { transcriptionJobsRouter } from "./routes/transcription-jobs";
import { ttsRouter } from "./routes/tts";

// ---------------------------------------------------------------------------
// App type — shared by all routers
// ---------------------------------------------------------------------------

/**
 * Hono binding types used across the API layer.
 *
 * - `Bindings` — Cloudflare Worker `Env` (D1, KV, Secrets Store, AI, etc.)
 * - `Variables` — request-scoped variables set by middleware (e.g. `authed`)
 */
export type AppBindings = {
  Bindings: Env;
  Variables: { authed: true };
};

// ---------------------------------------------------------------------------
// Root app and global middleware
// ---------------------------------------------------------------------------

/** Root Hono OpenAPI app instance. */
export const app = new OpenAPIHono<AppBindings>();

/** Enable CORS for all origins (single-user app). */
app.use("*", cors());
/** Log every request method + path + status + duration. */
app.use("*", logger());
/** Global error handler — returns structured JSON errors. */
app.onError(errorHandler);

// ---------------------------------------------------------------------------
// Public route (no auth required)
// ---------------------------------------------------------------------------

/** Lightweight liveness probe — returns `{ status: "ok", timestamp }`. */
app.get("/api/ping", (c) => c.json({ status: "ok", timestamp: Date.now() }));

// ---------------------------------------------------------------------------
// Auth middleware (applied to all /api/* routes except /api/auth/login)
// ---------------------------------------------------------------------------

/** Validate the `cr_session` cookie on every API request. */
app.use("/api/*", authMiddleware);

// ---------------------------------------------------------------------------
// Domain routers
// ---------------------------------------------------------------------------

app.route("/api/auth", authRouter);
app.route("/api/health", healthRouter);
app.route("/api/roles", rolesRouter);
app.route("/api/roles", rolePodcastsRouter);
app.route("/api/role-podcasts", rolePodcastAssetsRouter);
app.route("/api/intake", intakeRouter);
app.route("/api/threads", threadsRouter);
app.route("/api/notebook", notebookRouter);
app.route("/api/notebook", notebookSessionRouter);
app.route("/api/docs-generator", docsGeneratorRouter);
app.route("/api/documents", documentsRouter);
app.route("/api/emails", emailsRouter);
app.route("/api/files", filesRouter);
app.route("/api/bullets", bulletsRouter);
app.route("/api/companies", companiesRouter);
app.route("/api/config", configRouter);
app.route("/api/admin", adminRouter);
app.route("/api/docs", docsRouter);
app.route("/api/dashboard", dashboardRouter);
app.route("/api/tts", ttsRouter);
app.route("/api/transcribe", transcribeRouter);
app.route("/api/roles", analysisRouter);
app.route("/api/roles", interviewNotesRouter);
app.route("/api/roles", interviewRecordingsRouter);
app.route("/api/memory", memoryRouter);
app.route("/api/roles", roleBulletsRouter);
app.route("/api/roles", insightsRouter);
app.route("/api/roles", commuteRouteRouter);
app.route("/api/roles", notebooklmBlobsRouter);
app.route("/api/scoring-rubrics", scoringRubricsRouter);
app.route("/api/transcription-jobs", transcriptionJobsRouter);
app.route("/api/pipeline", pipelineRouter);
app.route("/api/roles", salaryStatsRouter);
app.route("/api/freelance", freelanceRoutes);
app.route("/api/geo", geoRouter);
app.route("/api/__client-error", clientErrorRouter);

// ---------------------------------------------------------------------------
// OpenAPI documentation endpoints
// ---------------------------------------------------------------------------

app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Career Orchestrator",
    version: "1.0.0",
  },
});
app.get("/scalar", apiReference({ url: "/openapi.json" }));
app.get("/swagger", swaggerUI({ url: "/openapi.json" }));
