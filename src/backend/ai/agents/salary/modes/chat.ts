import { Agent } from "agents";
import { generateText, tool, zodSchema, stepCountIs } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";

import { CHAT_SYSTEM_PROMPT } from "../prompts/chat-system";
import { querySalaryData } from "../../../../services/salary/sql-tool";
import { runBenchmarkBattery } from "../../../../services/salary/benchmark-battery";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/**
 * Run interactive chat mode for the Salary Agent.
 *
 * Both consumers (RoleChatAgent.consultSalaryAgent and the /salary/chat route)
 * await this and wrap the returned value as JSON, so we run a non-streaming
 * tool-calling turn via `generateText` and return the final text.
 */
export async function runChatMode(
  _agent: Agent<Env, any>,
  env: Env,
  messages: any[],
  context: any,
): Promise<string> {
  const roleId: string | null = context?.roleId ?? null;
  const contextMode: "single-role" | "aggregate" = roleId ? "single-role" : "aggregate";

  const workersai = createWorkersAI({
    binding: env.AI,
    gateway: { id: env.AI_GATEWAY_ID },
  });
  const model = workersai(env.MODEL_CHAT ?? "@cf/moonshotai/kimi-k2.5");

  // Incoming messages are plain { role, content } objects (see consultSalaryAgent).
  const coreMessages: ChatMessage[] = (messages ?? [])
    .map((m) => ({
      role: m?.role === "assistant" || m?.role === "system" ? m.role : "user",
      content:
        typeof m?.content === "string"
          ? m.content
          : Array.isArray(m?.parts)
            ? m.parts.map((p: any) => p?.text ?? "").join("")
            : String(m?.content ?? ""),
    }))
    .filter((m) => m.content.length > 0);

  const result = await generateText({
    model,
    system: CHAT_SYSTEM_PROMPT(contextMode, context),
    messages: coreMessages,
    temperature: 0.3,
    maxOutputTokens: 4096,
    stopWhen: stepCountIs(5),
    tools: {
      query_salary_data: tool({
        description:
          "Run a single read-only SELECT against the salary market database to fetch data the context lacks. Returns rows as JSON.",
        inputSchema: zodSchema(
          z.object({
            sql: z.string().describe("A single read-only SQL SELECT statement."),
          }),
        ) as any,
        execute: async ({ sql }) => {
          const res = await querySalaryData(env.DB, sql, {
            roleId,
            mode: "chat",
            auditDb: env.DB,
          });
          if (!res.ok) {
            return { success: false, error: res.error, code: res.code };
          }
          return {
            success: true,
            rowCount: res.rowCount,
            truncated: res.truncated,
            rows: res.rows,
          };
        },
      }),

      run_benchmark_battery: tool({
        description:
          "Run the deterministic single-role benchmark battery for a role. Returns the full set of findings (status, confidence, magnitude).",
        inputSchema: zodSchema(
          z.object({
            roleId: z.string().describe("The role UUID to benchmark."),
            companyName: z.string().nullable().optional(),
            jobTitle: z.string().nullable().optional(),
            salaryMin: z.number().nullable().optional(),
            salaryMax: z.number().nullable().optional(),
            geoId: z.number().nullable().optional(),
            metro: z.string().nullable().optional(),
            latestSnapshotId: z
              .number()
              .describe("Snapshot id to benchmark against; 0 for latest available."),
          }),
        ) as any,
        execute: async (input) => {
          try {
            const findings = await runBenchmarkBattery(env.DB, {
              roleId: input.roleId,
              companyName: input.companyName ?? null,
              jobTitle: input.jobTitle ?? null,
              salaryMin: input.salaryMin ?? null,
              salaryMax: input.salaryMax ?? null,
              geoId: input.geoId ?? null,
              metro: input.metro ?? null,
              latestSnapshotId: input.latestSnapshotId ?? 0,
            });
            return { success: true, findings };
          } catch (err) {
            return {
              success: false,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        },
      }),
    },
  });

  return result.text;
}
