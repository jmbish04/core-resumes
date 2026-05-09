// src/backend/ai/tasks/recognize-patterns.ts
import { z } from "zod";
import { generateStructuredAnalysis } from "../providers";

export const PatternRecognitionSchema = z.object({
  patterns: z.array(z.object({
    observation: z.string(),
    recommendation: z.string(),
    insight: z.string(),
    mapped_role_bullet_ids: z.array(z.number()),
  }))
});

export async function recognizePatternsTask(env: Env, context: string) {
  return generateStructuredAnalysis(env, {
    schema: PatternRecognitionSchema,
    messages: [
      {
        role: "system",
        content: "You are a Strategic Data Analyst. Find thematic clusters and signals across the job description bullets."
      },
      {
        role: "user",
        content: `Analyze the following scored job bullets to detect underlying patterns and hiring manager priorities: \n${context}`
      }
    ]
  });
}
