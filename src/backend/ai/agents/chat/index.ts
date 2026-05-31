import type { OnChatMessageOptions } from "@cloudflare/ai-chat";
import type { UIMessage } from "ai";
import type { StreamTextOnFinishCallback, ToolSet } from "ai";

import { AIChatAgent } from "@cloudflare/ai-chat";
import { getAgentByName } from "agents";
import { streamText, convertToModelMessages, tool, zodSchema, stepCountIs } from "ai";
import { eq } from "drizzle-orm";
import { createWorkersAI } from "workers-ai-provider";
import { z } from "zod";

import { getActiveBullets } from "@/backend/ai/tasks";
import { enforceTokenLimit } from "@/backend/ai/utils/token-estimator";
import { getDb } from "@/backend/db";
import { roles } from "@/backend/db/schema";
import { SalaryAgent } from "@/backend/ai/agents/salary";

export class RoleChatAgent extends AIChatAgent<Env> {
  static docsMetadata() {
    return {
      name: "RoleChatAgent",
      className: "RoleChatAgent",
      description: "Stateful chat agent replacing Hono chat.ts for assistant-ui.",
      docsPath: "/docs/agents/chat",
      methods: [],
      tools: [
        "NotebookLM SDK",
        "Workers AI",
        "Cloudflare Vectorize",
        "Cloudflare Browser Rendering",
      ],
    };
  }

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: OnChatMessageOptions,
  ) {
    const db = getDb(this.env);

    // In our implementation, the DO's name is the roleId if it's not "global".
    const roleId = this.name !== "global" ? this.name : undefined;

    // `this.messages` is the SDK-managed persisted conversation history.
    // Per @cloudflare/ai-chat docs, `options.body` explicitly excludes
    // `messages` and `clientTools` — only custom body fields land there.
    // See https://developers.cloudflare.com/agents/api-reference/chat-agents/
    const incomingMessages = this.messages as UIMessage[];

    // Optional system override from the client (custom body field).
    const system = (options?.body?.system as string) ?? undefined;

    // Build system context
    const systemParts: string[] = [
      system ??
        "You are Colby, a precise career assistant. You help with job applications, resume crafting, interview preparation, and career strategy. Be concise, actionable, and evidence-based.",
    ];

    // Load role context if scoped to a role
    let roleRecord: typeof roles.$inferSelect | undefined;
    if (roleId) {
      const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);

      if (role) {
        roleRecord = role;
        systemParts.push(
          `\n## Current Role Context`,
          `Company: ${role.companyName}`,
          `Title: ${role.jobTitle}`,
          role.jobUrl ? `URL: ${role.jobUrl}` : "",
          role.roleInstructions ? `\n## Role-Specific Instructions\n${role.roleInstructions}` : "",
        );

        // Add job posting metadata if available
        const meta = role.metadata as any;
        if (meta) {
          const jobDesc =
            typeof meta.jobDescription === "string"
              ? meta.jobDescription
              : typeof meta.rawText === "string"
                ? meta.rawText
                : null;

          if (jobDesc) {
            enforceTokenLimit(jobDesc, 120000, "Job Description");
            systemParts.push(`\n## Job Posting\n${jobDesc}`);
          }
        }
      }
    }

    // Add resume bullets context
    const bullets = await getActiveBullets(this.env);
    if (bullets.length > 0) {
      systemParts.push(
        "\n## Historical Performance Truths",
        "Use these verified accomplishments as source material:",
        ...bullets.map((b) => {
          const metric = b.impactMetric ? ` (${b.impactMetric})` : "";
          return `[${b.category}]${metric} ${b.content}`;
        }),
      );
    }

    // Tool usage guidance
    systemParts.push(`
## Available Tools
You have access to the following tools. Use them proactively when they would help answer the user's question:
- **consultNotebook**: Query NotebookLM for verified career evidence, performance review data, and historical achievements. Use this when the user asks about their qualifications, experience, or career history.
- **searchCareerMemory**: Search the semantic career memory store for past interactions, analyses, and saved insights. Use this for recall of previous conversations or stored knowledge.
- **draftDocument**: Trigger the resume or cover letter generation pipeline. Use this when the user asks you to draft, create, or generate a resume or cover letter.
- **generateMockInterview**: Generate a fresh set of mock interview Q&A pairs tailored to this role and persist them. Use this when the user asks for interview prep or practice questions.
- **scrapeJob**: Extract job posting content from a URL. Use this when the user provides a job URL to analyze.
- **consultSalaryAgent**: Ask the SalaryAgent for specific salary trends, remote discount rates, local premium deltas, negotiation strategies, corporate H1B filings, or aggregate insights. Use this for ALL salary-related queries.
- **getProcessingStatus**: Check the current pipeline/processing status for this role or globally. Use this when the user asks about task progress, what's running, what failed, or pipeline status.
- **investigateTaskError**: Deep-dive into why a specific task or pipeline step failed. Reads activity logs and error metadata. Use this when the user asks "why did X fail?" or "what went wrong?".

When using tools, explain what you're doing and share the results in a clear, actionable format.`);

    // Create Workers AI model via AI SDK provider
    const workersai = createWorkersAI({
      binding: this.env.AI,
      gateway: { id: this.env.AI_GATEWAY_ID },
    });

    const model = workersai(this.env.MODEL_CHAT ?? "@cf/moonshotai/kimi-k2.5");

    // Convert UIMessages to model messages
    const modelMessages = await convertToModelMessages(incomingMessages);

    // Stream with tool definitions
    const result = streamText({
      model,
      system: systemParts.filter(Boolean).join("\n"),
      messages: modelMessages,
      temperature: 0.3,
      maxOutputTokens: 8192,
      stopWhen: stepCountIs(5),
      tools: {
        consultNotebook: tool({
          description:
            "Query NotebookLM for verified career evidence, performance reviews, and historical achievements. Use when the user asks about their qualifications, past projects, or career history.",
          inputSchema: zodSchema(
            z.object({
              query: z
                .string()
                .describe("The question to ask NotebookLM about the candidate's career history"),
            }),
          ) as any,
          execute: async ({ query }) => {
            try {
              const stub: any = await getAgentByName(
                this.env.ORCHESTRATOR_AGENT as any,
                roleId ?? "global",
              );
              const result = await stub.consult_notebook(query);
              type Ref = { title?: string | null; url?: string | null };
              const refs = (result.references ?? []) as Ref[];
              return {
                answer: result.answer ?? "No response received",
                sources: refs.map((ref) => ({
                  title: ref.title ?? "NotebookLM Source",
                  url: ref.url ?? "",
                })),
              };
            } catch (err) {
              return {
                answer: `NotebookLM query failed: ${err instanceof Error ? err.message : "Unknown error"}. Try rephrasing your question.`,
                sources: [],
              };
            }
          },
        }),

        searchCareerMemory: tool({
          description:
            "Search the semantic career memory store (Vectorize) for past interactions, saved analyses, interview prep notes, and career insights.",
          inputSchema: zodSchema(
            z.object({
              query: z.string().describe("The semantic search query for career memory"),
              category: z
                .enum([
                  "career_fact",
                  "role_analysis",
                  "resume_draft",
                  "cover_letter",
                  "interview_prep",
                  "comment_feedback",
                  "general",
                ])
                .optional()
                .describe("Optional category filter"),
              limit: z
                .number()
                .min(1)
                .max(20)
                .optional()
                .default(5)
                .describe("Number of results to return"),
            }),
          ) as any,
          execute: async ({ query, category, limit }) => {
            try {
              const { CareerMemoryService } = await import("@/backend/services/career-memory");
              const memoryService = new CareerMemoryService(this.env);
              const results = await memoryService.recall(query, {
                limit: limit ?? 5,
                category,
                roleId: roleId ?? undefined,
              });

              return {
                count: results.length,
                memories: results.map((m) => ({
                  id: m.id,
                  query: m.query,
                  answer: m.answer.length > 500 ? m.answer.slice(0, 500) + "…" : m.answer,
                  category: m.category,
                  source: m.source,
                  createdAt: m.createdAt,
                })),
              };
            } catch (err) {
              return {
                count: 0,
                memories: [],
                error: `Memory search failed: ${err instanceof Error ? err.message : "Unknown error"}`,
              };
            }
          },
        }),

        draftDocument: tool({
          description:
            "Trigger the resume or cover letter generation pipeline via the OrchestratorAgent. This is a long-running operation that creates a Google Doc.",
          inputSchema: zodSchema(
            z.object({
              docType: z.enum(["resume", "cover_letter"]).describe("Type of document to generate"),
            }),
          ) as any,
          execute: async ({ docType }) => {
            if (!roleId) {
              return {
                status: "error",
                message:
                  "No role context available. Navigate to a specific role page to draft documents.",
              };
            }

            try {
              const { enqueueOrchestratorTask } = await import("@/backend/ai/agents/orchestrator");
              const taskType = docType === "resume" ? "resume_review" : "cover_letter_draft";
              await enqueueOrchestratorTask(this.env, roleId, {
                type: taskType,
                roleId,
              });

              return {
                status: "queued",
                message: `${docType === "resume" ? "Resume" : "Cover letter"} generation has been queued for ${roleRecord?.companyName ?? "this role"}. Check the role status panel for progress.`,
                docType,
              };
            } catch (err) {
              return {
                status: "error",
                message: `Failed to start draft: ${err instanceof Error ? err.message : "Unknown error"}`,
              };
            }
          },
        }),

        generateMockInterview: tool({
          description:
            "Generate a fresh set of mock interview questions and answers tailored to this role, then persist them to the database. The questions will appear in the Mock Interview tab.",
          inputSchema: zodSchema(
            z.object({
              focus: z
                .string()
                .optional()
                .describe(
                  "Optional focus area for the interview (e.g., 'technical', 'behavioral', 'leadership')",
                ),
            }),
          ) as any,
          execute: async ({ focus }) => {
            if (!roleId) {
              return {
                status: "error",
                message:
                  "No role context available. Navigate to a specific role page to generate interview questions.",
              };
            }

            try {
              const { generateInterview } = await import("@/backend/ai/tasks/generate/interview");
              const interviewId = await generateInterview(this.env, roleId);

              return {
                status: "complete",
                interviewId,
                message: `Mock interview generated successfully for ${roleRecord?.companyName ?? "this role"}. Check the Mock Interview tab to review the questions.`,
                focus: focus ?? "general",
              };
            } catch (err) {
              return {
                status: "error",
                message: `Interview generation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
              };
            }
          },
        }),

        scrapeJob: tool({
          description:
            "Extract job posting content from a URL using browser rendering. Returns the raw text and structured elements from the page.",
          inputSchema: zodSchema(
            z.object({
              url: z.string().url().describe("The job posting URL to scrape"),
            }),
          ) as any,
          execute: async ({ url }) => {
            try {
              const stub: any = await getAgentByName(
                this.env.ORCHESTRATOR_AGENT as any,
                roleId ?? "global",
              );
              const result = await stub.scrape_job(url);
              return {
                status: "complete",
                source: new URL(url).hostname,
                textLength: result.text?.length ?? 0,
                preview: result.text?.slice(0, 300) ?? "",
              };
            } catch (err) {
              return {
                status: "error",
                message: `Scraping failed: ${err instanceof Error ? err.message : "Unknown error"}`,
              };
            }
          },
        }),

        consultSalaryAgent: tool({
          description:
            "Ask the stateful SalaryAgent for salary statistics, remote discounts, geographic premiums, cost-of-living adjustments, corporate H1B records, or aggregate insights.",
          inputSchema: zodSchema(
            z.object({
              query: z.string().describe("The salary, benchmark, or simulation question to ask the SalaryAgent"),
            }),
          ) as any,
          execute: async ({ query }) => {
            try {
              const agent = (await getAgentByName(this.env.SALARY_AGENT as any, "global")) as any;
              const result = await agent.chat([{ role: "user", content: query }], { roleId });
              return { success: true, answer: result };
            } catch (err) {
              return {
                success: false,
                error: `SalaryAgent consultation failed: ${err instanceof Error ? err.message : String(err)}`,
              };
            }
          },
        }),

        getProcessingStatus: tool({
          description:
            "Check the current pipeline/processing status for this role. Returns all tasks (pending, running, completed, failed) with their error messages. Use when the user asks about processing progress, what's running, or what failed.",
          inputSchema: zodSchema(
            z.object({
              scope: z
                .enum(["role", "global"])
                .optional()
                .default("role")
                .describe("Whether to check status for the current role or globally"),
            }),
          ) as any,
          execute: async ({ scope }) => {
            try {
              const agentName = scope === "global" || !roleId ? "global" : roleId;
              const stub: any = await getAgentByName(
                this.env.ORCHESTRATOR_AGENT as any,
                agentName,
              );
              const status = await stub.getProcessingStatus();
              return {
                success: true,
                roleId: status.roleId,
                totalTasks: status.tasks.length,
                pending: status.tasks.filter((t: any) => t.status === "pending").length,
                running: status.tasks.filter((t: any) => t.status === "running").length,
                completed: status.tasks.filter((t: any) => t.status === "completed").length,
                failed: status.tasks.filter((t: any) => t.status === "failed").length,
                tasks: status.tasks.map((t: any) => ({
                  id: t.id,
                  type: t.type,
                  status: t.status,
                  error: t.error ?? null,
                  roleId: t.roleId ?? null,
                })),
              };
            } catch (err) {
              return {
                success: false,
                error: `Failed to fetch processing status: ${err instanceof Error ? err.message : String(err)}`,
              };
            }
          },
        }),

        investigateTaskError: tool({
          description:
            "Deep-dive into why a task or pipeline step failed. Reads the role's activity log and error metadata to provide actionable diagnostics. Use when the user asks 'why did X fail?' or 'what went wrong?'.",
          inputSchema: zodSchema(
            z.object({
              taskType: z
                .string()
                .optional()
                .describe(
                  "Optional task type filter (e.g., 'role_analysis', 'resume_review', 'insight_location')",
                ),
            }),
          ) as any,
          execute: async ({ taskType }) => {
            if (!roleId) {
              return {
                success: false,
                error: "No role context. Navigate to a specific role to investigate errors.",
              };
            }

            try {
              const db = getDb(this.env);

              // 1. Get task queue errors from the orchestrator
              const stub: any = await getAgentByName(
                this.env.ORCHESTRATOR_AGENT as any,
                roleId,
              );
              const status = await stub.getProcessingStatus();
              let failedTasks = status.tasks.filter((t: any) => t.status === "failed");
              if (taskType) {
                failedTasks = failedTasks.filter((t: any) => t.type === taskType);
              }

              // 2. Read recent activity log entries for errors
              const { roleLogs } = await import("@/db/schema");
              const { desc } = await import("drizzle-orm");
              const recentLogs = await db
                .select()
                .from(roleLogs)
                .where(eq(roleLogs.roleId, roleId))
                .orderBy(desc(roleLogs.createdAt))
                .limit(20);

              const errorLogs = recentLogs.filter(
                (log) =>
                  log.category === "agentic" &&
                  (log.action.includes("fail") ||
                    log.action.includes("error") ||
                    log.message.toLowerCase().includes("fail") ||
                    log.message.toLowerCase().includes("error")),
              );

              // 3. Check role metadata for processing errors
              const [role] = await db
                .select()
                .from(roles)
                .where(eq(roles.id, roleId))
                .limit(1);
              const meta = (role?.metadata as Record<string, unknown>) ?? {};
              const processingErrors = meta.processingErrors ?? null;

              return {
                success: true,
                failedTasks: failedTasks.map((t: any) => ({
                  id: t.id,
                  type: t.type,
                  error: t.error,
                })),
                recentErrorLogs: errorLogs.map((log) => ({
                  action: log.action,
                  message: log.message,
                  metadata: log.metadata,
                  createdAt: log.createdAt,
                })),
                processingErrors,
                roleStatus: role?.status ?? "unknown",
                suggestion:
                  failedTasks.length > 0
                    ? "You can retry failed tasks by asking me to 'retry failed tasks' or by using the retry button on the role page."
                    : "No failed tasks found in the current queue. The error may have been from a previous session.",
              };
            } catch (err) {
              return {
                success: false,
                error: `Investigation failed: ${err instanceof Error ? err.message : String(err)}`,
              };
            }
          },
        }),
      },
      onFinish: async (event) => {
        if (event.text) {
          onFinish(event as any);
        }
      },
    });

    return result.toUIMessageStreamResponse();
  }
}
