/**
 * @fileoverview Pipeline API barrel — composes all pipeline sub-routers
 * into a single export consumed by the main API entrypoint.
 *
 * Sub-routers:
 *  - stats              → GET  /stats
 *  - board-tokens       → CRUD /board-tokens
 *  - health             → POST /health
 *  - insights           → GET  /insights
 *  - job-salary         → GET  /job-salary, /company-job-salary, /rapidapi-usage
 */

import { OpenAPIHono } from "@hono/zod-openapi";

import { apiCompaniesRouter } from "./api-companies";
import { boardTokensRouter } from "./board-tokens";
import { healthRouter } from "./health";
import { insightsRouter } from "./insights";
import { jobsRouter } from "./jobs";
import { jobSalaryRouter } from "./job-salary";
import { statsRouter } from "./stats";
import { salaryStatsRouter } from "./salary-stats";
import { salaryIntelligenceRouter } from "./salary-intelligence";
import { seedSalaryRefactorRouter } from "./seed-salary-refactor";
import { promoteRouter } from "./promote";
import { analyzeRoleRouter, analyzeAggregateRouter, chatRouter, findingsRouter, dataExplorerRouter } from "./salary";

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
pipelineRouter.route("/", jobSalaryRouter);
pipelineRouter.route("/", salaryIntelligenceRouter);
pipelineRouter.route("/", promoteRouter);
pipelineRouter.route("/", seedSalaryRefactorRouter);
pipelineRouter.route("/", analyzeRoleRouter);
pipelineRouter.route("/", analyzeAggregateRouter);
pipelineRouter.route("/", chatRouter);
pipelineRouter.route("/", findingsRouter);
pipelineRouter.route("/", dataExplorerRouter);


