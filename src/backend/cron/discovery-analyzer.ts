/**
 * @file Discovery analyzer cron handler.
 *
 * Runs on the 4-hour cron alongside the scorer. Selects jobs that are marked
 * `is_recommended = true` and `analysis_executed = false` (max 100).
 * If there are more than 100, runs a prioritization prompt to select the top 100.
 * Then runs a deep batch analysis using kimi-k2.5 in groups of 5-10 jobs,
 * populating all downstream taxonomy and snapshot tables.
 */

import { eq, and, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/backend/db";
import {
  jobsPostings,
  globalConfig,
  jobSnapshots,
  jobReqSnapshots,
  jobSkillSnapshots,
  jobResponsibilitySnapshots,
  jobCategories,
  jobCategoryMappings,
  jobTags,
  jobTagMappings,
  sessionRuns,
} from "@/backend/db/schema";
import { scrapeGreenhouseJob } from "@/backend/ai/tools/greenhouse";
import { AiProvider } from "@/backend/ai/providers";
import { modelRegistry } from "@/backend/ai/models";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const PrioritizationSchema = z.object({
  rankedJobSiteIds: z.array(z.string()).describe("A list of job_site_id strings ranked in order of match quality (highest first), up to 100."),
});

const BatchJobAnalysisSchema = z.object({
  analyses: z.array(
    z.object({
      jobSiteId: z.string().describe("The unique job_site_id identifying the job being analyzed"),
      matchScore: z.number().int().min(0).max(100).describe("Overall match score (0-100)"),
      matchRationale: z.string().describe("AI-generated reasoning behind the match score"),
      verdict: z.enum(["High", "Medium", "Low"]).describe("High-level assessment verdict"),
      verdictRationale: z.string().describe("AI-generated reasoning behind the verdict"),
      builderAlignment: z.number().int().min(0).max(100).describe("Score assessing alignment with builder/0-to-1 product work"),
      jdTrapDetected: z.boolean().describe("Whether the AI detected common JD traps (inflated requirements, bait-and-switch)"),
      jobSummary: z.string().describe("Concise summary of the job posting"),
      extractedSalaryRaw: z.string().nullable().describe("Verbatim salary text extracted"),
      salaryMin: z.number().int().nullable().describe("Lower bound of annual salary (no currency symbol)"),
      salaryMax: z.number().int().nullable().describe("Upper bound of annual salary (no currency symbol)"),
      salaryCurrency: z.string().nullable().describe("ISO 4217 currency code (e.g. USD)"),
      extractedBenefitsRaw: z.string().nullable().describe("Verbatim benefits text extracted"),
      benefitsMedical: z.string().nullable().describe("Summary of medical/health benefits"),
      benefitsEquity: z.string().nullable().describe("Summary of equity/stock benefits"),
      benefitsRetirement: z.string().nullable().describe("Summary of retirement benefits"),
      benefitsPto: z.string().nullable().describe("Summary of PTO/vacation benefits"),
      benefitsBonus: z.string().nullable().describe("Summary of bonus structure"),
      benefitsOtherJson: z.array(z.string()).describe("Other benefits not captured by specific columns"),
      historicComparison: z.string().describe("Comparing this role against candidate's career history"),
      historicSalaryAnalysis: z.string().describe("Comparing salary against candidate's historic compensation"),
      historicBenefitsAnalysis: z.string().describe("Comparing benefits against candidate's historic packages"),
      negotiationStrategy: z.string().describe("Negotiation strategy and leverage points"),
      extractedLocation: z.string().nullable().describe("Location string extracted from job posting"),
      experienceLevel: z.string().nullable().describe("Experience level extracted (e.g. 'Senior', '5+ years')"),
      requirements: z.array(
        z.object({
          requirement: z.string().describe("Verbatim requirement text extracted from the job posting"),
          matchScore: z.number().int().min(1).max(10).describe("AI match score (1-10) assessing how well the candidate meets this requirement"),
          matchRationale: z.string().describe("AI-generated explanation for the match score"),
        })
      ).describe("Normalized requirements extracted from the job posting, each with a match score (1-10)"),
      skills: z.array(
        z.object({
          skill: z.string().describe("Skill text extracted from the job posting"),
          matchScore: z.number().int().min(1).max(10).describe("AI match score (1-10)"),
          matchRationale: z.string().describe("AI-generated explanation"),
        })
      ).describe("Normalized preferred skills from the job posting, each with a match score (1-10)"),
      responsibilities: z.array(
        z.object({
          responsibility: z.string().describe("Responsibility text extracted from the job posting"),
          matchScore: z.number().int().min(1).max(10).describe("AI match score (1-10)"),
          matchRationale: z.string().describe("AI-generated explanation"),
        })
      ).describe("Normalized responsibilities from the job posting, each with a match score (1-10)"),
      categories: z.array(
        z.object({
          name: z.string().describe("Category name (e.g. Engineering, Sales, Legal Ops, Product Management, DevOps, Infrastructure)"),
          description: z.string().describe("Category description"),
          aiRationale: z.string().describe("AI-generated reasoning for assigning this category"),
        })
      ).describe("Taxonomy categories AI assigned to this job"),
      tags: z.array(
        z.object({
          name: z.string().describe("Freeform tag for tracking job attributes (e.g. Remote, AI-Heavy, Visa Sponsor, Startup, High-Growth, Legacy-Codebase, Enterprise)"),
          description: z.string().describe("Tag description"),
          aiRationale: z.string().describe("AI-generated reasoning for assigning this tag"),
        })
      ).describe("Freeform tags AI assigned to this job"),
    })
  ),
});

type BatchAnalysis = z.infer<typeof BatchJobAnalysisSchema>;

// ---------------------------------------------------------------------------
// Prompt Builders (Template Literals)
// ---------------------------------------------------------------------------

function buildPrioritizationUserPrompt(jobs: Array<{ jobSiteId: string; jobTitle: string; company: string; location: string | null }>): string {
  const jobListings = jobs
    .map(
      (job) =>
        `- Job Site ID: ${job.jobSiteId} | Company: ${job.company} | Title: ${job.jobTitle} | Location: ${job.location || "unknown"}`
    )
    .join("\n");

  return `Here are the active, recommended job postings that need deep analysis. Please rank them by overall fit for Justin Bishop:

<JOBS_TO_RANK>
${jobListings}
</JOBS_TO_RANK>
`;
}

function buildBatchAnalysisUserPrompt(jobs: Array<{ jobSiteId: string; jobTitle: string; company: string; text: string }>): string {
  const jobContents = jobs
    .map(
      (job) => `
========================================
JOB_SITE_ID: ${job.jobSiteId}
COMPANY: ${job.company}
TITLE: ${job.jobTitle}
========================================
${job.text}
`
    )
    .join("\n\n");

  return `Here are ${jobs.length} job postings to analyze in this batch. Please evaluate each one and provide structured analyses matching the output schema:

<JOBS_TO_ANALYZE>
${jobContents}
</JOBS_TO_ANALYZE>
`;
}

const PRIORITIZATION_SYSTEM_PROMPT = `You are an expert career pivot advisor and recruiter ranking job postings for a candidate named Justin Bishop.

Candidate Profile Summary:
- 12+ years at Google as a "0-to-1" intrapreneur
- Focuses on software engineering, platform-critical tools, legal operations, automation, and AI tooling
- Bridges legal, engineering, and business domains — a highly pragmatic builder
- Enjoys creating shadow ecosystems of custom tools (e.g., custom apps that users voluntarily adopted over official ones, MCP servers, AI agents)

<INSTRUCTIONS>
1. Evaluate the provided job postings.
2. Rank them based on alignment with Justin's profile (highest alignment first).
3. Highly prioritize roles that are related to Legal Operations tech, low-code/no-code platforms, workflow automation, custom AI integrations, MCP servers, or full-stack software development.
4. Output a JSON object containing the ranked list of jobSiteIds, up to 100.
</INSTRUCTIONS>`;

const BATCH_ANALYSIS_SYSTEM_PROMPT = `You are an expert career analyst and executive coach performing deep hireability assessments for a candidate named Justin Bishop.

Candidate Context:
- 12+ years at Google as a "0-to-1" intrapreneur
- Focuses on software engineering, workflow automation, low-code/no-code platforms, custom AI tools (MCP servers, AI agents), and legal operations technology
- Ships platform-critical tools (saving $16M annually, boosting adoption 300%)
- Bridges Legal, Engineering, and Business domains — the "Translator"
- No formal Law Degree (JD), which keeps him ROI-focused and highly pragmatic
- Built a "Shadow Ecosystem" of custom apps that users voluntarily adopted over official tools
- Reduced time-to-matter creation by 70%

<IMPLICIT_SKILL_MAPPING>
Infer hard skills from contextual phrasing:
- "high traffic" / "large scale" → scalability, high availability
- "multiple services" / "service-oriented" → distributed systems, API design
- "complex codebase" / "legacy systems" → refactoring, code archaeology
- "compliance" / "regulated environment" → audit trails, security, governance
</IMPLICIT_SKILL_MAPPING>

For each job posting:
1. Extract detailed information: salary range, benefits, location, experience level.
2. Map candidate alignment across the job requirements, preferred skills, and responsibilities. Score each from 1 to 10.
3. Compute an overall match score (0-100) and holistic verdict ("High", "Medium", "Low").
4. Assign 1-3 categories (e.g., Engineering, Legal Ops, DevOps) and 1-5 tags (e.g., Remote, AI-Heavy, Startup).
5. Identify any "JD Traps" (inflated requirements, bait-and-switch).
6. Provide a historic comparison and negotiation strategy.
`;

// ---------------------------------------------------------------------------
// Run logic
// ---------------------------------------------------------------------------

export async function runDiscoveryAnalyzer(env: Env): Promise<{ analyzed: number; failed: number }> {
  const db = getDb(env);
  const sessionUuid = crypto.randomUUID();

  // 1. Fetch recommended, unprocessed jobs
  const unprocessedJobs = await db
    .select({
      id: jobsPostings.id,
      jobSiteId: jobsPostings.jobSiteId,
      jobTitle: jobsPostings.jobTitle,
      company: jobsPostings.company,
      location: jobsPostings.location,
    })
    .from(jobsPostings)
    .where(
      and(
        eq(jobsPostings.isRecommended, true),
        eq(jobsPostings.analysisExecuted, false)
      )
    );

  if (unprocessedJobs.length === 0) {
    console.log("[cron:discovery-analyzer] No recommended, unprocessed jobs to analyze.");
    return { analyzed: 0, failed: 0 };
  }

  console.log(`[cron:discovery-analyzer] Discovered ${unprocessedJobs.length} unprocessed recommended jobs.`);

  // 2. Prioritize if > 100
  let jobsToProcess = unprocessedJobs;
  if (unprocessedJobs.length > 100) {
    console.log("[cron:discovery-analyzer] Unprocessed recommended jobs exceed limit of 100. Running prioritization prompt.");
    try {
      const aiProvider = new AiProvider(env);
      const ranking = await aiProvider.generateStructuredOutput({
        messages: [
          { role: "system", content: PRIORITIZATION_SYSTEM_PROMPT },
          { role: "user", content: buildPrioritizationUserPrompt(unprocessedJobs) },
        ],
        schema: PrioritizationSchema,
        schemaName: "JobPrioritization",
        temperature: 0.1,
        model: modelRegistry.analyze,
      });

      const rankedIds = ranking.rankedJobSiteIds;
      const sortedJobs = [...unprocessedJobs].sort((a, b) => {
        const indexA = rankedIds.indexOf(a.jobSiteId);
        const indexB = rankedIds.indexOf(b.jobSiteId);
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      });

      jobsToProcess = sortedJobs.slice(0, 100);
      console.log(`[cron:discovery-analyzer] Prioritization completed. Selected top ${jobsToProcess.length} jobs.`);
    } catch (err) {
      console.error("[cron:discovery-analyzer] Prioritization failed, falling back to first 100 jobs:", err);
      jobsToProcess = unprocessedJobs.slice(0, 100);
    }
  }

  // 3. Batch Scrape & Analyze (groups of 5)
  const BATCH_SIZE = 5;
  let analyzedCount = 0;
  let failedCount = 0;
  let categoriesCreated = 0;
  let tagsCreated = 0;

  for (let i = 0; i < jobsToProcess.length; i += BATCH_SIZE) {
    const chunk = jobsToProcess.slice(i, i + BATCH_SIZE);
    console.log(`[cron:discovery-analyzer] Scraping and analyzing batch ${i / BATCH_SIZE + 1} (${chunk.length} jobs)...`);

    // Scrape all jobs in the chunk
    const scrapedJobs: Array<{ jobSiteId: string; jobTitle: string; company: string; text: string }> = [];
    for (const job of chunk) {
      try {
        const scraped = await scrapeGreenhouseJob(job.company, job.jobSiteId);
        scrapedJobs.push({
          jobSiteId: job.jobSiteId,
          jobTitle: job.jobTitle,
          company: job.company,
          text: scraped.text,
        });
      } catch (err) {
        console.error(`[cron:discovery-analyzer] Scraping failed for ${job.company}/${job.jobSiteId}:`, err);
        failedCount++;
      }
    }

    if (scrapedJobs.length === 0) continue;

    // Run batch deep analysis
    try {
      const aiProvider = new AiProvider(env);
      const batchResult = (await aiProvider.generateStructuredOutput({
        messages: [
          { role: "system", content: BATCH_ANALYSIS_SYSTEM_PROMPT },
          { role: "user", content: buildBatchAnalysisUserPrompt(scrapedJobs) },
        ],
        schema: BatchJobAnalysisSchema,
        schemaName: "BatchJobAnalysis",
        temperature: 0.1,
        max_tokens: 8096,
        model: modelRegistry.analyze,
      })) as BatchAnalysis;

      // 4. Persist to downstream tables
      for (const analysis of batchResult.analyses) {
        const parentJob = chunk.find((j) => j.jobSiteId === analysis.jobSiteId);
        if (!parentJob) continue;

        try {
          // A. Insert snapshot
          const [snapshot] = await db
            .insert(jobSnapshots)
            .values({
              jobId: parentJob.id,
              sessionUuid,
              rawAssessmentJson: analysis,
              matchScore: analysis.matchScore,
              matchRationale: analysis.matchRationale,
              verdict: analysis.verdict,
              verdictRationale: analysis.verdictRationale,
              builderAlignment: analysis.builderAlignment,
              jdTrapDetected: analysis.jdTrapDetected,
              jobSummary: analysis.jobSummary,
              extractedSalaryRaw: analysis.extractedSalaryRaw,
              salaryMin: analysis.salaryMin,
              salaryMax: analysis.salaryMax,
              salaryCurrency: analysis.salaryCurrency,
              extractedBenefitsRaw: analysis.extractedBenefitsRaw,
              benefitsMedical: analysis.benefitsMedical,
              benefitsEquity: analysis.benefitsEquity,
              benefitsRetirement: analysis.benefitsRetirement,
              benefitsPto: analysis.benefitsPto,
              benefitsBonus: analysis.benefitsBonus,
              benefitsOtherJson: analysis.benefitsOtherJson,
              historicComparison: analysis.historicComparison,
              historicSalaryAnalysis: analysis.historicSalaryAnalysis,
              historicBenefitsAnalysis: analysis.historicBenefitsAnalysis,
              negotiationStrategy: analysis.negotiationStrategy,
              extractedLocation: analysis.extractedLocation,
              experienceLevel: analysis.experienceLevel,
            })
            .returning();

          if (!snapshot) throw new Error("Failed to insert snapshot.");

          // B. Insert requirements
          if (analysis.requirements.length > 0) {
            const reqStmts = analysis.requirements.map((r) =>
              db.insert(jobReqSnapshots).values({
                snapshotId: snapshot.id,
                requirement: r.requirement,
                matchScore: r.matchScore,
                matchRationale: r.matchRationale,
              })
            );
            // D1 chunked inserts (limit 50 per batch)
            const CHUNK_LIMIT = 20;
            for (let c = 0; c < reqStmts.length; c += CHUNK_LIMIT) {
              const chunkStmts = reqStmts.slice(c, c + CHUNK_LIMIT);
              await db.batch(chunkStmts as [any, ...any[]]);
            }
          }

          // C. Insert preferred skills
          if (analysis.skills.length > 0) {
            const skillStmts = analysis.skills.map((s) =>
              db.insert(jobSkillSnapshots).values({
                snapshotId: snapshot.id,
                skill: s.skill,
                matchScore: s.matchScore,
                matchRationale: s.matchRationale,
              })
            );
            const CHUNK_LIMIT = 20;
            for (let c = 0; c < skillStmts.length; c += CHUNK_LIMIT) {
              const chunkStmts = skillStmts.slice(c, c + CHUNK_LIMIT);
              await db.batch(chunkStmts as [any, ...any[]]);
            }
          }

          // D. Insert key responsibilities
          if (analysis.responsibilities.length > 0) {
            const respStmts = analysis.responsibilities.map((r) =>
              db.insert(jobResponsibilitySnapshots).values({
                snapshotId: snapshot.id,
                responsibility: r.responsibility,
                matchScore: r.matchScore,
                matchRationale: r.matchRationale,
              })
            );
            const CHUNK_LIMIT = 20;
            for (let c = 0; c < respStmts.length; c += CHUNK_LIMIT) {
              const chunkStmts = respStmts.slice(c, c + CHUNK_LIMIT);
              await db.batch(chunkStmts as [any, ...any[]]);
            }
          }

          // E. Taxonomy - Categories & mappings
          for (const cat of analysis.categories) {
            // Find or dynamically create category
            let [existingCat] = await db
              .select({ id: jobCategories.id })
              .from(jobCategories)
              .where(eq(jobCategories.name, cat.name))
              .limit(1);

            if (!existingCat) {
              [existingCat] = await db
                .insert(jobCategories)
                .values({
                  name: cat.name,
                  description: cat.description,
                  isActive: true,
                })
                .returning();
              categoriesCreated++;
            }

            if (existingCat) {
              await db.insert(jobCategoryMappings).values({
                jobCategoryId: existingCat.id,
                jobSnapshotId: snapshot.id,
                aiRationale: cat.aiRationale,
              });
            }
          }

          // F. Taxonomy - Tags & mappings
          for (const tag of analysis.tags) {
            // Find or dynamically create tag
            let [existingTag] = await db
              .select({ id: jobTags.id })
              .from(jobTags)
              .where(eq(jobTags.name, tag.name))
              .limit(1);

            if (!existingTag) {
              [existingTag] = await db
                .insert(jobTags)
                .values({
                  name: tag.name,
                  description: tag.description,
                  isActive: true,
                })
                .returning();
              tagsCreated++;
            }

            if (existingTag) {
              await db.insert(jobTagMappings).values({
                jobTagId: existingTag.id,
                jobSnapshotId: snapshot.id,
                aiRationale: tag.aiRationale,
              });
            }
          }

          // G. Mark job posting as analyzed
          await db
            .update(jobsPostings)
            .set({ analysisExecuted: true })
            .where(eq(jobsPostings.id, parentJob.id));

          analyzedCount++;
          console.log(`[cron:discovery-analyzer] Successfully deep analyzed job site id: ${analysis.jobSiteId}`);
        } catch (err) {
          console.error(`[cron:discovery-analyzer] Downstream persist failed for ${analysis.jobSiteId}:`, err);
          failedCount++;
        }
      }
    } catch (err) {
      console.error("[cron:discovery-analyzer] Batch analysis failed:", err);
      failedCount += chunk.length;
    }
  }

  // 5. Log the session run
  try {
    await db.insert(sessionRuns).values({
      sessionUuid,
      totalScraped: 0,
      totalTriaged: 0,
      totalAnalyzed: analyzedCount,
      totalFailed: failedCount,
      totalCost: "0.0", // Auto-computed or placeholder
      taxonomyCategories: categoriesCreated,
      taxonomyTags: tagsCreated,
    });
  } catch (err) {
    console.error("[cron:discovery-analyzer] Failed to insert session run log:", err);
  }

  console.log(`[cron:discovery-analyzer] Complete! Analyzed: ${analyzedCount}, Failed: ${failedCount}.`);
  return { analyzed: analyzedCount, failed: failedCount };
}
