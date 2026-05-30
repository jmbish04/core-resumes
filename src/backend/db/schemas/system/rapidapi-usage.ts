import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Table & column documentation (consumed by /api/docs/schema)
// ---------------------------------------------------------------------------

/** Human-readable description of the `rapidapi_usage_log` table for the documentation UI. */
export const RAPIDAPI_USAGE_LOG_TABLE_DESCRIPTION =
  "Append-only log tracking every RapidAPI call across all endpoints (Upwork, Freelancer, Job Salary, etc.) to enforce the monthly request budget and provide per-endpoint usage analytics.";

/** Per-column descriptions surfaced in the documentation schema viewer. */
export const RAPIDAPI_USAGE_LOG_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Unique identifier for the usage event.",
  timestamp: "Timestamp when the API call was made.",
  api_host: "RapidAPI host header value (e.g., 'job-salary-data.p.rapidapi.com', 'upwork-api.p.rapidapi.com').",
  api_endpoint: "Path or operation name called (e.g., '/job-salary', '/upwork', '/freelancer').",
  request_params: "JSON-serialized query parameters or request body sent to the API.",
  response_status: "HTTP status code returned by the RapidAPI endpoint.",
  response_bytes: "Approximate response payload size in bytes.",
  duration_ms: "Round-trip latency of the API call in milliseconds.",
  error: "Error message if the call failed, null otherwise.",
};

// ---------------------------------------------------------------------------
// Table definition
// ---------------------------------------------------------------------------

export const rapidapiUsageLog = sqliteTable(
  "rapidapi_usage_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    timestamp: integer("timestamp", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    apiHost: text("api_host").notNull(),
    apiEndpoint: text("api_endpoint").notNull(),
    requestParams: text("request_params", { mode: "json" })
      .$type<Record<string, unknown>>(),
    responseStatus: integer("response_status").notNull(),
    responseBytes: integer("response_bytes"),
    durationMs: integer("duration_ms"),
    error: text("error"),
  },
  (table) => ({
    timestampIdx: index("rapidapi_usage_log_timestamp_idx").on(table.timestamp),
    apiHostIdx: index("rapidapi_usage_log_api_host_idx").on(table.apiHost),
    hostEndpointIdx: index("rapidapi_usage_log_host_endpoint_idx").on(
      table.apiHost,
      table.apiEndpoint,
    ),
  }),
);

// ---------------------------------------------------------------------------
// Schemas and Types
// ---------------------------------------------------------------------------

export const insertRapidapiUsageLogSchema = createInsertSchema(rapidapiUsageLog);
export const selectRapidapiUsageLogSchema = createSelectSchema(rapidapiUsageLog);
export type RapidapiUsageLog = typeof rapidapiUsageLog.$inferSelect;
export type NewRapidapiUsageLog = typeof rapidapiUsageLog.$inferInsert;
