/**
 * @file Schema for AI log (Workers AI) — tracks model invocations for cost and debugging.
 */

import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

export const AI_LOG_WORKERS_AI_TABLE_DESCRIPTION =
  "Audit log of Workers AI model invocations during the greenhouse pipeline. Tracks tokens, latency, errors, and cost for observability.";

export const AI_LOG_WORKERS_AI_COLUMN_DESCRIPTIONS: Record<string, string> = {
  id: "Auto-incrementing primary key.",
  timestamp: "Unix timestamp (seconds) of the invocation.",
  model: "Workers AI model identifier (e.g. @cf/openai/gpt-oss-120b).",
  direction: "Whether this was a 'request' or 'response' log entry.",
  job_title: "Title of the job being processed (for correlation).",
  schema_target: "Zod schema name targeted by the structured output call.",
  input_tokens: "Approximate input token count.",
  output_tokens: "Approximate output token count.",
  response_preview: "First ~500 chars of the model response for debugging.",
  duration_seconds: "Wall-clock duration of the model call.",
  error: "Error message if the call failed.",
  http_status: "HTTP status code returned by the AI gateway.",
};

export const aiLogWorkersAi = sqliteTable("ai_log_workers_ai", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timestamp: integer("timestamp", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
  model: text("model").notNull(),
  direction: text("direction", { enum: ["request", "response"] }).notNull(),
  jobTitle: text("job_title"),
  schemaTarget: text("schema_target"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  responsePreview: text("response_preview"),
  durationSeconds: real("duration_seconds"),
  error: text("error"),
  httpStatus: integer("http_status"),
});

export const insertAiLogWorkersAiSchema = createInsertSchema(aiLogWorkersAi);
export const selectAiLogWorkersAiSchema = createSelectSchema(aiLogWorkersAi);
export type AiLogWorkersAi = typeof aiLogWorkersAi.$inferSelect;
export type NewAiLogWorkersAi = typeof aiLogWorkersAi.$inferInsert;
