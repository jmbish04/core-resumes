import { inArray } from "drizzle-orm";
import { z } from "zod";

/**
 * @fileoverview Triage service for evaluating discovered jobs.
 */
import { getDb } from "@/backend/db";
import { globalConfig } from "@/backend/db/schema";

const TriageDecisionSchema = z.object({
  decisions: z.array(
    z.object({
      job_site_id: z.union([z.string(), z.number()]),
      decision: z.enum(["Include", "Exclude"]),
      reasoning: z.string(),
    }),
  ),
});

export async function triageBatch(env: Env, jobs: any[]) {
  if (!jobs.length) return [];

  const content = jobs
    .map((j) => `ID: ${j.id}\nTitle: ${j.title}\nLocation: ${j.location?.name || "Unknown"}`)
    .join("\n---\n");

  const db = getDb(env);
  const configs = await db
    .select()
    .from(globalConfig)
    .where(inArray(globalConfig.key, ["pipeline_a_rules", "pipeline_b_rules"]));

  const pipelineA = configs.find((c) => c.key === "pipeline_a_rules")?.value as any;
  const pipelineB = configs.find((c) => c.key === "pipeline_b_rules")?.value as any;

  const keywords =
    pipelineA?.keywords?.join(", ") || "software engineer, frontend, backend, fullstack";
  const _minSalary = pipelineB?.minSalary || 100000;
  const locations = pipelineB?.locations?.join(", ") || "Remote";

  const systemPrompt = `Evaluate these jobs. Decide 'Include' or 'Exclude' based on the following rules:
1. Role Relevance (Pipeline A): The job title must be relevant to the following keywords: ${keywords}.
2. Thresholds (Pipeline B): If possible to determine, the job should align with locations: ${locations}.
Exclude jobs that are clearly outside the software engineering domain. If salary or location are unknown, assume Include if the role matches the keywords.`;

  const { AiProvider } = await import("@/backend/ai/providers/index");
  const result = await new AiProvider(env).generateStructuredOutput({
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      { role: "user", content },
    ],
    schema: TriageDecisionSchema,
    schemaName: "TriageDecisions",
  });

  return result.decisions;
}
