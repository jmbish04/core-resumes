import { eq } from "drizzle-orm";
import { z } from "zod";

import { scrapeGreenhouseJob } from "@/backend/ai/tools/greenhouse";
import { getDb } from "@/backend/db";
import { jobSnapshots, jobsPostings } from "@/backend/db/schema";

import type { JobAnalysisAgent } from "../index";

const DeepAnalysisSchema = z.object({
  matchScore: z.number().int().min(0).max(100).describe("Overall match score (0-100)"),
  matchRationale: z.string().describe("AI-generated reasoning behind the match score"),
  verdict: z.enum(["High", "Medium", "Low"]).describe("High-level assessment verdict"),
  verdictRationale: z.string().describe("AI-generated reasoning behind the verdict"),
  builderAlignment: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Score assessing alignment with builder/0-to-1 product work"),
  jdTrapDetected: z
    .boolean()
    .describe("Whether the AI detected common JD traps (inflated requirements, bait-and-switch)"),
  jobSummary: z.string().describe("Concise summary of the job posting"),
  extractedSalaryRaw: z.string().nullable().describe("Verbatim salary text extracted"),
  salaryMin: z
    .number()
    .int()
    .nullable()
    .describe("Lower bound of annual salary (no currency symbol)"),
  salaryMax: z
    .number()
    .int()
    .nullable()
    .describe("Upper bound of annual salary (no currency symbol)"),
  salaryCurrency: z.string().nullable().describe("ISO 4217 currency code (e.g. USD)"),
  extractedBenefitsRaw: z.string().nullable().describe("Verbatim benefits text extracted"),
  benefitsMedical: z.string().nullable().describe("Summary of medical/health benefits"),
  benefitsEquity: z.string().nullable().describe("Summary of equity/stock benefits"),
  benefitsRetirement: z.string().nullable().describe("Summary of retirement benefits"),
  benefitsPto: z.string().nullable().describe("Summary of PTO/vacation benefits"),
  benefitsBonus: z.string().nullable().describe("Summary of bonus structure"),
  benefitsOtherJson: z
    .array(z.string())
    .describe("Other benefits not captured by specific columns"),
  historicComparison: z.string().describe("Comparing this role against candidate's career history"),
  historicSalaryAnalysis: z
    .string()
    .describe("Comparing salary against candidate's historic compensation"),
  historicBenefitsAnalysis: z
    .string()
    .describe("Comparing benefits against candidate's historic packages"),
  negotiationStrategy: z.string().describe("Negotiation strategy and leverage points"),
  extractedLocation: z.string().nullable().describe("Location string extracted from job posting"),
  experienceLevel: z
    .string()
    .nullable()
    .describe("Experience level extracted (e.g. 'Senior', '5+ years')"),
});

export async function handleDeepAnalyze(env: Env, agent: JobAnalysisAgent, snapshotId: number) {
  const db = getDb(env);

  const snapshot = await db
    .select()
    .from(jobSnapshots)
    .where(eq(jobSnapshots.id, snapshotId))
    .get();

  if (!snapshot) {
    throw new Error(`Snapshot ${snapshotId} not found`);
  }

  const job = await db.select().from(jobsPostings).where(eq(jobsPostings.id, snapshot.jobId)).get();
  if (!job) {
    throw new Error(`Job for snapshot ${snapshotId} not found`);
  }

  // Scrape job content
  const scraped = await scrapeGreenhouseJob(job.company, job.jobSiteId);

  const messages = [
    {
      role: "system" as const,
      content: `You are an expert career analyst evaluating a job posting for a candidate with a strong 'builder' / 0-to-1 background. 
Extract detailed information about the job, including salary, benefits, requirements, and assess the match. Determine if there are any JD traps. Give an honest assessment.`,
    },
    {
      role: "user" as const,
      content: `Please analyze this job posting:

Title: ${job.jobTitle}
Company: ${job.company}

${scraped.text}`,
    },
  ];

  const { AiProvider } = await import("@/backend/ai/providers");
  const analysisResult = await new AiProvider(env).generateStructuredOutput({
    messages,
    schema: DeepAnalysisSchema,
    schemaName: "DeepJobAnalysis",
    temperature: 0.1,
  });

  return analysisResult;
}
