/**
 * @fileoverview Pipeline API barrel — composes all pipeline sub-routers
 * into a single export consumed by the main API entrypoint.
 *
 * Sub-routers:
 *  - stats         → GET  /stats
 *  - board-tokens  → CRUD /board-tokens
 *  - health        → POST /health
 *  - insights      → GET  /insights
 */

import { OpenAPIHono } from "@hono/zod-openapi";

import { apiCompaniesRouter } from "./api-companies";
import { boardTokensRouter } from "./board-tokens";
import { healthRouter } from "./health";
import { insightsRouter } from "./insights";
import { jobsRouter } from "./jobs";
import { statsRouter } from "./stats";

// ---------------------------------------------------------------------------
// Composed Router
// ---------------------------------------------------------------------------

export const pipelineRouter = new OpenAPIHono<{ Bindings: Env }>();

pipelineRouter.route("/", statsRouter);
pipelineRouter.route("/", boardTokensRouter);
pipelineRouter.route("/", apiCompaniesRouter);
pipelineRouter.route("/", healthRouter);
pipelineRouter.route("/", insightsRouter);
pipelineRouter.route("/", jobsRouter);
