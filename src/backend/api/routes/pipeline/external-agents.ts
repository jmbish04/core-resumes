import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/backend/db";
import { globalConfig, companies, roles, jobsPostings } from "@/backend/db/schema";
import crypto from "crypto";

export const externalAgentsRouter = new OpenAPIHono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// GET /external-agents/prompt
// ---------------------------------------------------------------------------
externalAgentsRouter.openapi(
  createRoute({
    method: "get",
    path: "/external-agents/prompt",
    summary: "Get scraping prompt for external agents",
    description:
      "Generates a Markdown prompt containing target roles, locations, tracked companies, and past applied roles.",
    responses: {
      200: {
        description: "Markdown prompt for external agents",
        content: {
          "text/plain": {
            schema: z.string(),
          },
        },
      },
    },
  }),
  async (c) => {
    const db = getDb(c.env);

    // 1. Fetch Applicant Profile
    const [profileRow] = await db
      .select()
      .from(globalConfig)
      .where(eq(globalConfig.key, "applicant_profile"))
      .limit(1);
    
    let applicantProfile: any = { target_roles: [], locations: [], hubs: [] };
    if (profileRow?.value) {
      applicantProfile = profileRow.value;
    }

    // 2. Fetch Promoted Companies
    const promotedCompanies = await db
      .select()
      .from(companies)
      .limit(100); // Usually a reasonable limit for prompt context

    // 3. Fetch Past Roles (to avoid duplicates)
    // We get distinct job URLs from recent roles
    const recentRoles = await db
      .select({ companyName: roles.companyName, jobTitle: roles.jobTitle, jobUrl: roles.jobUrl })
      .from(roles)
      .orderBy(desc(roles.createdAt))
      .limit(200);

    // Build the Markdown Document
    let md = `# Job Scraping Agent Instructions\n\n`;
    md += `You are an automated job scraping agent working on my behalf. Your goal is to find relevant roles based on my background and target criteria, and post them to my queue for review.\n\n`;

    md += `## Target Criteria\n`;
    md += `- **Target Roles**: ${(applicantProfile.target_roles || []).join(", ")}\n`;
    md += `- **Target Locations**: ${(applicantProfile.locations || []).join(", ")}\n`;
    md += `- **Major Hubs**: ${(applicantProfile.hubs || []).join(", ")}\n\n`;

    md += `## Tracked & Promoted Companies\n`;
    md += `Pay special attention to these companies, as I have explicitly tracked them:\n`;
    if (promotedCompanies.length > 0) {
      promotedCompanies.forEach((company) => {
        md += `- **${company.name}**\n`;
      });
    } else {
      md += `- (No companies tracked yet)\n`;
    }
    md += `\n`;

    md += `## Exclusions (Already Processed/Applied)\n`;
    md += `DO NOT scrape or submit jobs that match the following URLs, as they have already been processed:\n`;
    const urls = recentRoles.map((r) => r.jobUrl).filter(Boolean);
    if (urls.length > 0) {
      urls.forEach((url) => {
        md += `- ${url}\n`;
      });
    } else {
      md += `- (No roles processed yet)\n`;
    }
    md += `\n`;

    md += `## Submission Instructions\n`;
    md += `When you find matching jobs, submit them via POST to \`/api/pipeline/external-agents/jobs\` with a JSON array of objects containing:\n`;
    md += `- \`jobTitle\` (string)\n`;
    md += `- \`company\` (string)\n`;
    md += `- \`location\` (string, optional)\n`;
    md += `- \`jobUrl\` (string, optional)\n`;
    md += `- \`jobSiteId\` (string, optional - if omitted, a hash of the URL or company+title will be generated)\n`;

    return c.text(md);
  },
);

// ---------------------------------------------------------------------------
// POST /external-agents/jobs
// ---------------------------------------------------------------------------
const scrapedJobSchema = z.object({
  jobTitle: z.string(),
  company: z.string(),
  location: z.string().optional().nullable(),
  jobUrl: z.string().optional().nullable(),
  jobSiteId: z.string().optional().nullable(),
});

externalAgentsRouter.openapi(
  createRoute({
    method: "post",
    path: "/external-agents/jobs",
    summary: "Ingest jobs from external agents",
    description: "Accepts a list of scraped jobs from external agents and places them into the HITL queue.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              jobs: z.array(scrapedJobSchema),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        description: "Jobs ingested successfully",
        content: {
          "application/json": {
            schema: z.object({
              insertedCount: z.number(),
              skippedCount: z.number(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { jobs } = c.req.valid("json");
    const db = getDb(c.env);

    let insertedCount = 0;
    let skippedCount = 0;

    for (const job of jobs) {
      // Generate a synthetic jobSiteId if not provided
      let siteId = job.jobSiteId;
      if (!siteId) {
        const hashInput = job.jobUrl ? job.jobUrl : `${job.company}|${job.jobTitle}`;
        siteId = `ext-${crypto.createHash("md5").update(hashInput).digest("hex").substring(0, 12)}`;
      }

      try {
        await db.insert(jobsPostings).values({
          jobSiteId: siteId,
          jobTitle: job.jobTitle,
          company: job.company,
          location: job.location ?? null,
          pipelineSource: "external_agent",
          // Triage Passed = false (or relies on DB default) to show in HITL queue
          triagePassed: false,
          isRecommended: false,
        });
        insertedCount++;
      } catch (error: any) {
        // If it violates unique constraint on job_site_id, skip it
        if (error.message && error.message.includes("UNIQUE constraint failed")) {
          skippedCount++;
        } else {
          console.error("Failed to insert external job:", error);
          skippedCount++;
        }
      }
    }

    return c.json({ insertedCount, skippedCount });
  },
);
