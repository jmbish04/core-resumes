/**
 * @fileoverview Shared Zod schemas and TypeScript types for the pipeline API.
 *
 * Centralizes all request/response schemas consumed by the pipeline
 * sub-routers (stats, board-tokens, health, insights).
 */

import { z } from "@hono/zod-openapi";

// ---------------------------------------------------------------------------
// Board Token
// ---------------------------------------------------------------------------

export const boardTokenSchema = z.object({
  id: z.number(),
  token: z.string(),
  companyName: z.string().nullable(),
  companyUrl: z.string().nullable(),
  emailDomain: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createTokenBody = z.object({
  token: z.string().min(1),
  companyName: z.string().optional(),
  companyUrl: z.string().optional(),
  emailDomain: z.string().optional(),
  isActive: z.boolean().optional().default(true),
});

export const updateTokenBody = z.object({
  token: z.string().optional(),
  companyName: z.string().nullable().optional(),
  companyUrl: z.string().nullable().optional(),
  emailDomain: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const syncApiCompaniesBody = z.object({
  companies: z.array(
    z.object({
      token: z.string(),
      system: z.string(),
      source: z.string(),
    }),
  ),
});

export const syncProgressBody = z.object({
  status: z.string(),
  current: z.number().optional(),
  total: z.number().optional(),
  message: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Pipeline Stats
// ---------------------------------------------------------------------------

export const pipelineStatsSchema = z.object({
  totalSessions: z.number(),
  totalCompanies: z.number(),
  activeCompanies: z.number(),
  totalJobsScraped: z.number(),
  totalJobsTriaged: z.number(),
  totalJobsAnalyzed: z.number(),
  lastScrape: z
    .object({
      timestamp: z.string(),
      totalScraped: z.number(),
      totalTriaged: z.number(),
      totalAnalyzed: z.number(),
      totalFailed: z.number(),
    })
    .nullable(),
  nextScheduledRun: z.string().nullable(),
  cronSchedule: z.string(),
  sessionHistory: z.array(
    z.object({
      timestamp: z.string(),
      totalScraped: z.number(),
      totalTriaged: z.number(),
      totalAnalyzed: z.number(),
      totalFailed: z.number(),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Snapshot Insights
// ---------------------------------------------------------------------------

export const snapshotInsightsSchema = z.object({
  verdictDistribution: z.array(z.object({ verdict: z.string(), count: z.number() })),
  avgSalary: z.object({
    overall: z.number().nullable(),
    byVerdict: z.array(
      z.object({
        verdict: z.string(),
        avgMin: z.number().nullable(),
        avgMax: z.number().nullable(),
      }),
    ),
  }),
  totalSnapshots: z.number(),
  totalPostings: z.number(),
  companyCoverage: z.array(
    z.object({
      token: z.string(),
      companyName: z.string().nullable(),
      jobCount: z.number(),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const pipelineHealthResultSchema = z.object({
  results: z.array(
    z.object({
      name: z.string(),
      status: z.enum(["ok", "warn", "fail", "skipped", "timeout"]),
      message: z.string().optional(),
      durationMs: z.number(),
      details: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
  overall: z.enum(["healthy", "degraded", "unhealthy"]),
  durationMs: z.number(),
});
