/**
 * @fileoverview Job Salary Data API routes + RapidAPI usage dashboard endpoints.
 *
 * Routes:
 *   GET /job-salary                  — real-time salary by title + location
 *   GET /company-job-salary          — salary by company + title + location
 *   GET /rapidapi-usage              — per-endpoint usage summary for a month
 *   GET /rapidapi-usage/budget       — current month's remaining budget
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import {
  JobSalaryDataService,
  RapidApiBudgetError,
} from "@/backend/services/job-salary-data";
import { RapidApiUsageTracker } from "@/backend/services/rapidapi-usage-tracker";

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const jobSalaryRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /job-salary
// ---------------------------------------------------------------------------

jobSalaryRouter.openapi(
  createRoute({
    method: "get",
    path: "/job-salary",
    operationId: "getJobSalary",
    request: {
      query: z.object({
        job_title: z.string().min(1).openapi({ description: "Job title to look up" }),
        location: z.string().min(1).openapi({ description: "City, state, or metro area" }),
        radius: z
          .string()
          .optional()
          .openapi({ description: "Search radius in miles (optional)" }),
      }),
    },
    responses: {
      200: {
        description: "Salary estimates from multiple publishers",
        content: { "application/json": { schema: z.any() } },
      },
      429: {
        description: "Monthly RapidAPI budget exhausted",
        content: { "application/json": { schema: z.any() } },
      },
      500: {
        description: "Server Error",
        content: { "application/json": { schema: z.any() } },
      },
    },
  }),
  async (c) => {
    try {
      const { job_title, location, radius } = c.req.valid("query");
      const service = new JobSalaryDataService(c.env);
      const result = await service.getJobSalary({
        job_title,
        location,
        radius: radius ? parseInt(radius, 10) : undefined,
      });
      return c.json(result, 200);
    } catch (e) {
      if (e instanceof RapidApiBudgetError) {
        return c.json(e.details, 429);
      }
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /company-job-salary
// ---------------------------------------------------------------------------

jobSalaryRouter.openapi(
  createRoute({
    method: "get",
    path: "/company-job-salary",
    operationId: "getCompanyJobSalary",
    request: {
      query: z.object({
        company_name: z
          .string()
          .min(1)
          .openapi({ description: "Company name (e.g., Google, Meta)" }),
        job_title: z.string().min(1).openapi({ description: "Job title" }),
        location: z
          .string()
          .optional()
          .openapi({ description: "Location (optional)" }),
      }),
    },
    responses: {
      200: {
        description: "Company-specific salary estimates",
        content: { "application/json": { schema: z.any() } },
      },
      429: {
        description: "Monthly RapidAPI budget exhausted",
        content: { "application/json": { schema: z.any() } },
      },
      500: {
        description: "Server Error",
        content: { "application/json": { schema: z.any() } },
      },
    },
  }),
  async (c) => {
    try {
      const { company_name, job_title, location } = c.req.valid("query");
      const service = new JobSalaryDataService(c.env);
      const result = await service.getCompanyJobSalary({
        company_name,
        job_title,
        location: location || undefined,
      });
      return c.json(result, 200);
    } catch (e) {
      if (e instanceof RapidApiBudgetError) {
        return c.json(e.details, 429);
      }
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  },
);

// ---------------------------------------------------------------------------
// GET /rapidapi-usage — monthly summary by endpoint
// ---------------------------------------------------------------------------

jobSalaryRouter.openapi(
  createRoute({
    method: "get",
    path: "/rapidapi-usage",
    operationId: "getRapidApiUsage",
    request: {
      query: z.object({
        year: z.string().optional().openapi({ description: "Year (defaults to current)" }),
        month: z.string().optional().openapi({ description: "Month 1-12 (defaults to current)" }),
        api_host: z
          .string()
          .optional()
          .openapi({ description: "Filter by RapidAPI host" }),
      }),
    },
    responses: {
      200: {
        description: "Usage summary for the requested month",
        content: { "application/json": { schema: z.any() } },
      },
    },
  }),
  async (c) => {
    const { year: yearStr, month: monthStr } = c.req.valid("query");
    const now = new Date();
    const year = yearStr ? parseInt(yearStr, 10) : now.getUTCFullYear();
    const month = monthStr ? parseInt(monthStr, 10) : now.getUTCMonth() + 1;

    const tracker = new RapidApiUsageTracker(c.env);
    const summary = await tracker.getUsageSummary(year, month);
    return c.json(summary, 200);
  },
);

// ---------------------------------------------------------------------------
// GET /rapidapi-usage/budget — current month budget status
// ---------------------------------------------------------------------------

jobSalaryRouter.openapi(
  createRoute({
    method: "get",
    path: "/rapidapi-usage/budget",
    operationId: "getRapidApiBudget",
    responses: {
      200: {
        description: "Current month's RapidAPI budget status",
        content: { "application/json": { schema: z.any() } },
      },
    },
  }),
  async (c) => {
    const tracker = new RapidApiUsageTracker(c.env);
    const budget = await tracker.checkBudget();
    return c.json(budget, 200);
  },
);
