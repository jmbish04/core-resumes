import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { eq, and, desc, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/backend/db";
import {
  apiCompanies,
  companies,
  jobsPostings,
  jobSnapshots,
  jobReqSnapshots,
  jobSkillSnapshots,
  jobResponsibilitySnapshots,
  jobCategories,
  jobCategoryMappings,
  jobTags,
  jobTagMappings,
  roles,
  roleBullets,
} from "@/backend/db/schema";
import { scrapeGreenhouseJob } from "@/backend/ai/tools/greenhouse";
import { AiProvider } from "@/backend/ai/providers";
import { kimi_k2_5 } from "@/backend/ai/models/kimi-k2.5";

export const promoteRouter = new OpenAPIHono<{ Bindings: Env }>();

const ErrorResponseSchema = z.object({
  error: z.string(),
});

// ---------------------------------------------------------------------------
// Route: GET /api/pipeline/discovery/dashboard
// ---------------------------------------------------------------------------

promoteRouter.openapi(
  createRoute({
    method: "get",
    path: "/discovery/dashboard",
    summary: "Get Discovery Dashboard state",
    description: "Fetches recommended analyzed jobs, unscored recommended jobs, and recommended companies for the discovery viewport.",
    responses: {
      200: {
        description: "Dashboard state retrieved successfully",
        content: {
          "application/json": {
            schema: z.object({
              recommendedJobs: z.array(z.record(z.string(), z.unknown())),
              unscoredJobs: z.array(z.record(z.string(), z.unknown())),
              discoveryCompanies: z.array(z.record(z.string(), z.unknown())),
            }),
          },
        },
      },
    },
  }),
  (async (c: any) => {
    const db = getDb(c.env);

    // 1. Fetch recommended & analyzed jobs (with their latest snapshots, categories, and tags)
    const analyzedPostings = await db
      .select()
      .from(jobsPostings)
      .where(
        and(
          eq(jobsPostings.isRecommended, true),
          eq(jobsPostings.analysisExecuted, true)
        )
      )
      .orderBy(desc(jobsPostings.dateFirstSeen))
      .limit(100);

    const recommendedJobs: any[] = [];

    for (const job of analyzedPostings) {
      // Find latest snapshot
      const snapshot = await db
        .select()
        .from(jobSnapshots)
        .where(eq(jobSnapshots.jobId, job.id))
        .orderBy(desc(jobSnapshots.snapshotTimestamp))
        .limit(1)
        .get();

      if (snapshot) {
        // Fetch categories
        const cats = await db
          .select({
            name: jobCategories.name,
            aiRationale: jobCategoryMappings.aiRationale,
          })
          .from(jobCategoryMappings)
          .innerJoin(jobCategories, eq(jobCategoryMappings.jobCategoryId, jobCategories.id))
          .where(eq(jobCategoryMappings.jobSnapshotId, snapshot.id));

        // Fetch tags
        const tags = await db
          .select({
            name: jobTags.name,
            aiRationale: jobTagMappings.aiRationale,
          })
          .from(jobTagMappings)
          .innerJoin(jobTags, eq(jobTagMappings.jobTagId, jobTags.id))
          .where(eq(jobTagMappings.jobSnapshotId, snapshot.id));

        // Fetch requirements
        const reqs = await db
          .select()
          .from(jobReqSnapshots)
          .where(eq(jobReqSnapshots.snapshotId, snapshot.id));

        // Fetch skills
        const skills = await db
          .select()
          .from(jobSkillSnapshots)
          .where(eq(jobSkillSnapshots.snapshotId, snapshot.id));

        // Fetch responsibilities
        const resps = await db
          .select()
          .from(jobResponsibilitySnapshots)
          .where(eq(jobResponsibilitySnapshots.snapshotId, snapshot.id));

        recommendedJobs.push({
          ...job,
          snapshot,
          categories: cats,
          tags,
          requirements: reqs,
          skills,
          responsibilities: resps,
        });
      } else {
        recommendedJobs.push(job);
      }
    }

    // 2. Fetch recommended & unscored jobs
    const unscoredJobs = await db
      .select()
      .from(jobsPostings)
      .where(
        and(
          eq(jobsPostings.isRecommended, true),
          eq(jobsPostings.analysisExecuted, false)
        )
      )
      .orderBy(desc(jobsPostings.dateFirstSeen))
      .limit(100);

    // 3. Fetch recommended companies — exclude any already promoted to core `companies` table
    const promotedTokens = await db
      .select({ token: companies.greenhouseToken })
      .from(companies)
      .then((rows) => rows.map((r) => r.token).filter(Boolean) as string[]);

    let discoveryCompaniesQuery = db
      .select()
      .from(apiCompanies)
      .where(eq(apiCompanies.isRecommended, true))
      .orderBy(desc(apiCompanies.timestampAdded))
      .limit(100);

    let discoveryCompanies = await discoveryCompaniesQuery;

    // Filter out already-promoted in application code (notInArray won't work with empty array)
    if (promotedTokens.length > 0) {
      discoveryCompanies = discoveryCompanies.filter(
        (c) => !c.jobBoardToken || !promotedTokens.includes(c.jobBoardToken)
      );
    }

    return c.json({
      recommendedJobs,
      unscoredJobs,
      discoveryCompanies,
    });
  }) as any
);

// ---------------------------------------------------------------------------
// Route: POST /api/pipeline/jobs-postings/:id/analyze
// ---------------------------------------------------------------------------

promoteRouter.openapi(
  createRoute({
    method: "post",
    path: "/jobs-postings/{id}/analyze",
    summary: "Run real-time deep analysis on a recommended job",
    description: "Scrapes Greenhouse and calls kimi-k2.5 to analyze the job posting and populate downstream snapshot details.",
    request: {
      params: z.object({
        id: z.string().describe("The ID of the jobs_posting to analyze"),
      }),
    },
    responses: {
      200: {
        description: "Job deep analysis completed successfully",
        content: {
          "application/json": {
            schema: z.record(z.string(), z.unknown()),
          },
        },
      },
      400: {
        description: "Invalid ID parameter",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
          },
        },
      },
      404: {
        description: "Job not found",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
          },
        },
      },
      500: {
        description: "Analysis failed",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  }),
  (async (c: any) => {
    const db = getDb(c.env);
    const id = parseInt(c.req.param("id"), 10);

    if (isNaN(id)) {
      return c.json({ error: "Invalid ID parameter" }, 400);
    }

    const job = await db
      .select()
      .from(jobsPostings)
      .where(eq(jobsPostings.id, id))
      .get();

    if (!job) {
      return c.json({ error: "Job posting not found" }, 404);
    }

    // Scrape and analyze dynamically — detect ATS system from jobSiteId format
    try {
      let scrapedText: string;

      // Detect ATS system: Greenhouse uses numeric IDs, Ashby uses UUIDs, Lever uses slugs
      const isGreenhouseId = /^\d+$/.test(job.jobSiteId);
      const isAshbyId = /^[a-f0-9-]{20,}$/i.test(job.jobSiteId) || job.jobSiteId.startsWith("as-");

      if (isGreenhouseId) {
        // Greenhouse: boardToken/jobs/numericId
        console.log(`[manual:analyze] Scraping greenhouse job: ${job.company}/${job.jobSiteId}`);
        const scraped = await scrapeGreenhouseJob(job.company, job.jobSiteId);
        scrapedText = scraped.text;
      } else if (isAshbyId) {
        // Ashby: fetch from the public posting API
        console.log(`[manual:analyze] Scraping ashby job: ${job.company}/${job.jobSiteId}`);
        const ashbyRes = await fetch(
          `https://api.ashbyhq.com/posting-api/job-board/${job.company}?includeCompensation=true`,
          { signal: AbortSignal.timeout(10_000) },
        );
        if (!ashbyRes.ok) {
          throw new Error(`Ashby API returned ${ashbyRes.status} for board ${job.company}`);
        }
        const ashbyData = (await ashbyRes.json()) as { jobs?: Array<{ id: string; title: string; descriptionHtml?: string; descriptionPlain?: string; location?: string; compensationTierSummary?: string }> };
        const matchedJob = ashbyData.jobs?.find((j) => j.id === job.jobSiteId || j.title === job.jobTitle);
        if (!matchedJob) {
          throw new Error(`Job ${job.jobSiteId} not found on Ashby board ${job.company}`);
        }
        scrapedText = [
          `Company: ${job.company}`,
          `Job Title: ${matchedJob.title}`,
          `Location: ${matchedJob.location || "Not specified"}`,
          matchedJob.compensationTierSummary ? `Compensation: ${matchedJob.compensationTierSummary}` : "",
          "",
          matchedJob.descriptionPlain || matchedJob.descriptionHtml || "No description available.",
        ].filter(Boolean).join("\n");
      } else {
        // Lever or unknown — try Lever postings API
        console.log(`[manual:analyze] Scraping lever job: ${job.company}/${job.jobSiteId}`);
        const leverRes = await fetch(
          `https://api.lever.co/v0/postings/${job.company}/${job.jobSiteId}`,
          { signal: AbortSignal.timeout(10_000) },
        );
        if (leverRes.ok) {
          const leverJob = (await leverRes.json()) as { text: string; descriptionPlain?: string; categories?: { location?: string; team?: string } };
          scrapedText = [
            `Company: ${job.company}`,
            `Job Title: ${leverJob.text || job.jobTitle}`,
            `Location: ${leverJob.categories?.location || "Not specified"}`,
            `Team: ${leverJob.categories?.team || "Not specified"}`,
            "",
            leverJob.descriptionPlain || "No description available.",
          ].filter(Boolean).join("\n");
        } else {
          // Last resort: use whatever info we have
          scrapedText = [
            `Company: ${job.company}`,
            `Job Title: ${job.jobTitle}`,
            `Location: ${job.location || "Not specified"}`,
            "",
            job.triageReason || "No additional details available.",
          ].filter(Boolean).join("\n");
        }
      }

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

      const userPrompt = `
========================================
JOB_SITE_ID: ${job.jobSiteId}
COMPANY: ${job.company}
TITLE: ${job.jobTitle}
========================================
${scrapedText}
`;

      const aiProvider = new AiProvider(c.env);
      const batchResult = await aiProvider.generateStructuredOutput({
        messages: [
          { role: "system", content: BATCH_ANALYSIS_SYSTEM_PROMPT },
          { role: "user", content: `Here is a job posting to analyze. Please provide a structured analysis matching the schema:\n${userPrompt}` },
        ],
        schema: z.object({
          analysis: z.object({
            matchScore: z.number().int().min(0).max(100),
            matchRationale: z.string(),
            verdict: z.enum(["High", "Medium", "Low"]),
            verdictRationale: z.string(),
            builderAlignment: z.number().int().min(0).max(100),
            jdTrapDetected: z.boolean(),
            jobSummary: z.string(),
            extractedSalaryRaw: z.string().nullable(),
            salaryMin: z.number().int().nullable(),
            salaryMax: z.number().int().nullable(),
            salaryCurrency: z.string().nullable(),
            extractedBenefitsRaw: z.string().nullable(),
            benefitsMedical: z.string().nullable(),
            benefitsEquity: z.string().nullable(),
            benefitsRetirement: z.string().nullable(),
            benefitsPto: z.string().nullable(),
            benefitsBonus: z.string().nullable(),
            benefitsOtherJson: z.array(z.string()),
            historicComparison: z.string(),
            historicSalaryAnalysis: z.string(),
            historicBenefitsAnalysis: z.string(),
            negotiationStrategy: z.string(),
            extractedLocation: z.string().nullable(),
            experienceLevel: z.string().nullable(),
            requirements: z.array(z.object({ requirement: z.string(), matchScore: z.number().int(), matchRationale: z.string() })),
            skills: z.array(z.object({ skill: z.string(), matchScore: z.number().int(), matchRationale: z.string() })),
            responsibilities: z.array(z.object({ responsibility: z.string(), matchScore: z.number().int(), matchRationale: z.string() })),
            categories: z.array(z.object({ name: z.string(), description: z.string(), aiRationale: z.string() })),
            tags: z.array(z.object({ name: z.string(), description: z.string(), aiRationale: z.string() })),
          })
        }),
        schemaName: "SingleJobAnalysis",
        temperature: 0.1,
        max_tokens: 8096,
        model: kimi_k2_5,
      });

      const analysis = batchResult.analysis;
      const sessionUuid = "manual-discovery-analysis";

      // Persist snapshot
      const [snapshot] = await db
        .insert(jobSnapshots)
        .values({
          jobId: job.id,
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

      if (!snapshot) throw new Error("Failed to persist snapshot.");

      // Requirements
      if (analysis.requirements.length > 0) {
        for (const req of analysis.requirements) {
          await db.insert(jobReqSnapshots).values({
            snapshotId: snapshot.id,
            requirement: req.requirement,
            matchScore: req.matchScore,
            matchRationale: req.matchRationale,
          });
        }
      }

      // Skills
      if (analysis.skills.length > 0) {
        for (const skill of analysis.skills) {
          await db.insert(jobSkillSnapshots).values({
            snapshotId: snapshot.id,
            skill: skill.skill,
            matchScore: skill.matchScore,
            matchRationale: skill.matchRationale,
          });
        }
      }

      // Responsibilities
      if (analysis.responsibilities.length > 0) {
        for (const resp of analysis.responsibilities) {
          await db.insert(jobResponsibilitySnapshots).values({
            snapshotId: snapshot.id,
            responsibility: resp.responsibility,
            matchScore: resp.matchScore,
            matchRationale: resp.matchRationale,
          });
        }
      }

      // Categories
      const catsList = [];
      for (const cat of analysis.categories) {
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
        }

        if (existingCat) {
          await db.insert(jobCategoryMappings).values({
            jobCategoryId: existingCat.id,
            jobSnapshotId: snapshot.id,
            aiRationale: cat.aiRationale,
          });
          catsList.push({ name: cat.name, aiRationale: cat.aiRationale });
        }
      }

      // Tags
      const tagsList = [];
      for (const tag of analysis.tags) {
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
        }

        if (existingTag) {
          await db.insert(jobTagMappings).values({
            jobTagId: existingTag.id,
            jobSnapshotId: snapshot.id,
            aiRationale: tag.aiRationale,
          });
          tagsList.push({ name: tag.name, aiRationale: tag.aiRationale });
        }
      }

      // Update parent job
      await db
        .update(jobsPostings)
        .set({ analysisExecuted: true })
        .where(eq(jobsPostings.id, job.id));

      const updatedJob = {
        ...job,
        analysisExecuted: true,
        snapshot,
        categories: catsList,
        tags: tagsList,
        requirements: analysis.requirements,
        skills: analysis.skills,
        responsibilities: analysis.responsibilities,
      };

      return c.json({
        status: "analyzed",
        job: updatedJob,
      });
    } catch (err) {
      console.error("[manual:analyze] Deep analysis failed:", err);
      return c.json({ error: `Deep analysis failed: ${String(err)}` }, 500);
    }
  }) as any
);

// ---------------------------------------------------------------------------
// Route: POST /api/pipeline/api-companies/:id/promote-company
// ---------------------------------------------------------------------------

promoteRouter.openapi(
  createRoute({
    method: "post",
    path: "/api-companies/{id}/promote-company",
    summary: "Promote API Company to core Company tracker",
    description: "Copies an api_companies discovery row to the main active companies table.",
    request: {
      params: z.object({
        id: z.string().describe("The ID of the api_company to promote"),
      }),
    },
    responses: {
      200: {
        description: "Company promoted successfully",
        content: {
          "application/json": {
            schema: z.object({
              status: z.string(),
              company: z.record(z.string(), z.unknown()),
            }),
          },
        },
      },
      400: {
        description: "Invalid ID parameter",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
          },
        },
      },
      404: {
        description: "Company not found",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  }),
  (async (c: any) => {
    const db = getDb(c.env);
    const id = parseInt(c.req.param("id"), 10);

    if (isNaN(id)) {
      return c.json({ error: "Invalid ID parameter" }, 400);
    }

    // 1. Look up the API Company
    const apiCompany = await db
      .select()
      .from(apiCompanies)
      .where(eq(apiCompanies.id, id))
      .get();

    if (!apiCompany) {
      return c.json({ error: "Company not found in api_companies" }, 404);
    }

    // 2. Check if already exists in core companies table
    let coreCompany = await db
      .select()
      .from(companies)
      .where(
        apiCompany.jobBoardToken
          ? eq(companies.greenhouseToken, apiCompany.jobBoardToken as string)
          : eq(companies.name, apiCompany.name || "")
      )
      .get();

    if (coreCompany) {
      return c.json({
        status: "already_promoted",
        company: coreCompany,
      });
    }

    // 3. Create the core company row
    const newCompanyId = crypto.randomUUID();
    const now = new Date();

    const [inserted] = await db
      .insert(companies)
      .values({
        id: newCompanyId,
        name: apiCompany.name || "Unknown Company",
        description: apiCompany.recommendationReason || "Discovered via Greenhouse board scanner.",
        greenhouseToken: apiCompany.jobBoardToken,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return c.json({
      status: "promoted",
      company: inserted,
    });
  }) as any
);

// ---------------------------------------------------------------------------
// Route: POST /api/pipeline/jobs-postings/:id/promote-role
// ---------------------------------------------------------------------------

promoteRouter.openapi(
  createRoute({
    method: "post",
    path: "/jobs-postings/{id}/promote-role",
    summary: "Promote Job Posting to active Role application",
    description: "Promotes a wide-net Greenhouse job posting to active pipeline role. Requires the job to have been analyzed.",
    request: {
      params: z.object({
        id: z.string().describe("The ID of the jobs_posting to promote"),
      }),
    },
    responses: {
      200: {
        description: "Job posting promoted to active role application successfully",
        content: {
          "application/json": {
            schema: z.object({
              status: z.string(),
              role: z.record(z.string(), z.unknown()),
            }),
          },
        },
      },
      400: {
        description: "Bad Request — Job has not been analyzed yet or invalid ID",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
          },
        },
      },
      404: {
        description: "Job posting not found",
        content: {
          "application/json": {
            schema: ErrorResponseSchema,
          },
        },
      },
    },
  }),
  (async (c: any) => {
    const db = getDb(c.env);
    const id = parseInt(c.req.param("id"), 10);

    if (isNaN(id)) {
      return c.json({ error: "Invalid ID parameter" }, 400);
    }

    // 1. Look up the Job Posting
    const jobPosting = await db
      .select()
      .from(jobsPostings)
      .where(eq(jobsPostings.id, id))
      .get();

    if (!jobPosting) {
      return c.json({ error: "Job posting not found" }, 404);
    }

    // 2. Get latest analysis snapshot
    const latestSnapshot = await db
      .select()
      .from(jobSnapshots)
      .where(eq(jobSnapshots.jobId, jobPosting.id))
      .orderBy(desc(jobSnapshots.snapshotTimestamp))
      .limit(1)
      .get();

    if (!latestSnapshot) {
      return c.json(
        { error: "Job posting has not been analyzed yet. Please run deep analysis before promoting." },
        400
      );
    }

    // 3. Check if already exists in core roles table
    const existingRole = await db
      .select()
      .from(roles)
      .where(eq(roles.sourceSnapshotId, latestSnapshot.id))
      .get();

    if (existingRole) {
      return c.json({
        status: "already_promoted",
        role: existingRole,
      });
    }

    // 4. Find or promote parent company automatically
    let companyUuid: string | null = null;
    let parentCompany = await db
      .select()
      .from(companies)
      .where(eq(companies.greenhouseToken, jobPosting.company))
      .get();

    if (parentCompany) {
      companyUuid = parentCompany.id;
    } else {
      // Auto-promote API Company if it exists
      const apiComp = await db
        .select()
        .from(apiCompanies)
        .where(eq(apiCompanies.jobBoardToken, jobPosting.company))
        .get();

      const newCompanyId = crypto.randomUUID();
      const now = new Date();

      const [newComp] = await db
        .insert(companies)
        .values({
          id: newCompanyId,
          name: apiComp?.name || jobPosting.company,
          description: apiComp?.recommendationReason || "Discovered via Greenhouse board scanner.",
          greenhouseToken: jobPosting.company,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      companyUuid = newComp.id;
    }

    // 5. Create active role application
    const newRoleId = crypto.randomUUID();
    const now = new Date();

    const [insertedRole] = await db
      .insert(roles)
      .values({
        id: newRoleId,
        companyId: companyUuid,
        companyName: parentCompany?.name || jobPosting.company,
        jobTitle: jobPosting.jobTitle,
        jobUrl: `https://job-boards.greenhouse.io/${jobPosting.company}/jobs/${jobPosting.jobSiteId}`,
        salaryMin: latestSnapshot.salaryMin,
        salaryMax: latestSnapshot.salaryMax,
        salaryCurrency: latestSnapshot.salaryCurrency || "USD",
        aboutCompany: latestSnapshot.jobSummary,
        status: "preparing",
        source: "greenhouse_scan",
        sourceSnapshotId: latestSnapshot.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // 6. Copy snapshot details into role_bullets
    // requirements -> REQUIRED_QUALIFICATION
    const requirements = await db
      .select()
      .from(jobReqSnapshots)
      .where(eq(jobReqSnapshots.snapshotId, latestSnapshot.id));

    if (requirements.length > 0) {
      const bulletStmts = requirements.map((req, index) =>
        db.insert(roleBullets).values({
          roleId: newRoleId,
          type: "REQUIRED_QUALIFICATION",
          content: req.requirement,
          sortOrder: index,
          createdAt: now,
          updatedAt: now,
        })
      );
      // Insert in chunks of 50 to avoid D1 limits
      const CHUNK_LIMIT = 50;
      for (let c = 0; c < bulletStmts.length; c += CHUNK_LIMIT) {
        const chunkStmts = bulletStmts.slice(c, c + CHUNK_LIMIT);
        await db.batch(chunkStmts as [any, ...any[]]);
      }
    }

    // skills -> REQUIRED_SKILL / PREFERRED_SKILL
    const skills = await db
      .select()
      .from(jobSkillSnapshots)
      .where(eq(jobSkillSnapshots.snapshotId, latestSnapshot.id));

    if (skills.length > 0) {
      const bulletStmts = skills.map((skill, index) =>
        db.insert(roleBullets).values({
          roleId: newRoleId,
          type: "REQUIRED_SKILL",
          content: skill.skill,
          sortOrder: index,
          createdAt: now,
          updatedAt: now,
        })
      );
      const CHUNK_LIMIT = 50;
      for (let c = 0; c < bulletStmts.length; c += CHUNK_LIMIT) {
        const chunkStmts = bulletStmts.slice(c, c + CHUNK_LIMIT);
        await db.batch(chunkStmts as [any, ...any[]]);
      }
    }

    // responsibilities -> KEY_RESPONSIBILITY
    const responsibilities = await db
      .select()
      .from(jobResponsibilitySnapshots)
      .where(eq(jobResponsibilitySnapshots.snapshotId, latestSnapshot.id));

    if (responsibilities.length > 0) {
      const bulletStmts = responsibilities.map((resp, index) =>
        db.insert(roleBullets).values({
          roleId: newRoleId,
          type: "KEY_RESPONSIBILITY",
          content: resp.responsibility,
          sortOrder: index,
          createdAt: now,
          updatedAt: now,
        })
      );
      const CHUNK_LIMIT = 50;
      for (let c = 0; c < bulletStmts.length; c += CHUNK_LIMIT) {
        const chunkStmts = bulletStmts.slice(c, c + CHUNK_LIMIT);
        await db.batch(chunkStmts as [any, ...any[]]);
      }
    }

    return c.json({
      status: "promoted",
      role: insertedRole,
    });
  }) as any
);

// ---------------------------------------------------------------------------
// Route: POST /api/pipeline/discovery/scan
// ---------------------------------------------------------------------------

promoteRouter.openapi(
  createRoute({
    method: "post",
    path: "/discovery/scan",
    summary: "Trigger manual discovery scorer + analyzer",
    description: "Runs the discovery scorer (keyword/location heuristic) and then the AI deep analyzer on any newly recommended jobs.",
    responses: {
      200: {
        description: "Scan completed",
        content: {
          "application/json": {
            schema: z.object({
              scorer: z.record(z.string(), z.unknown()),
              analyzer: z.record(z.string(), z.unknown()),
            }),
          },
        },
      },
    },
  }),
  (async (c: any) => {
    const env = c.env;

    // Run discovery scorer
    const { runDiscoveryScorer } = await import(
      "@/backend/cron/discovery-scorer"
    );
    const scorerResult = await runDiscoveryScorer(env);

    // Run discovery analyzer
    const { runDiscoveryAnalyzer } = await import(
      "@/backend/cron/discovery-analyzer"
    );
    const analyzerResult = await runDiscoveryAnalyzer(env);

    return c.json({
      scorer: scorerResult,
      analyzer: analyzerResult,
    });
  }) as any
);
