import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";

import { enqueueOrchestratorTask } from "../../ai/agents/orchestrator";
import { JobPosting, JobPostingExtractionSchema } from "../../ai/agents/orchestrator/types";
import { extractStructuredRolePosting as extract } from "../../ai/tasks";
import {
  BrowserRendering,
  type ScrapeResult as DomScrapeResult,
  type ScrapedPage,
} from "../../ai/tools/browser-rendering";
import { GoogleDriveClient } from "../../ai/tools/google/drive";
import { parseGreenhouseUrl, scrapeGreenhouseJob } from "../../ai/tools/greenhouse";
import { HYBRID_SCRAPE_SELECTORS } from "../../ai/tools/role/html-bullet-parser";
import { getDb } from "../../db";
import {
  companies,
  jobFailures,
  roleBullets as roleBulletsTable,
  ROLE_BULLET_TYPES,
  roles,
  selectRoleSchema,
  threads,
} from "../../db/schema";

const scrapeBody = z.object({ url: z.string().url() });
const sseResponseSchema = z.object({ stage: z.string(), payload: z.unknown().optional() });

// ---------------------------------------------------------------------------
// Scrape result (extends base with PDF + source tracking)
// ---------------------------------------------------------------------------

type ScrapeResult = {
  posting: z.infer<typeof JobPosting>;
  pdfUrl?: string;
  markdown?: string;
  html?: string;
  source: string;
};

// ---------------------------------------------------------------------------
// Scrape helper — concurrent BR methods → Greenhouse API fallback
// ---------------------------------------------------------------------------

/**
 * Multi-method scrape pipeline (hybrid extraction):
 *   1. BR `/pdf`, `/markdown`, `/scrape` (h1-h3, ul>li, ol>li, p), and a snapshot
 *      run concurrently.
 *   2. PDF is uploaded to R2 for user reference.
 *   3. Markdown + DOM scrape feed `extract()` which delegates to the hybrid
 *      pipeline (Pass H heading classify + Pass A narrative classify + Pass B
 *      fact extract). Bullets are provably verbatim from the DOM.
 *   4. If ALL BR methods fail for a Greenhouse URL → Greenhouse API fallback.
 *
 * The legacy Browser Rendering `/json` endpoint is NO LONGER USED — that path
 * runs an opaque LLM call inside Cloudflare's BR service and was empirically
 * 3-5x slower than running our own three small structured-output calls.
 */
async function scrapeWithFallback(
  env: Env,
  url: string,
  onStage?: (stage: string, payload?: unknown) => void,
): Promise<ScrapeResult> {
  const ghParsed = parseGreenhouseUrl(url);

  onStage?.("scraping", {
    source: "browser-rendering",
    methods: ["pdf", "markdown", "scrape", "snapshot"],
  });
  onStage?.("scraping_log", { message: "Launching 4 concurrent Browser Rendering sessions…" });

  const browser = new BrowserRendering(env);
  const [pdfResult, mdResult, scrapeElementsResult, snapshotResult] = await Promise.allSettled([
    browser.capturePdf(url),
    browser.extractMarkdown(url),
    browser.scrapeElements(url, [...HYBRID_SCRAPE_SELECTORS]),
    browser.scrapeUrl(url),
  ]);

  const pdfOk = pdfResult.status === "fulfilled";
  const mdOk = mdResult.status === "fulfilled" && (mdResult.value as string).length > 100;
  const scrapeOk = scrapeElementsResult.status === "fulfilled";
  const snapshotOk =
    snapshotResult.status === "fulfilled" && (snapshotResult.value as ScrapedPage).html.length > 0;

  onStage?.("scraping_log", {
    message: `Browser Rendering complete — PDF: ${pdfOk ? "✓" : "✗"}, Markdown: ${mdOk ? "✓" : "✗"}, DOM scrape: ${scrapeOk ? "✓" : "✗"}, Snapshot: ${snapshotOk ? "✓" : "✗"}`,
  });

  const anyBrSucceeded = pdfOk || mdOk || scrapeOk || snapshotOk;

  const { Logger } = await import("@/backend/lib/logger");
  const logger = new Logger(env);

  if (!anyBrSucceeded) {
    await logger.error("All Browser Rendering methods failed", {
      pdf: pdfResult.status === "rejected" ? (pdfResult.reason as Error).message : "ok",
      markdown: mdResult.status === "rejected" ? (mdResult.reason as Error).message : "ok",
      scrape:
        scrapeElementsResult.status === "rejected"
          ? (scrapeElementsResult.reason as Error).message
          : "ok",
      snapshot:
        snapshotResult.status === "rejected" ? (snapshotResult.reason as Error).message : "ok",
    });
  }

  if (!anyBrSucceeded && ghParsed) {
    onStage?.("scraping", { source: "greenhouse-api-fallback" });
    try {
      const ghResult = await scrapeGreenhouseJob(ghParsed.boardToken, ghParsed.jobId);
      const gh = ghResult.greenhouse;

      const salaryMatch = ghResult.text.match(/\$\s?([\d,]+)\s*(?:—|–|-|to)\s*\$\s?([\d,]+)/);

      return {
        posting: {
          companyName: gh.company_name ?? ghParsed.boardToken,
          jobTitle: gh.title,
          jobUrl: gh.absolute_url,
          salaryMin: salaryMatch ? parseInt(salaryMatch[1].replace(/,/g, ""), 10) : undefined,
          salaryMax: salaryMatch ? parseInt(salaryMatch[2].replace(/,/g, ""), 10) : undefined,
          salaryCurrency: salaryMatch ? "USD" : "USD",
          metadata: {
            location: gh.location?.name,
            departments: gh.departments?.map((d) => d.name),
            offices: gh.offices?.map((o) => o.name),
            source: "greenhouse-api",
            greenhouseJobId: gh.id,
          },
        },
        markdown: ghResult.text,
        html: ghResult.html,
        source: "greenhouse-api",
      };
    } catch (ghError) {
      throw new Error(
        `All scraping methods failed for ${url}. ` +
          `BR: ${pdfResult.status === "rejected" ? (pdfResult.reason as Error).message : "n/a"}. ` +
          `GH: ${ghError instanceof Error ? ghError.message : String(ghError)}`,
      );
    }
  }

  if (!anyBrSucceeded) {
    throw new Error(
      `All Browser Rendering methods failed for ${url}: ` +
        [
          pdfResult.status === "rejected" ? `pdf: ${(pdfResult.reason as Error).message}` : null,
          mdResult.status === "rejected" ? `md: ${(mdResult.reason as Error).message}` : null,
          scrapeElementsResult.status === "rejected"
            ? `scrape: ${(scrapeElementsResult.reason as Error).message}`
            : null,
          snapshotResult.status === "rejected"
            ? `snapshot: ${(snapshotResult.reason as Error).message}`
            : null,
        ]
          .filter(Boolean)
          .join("; "),
    );
  }

  let pdfUrl: string | undefined;
  if (pdfOk) {
    onStage?.("scraping_log", { message: "Uploading PDF snapshot to R2…" });
    try {
      const key = `job-postings/${crypto.randomUUID()}.pdf`;
      pdfUrl = await browser.uploadPdfToR2(key, pdfResult.value as ArrayBuffer, {
        sourceUrl: url,
        capturedAt: new Date().toISOString(),
      });
      onStage?.("scraping_log", { message: "PDF uploaded to R2 ✓" });
    } catch (err) {
      await logger.error("PDF R2 upload failed (non-fatal)", { error: String(err) });
      onStage?.("scraping_log", { message: "PDF R2 upload failed (non-fatal)" });
    }
  }

  // ── Hybrid extraction (preferred) ───────────────────────────────────────
  let posting: Partial<z.infer<typeof JobPosting>> = {};
  const markdownContent = mdOk ? (mdResult.value as string) : undefined;
  const scrapedElements: DomScrapeResult | undefined = scrapeOk
    ? (scrapeElementsResult.value as DomScrapeResult)
    : undefined;

  if (markdownContent) {
    onStage?.("scraping_log", {
      message: `Markdown captured: ${markdownContent.length.toLocaleString()} characters`,
    });
    onStage?.("scraping_markdown", { content: markdownContent });

    onStage?.("extracting", {
      source: scrapedElements ? "hybrid (Pass H + A + B)" : "lossy-fallback",
    });
    onStage?.("extracting_log", {
      message: scrapedElements
        ? "Running hybrid extraction — DOM bullets + 3 small AI passes…"
        : "DOM scrape unavailable — falling back to single-blob extraction…",
    });
    try {
      posting = await extract(env, {
        text: markdownContent,
        schema: JobPosting,
        extractionSchema: JobPostingExtractionSchema,
        scrapedElements,
      });
      const fieldCount = Object.values(posting).filter((v) => v !== undefined && v !== null).length;
      onStage?.("extracting_log", {
        message: `AI extraction complete — ${fieldCount} fields populated`,
      });
    } catch (err) {
      await logger.error("AI extraction failed (non-fatal)", { error: String(err) });
      onStage?.("extracting_log", {
        message: `AI extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  const finalPosting: z.infer<typeof JobPosting> = {
    companyName: posting.companyName || "Unknown Company",
    jobTitle: posting.jobTitle || "Unknown Title",
    jobUrl: posting.jobUrl || url,
    salaryMin: posting.salaryMin,
    salaryMax: posting.salaryMax,
    salaryCurrency: posting.salaryCurrency || "USD",
    responsibilities: posting.responsibilities,
    requiredQualifications: posting.requiredQualifications,
    preferredQualifications: posting.preferredQualifications,
    requiredSkills: posting.requiredSkills,
    preferredSkills: posting.preferredSkills,
    location: posting.location,
    workplaceType: posting.workplaceType,
    rtoPolicy: posting.rtoPolicy,
    yearsExperienceMin: posting.yearsExperienceMin,
    yearsExperienceMax: posting.yearsExperienceMax,
    educationRequirements: posting.educationRequirements,
    department: posting.department,
    reportingTo: posting.reportingTo,
    travelRequirements: posting.travelRequirements,
    securityClearance: posting.securityClearance,
    visaSponsorship: posting.visaSponsorship,
    benefits: posting.benefits,
    additionalNotes: posting.additionalNotes,
    aboutCompany: posting.aboutCompany,
    aboutRoleNarrative: posting.aboutRoleNarrative,
    otherContent: posting.otherContent,
    companyLogoUrl: posting.companyLogoUrl,
    metadata: {
      ...posting.metadata,
      brMethods: {
        pdf: pdfOk ? "ok" : "fail",
        markdown: mdOk ? "ok" : "fail",
        scrape: scrapeOk ? "ok" : "fail",
        snapshot: snapshotOk ? "ok" : "fail",
      },
      extractionMode: scrapedElements ? "hybrid" : "lossy-fallback",
      source: "browser-rendering",
    },
  };

  return {
    posting: finalPosting,
    pdfUrl,
    markdown: markdownContent,
    html: snapshotOk ? (snapshotResult.value as ScrapedPage).html : undefined,
    source: "browser-rendering",
  };
}

/**
 * Insert a podcast workflow row and start the durable background pipeline.
 *
 * Intake must never fail solely because Drive/NotebookLM/podcast background
 * processing cannot start. Errors are recorded on the `role_podcasts` row and
 * the newly-created role is still returned to the user.
 */
import { startRoleAssetsWorkflow } from "../../services/role-assets";

const confirmBody = z.object({
  companyName: z.string(),
  jobTitle: z.string(),
  jobUrl: z.string().url().optional(),
  jobPostingPdfUrl: z.string().optional(),
  scrapedMarkdown: z.string().optional(),
  scrapedHtml: z.string().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  salaryCurrency: z.string().optional(),
  roleInstructions: z.string().optional(),
  // Comprehensive extracted fields
  responsibilities: z.array(z.string()).optional(),
  requiredQualifications: z.array(z.string()).optional(),
  preferredQualifications: z.array(z.string()).optional(),
  requiredSkills: z.array(z.string()).optional(),
  preferredSkills: z.array(z.string()).optional(),
  location: z.string().optional(),
  workplaceType: z.enum(["remote", "hybrid", "onsite"]).optional(),
  rtoPolicy: z.string().optional(),
  yearsExperienceMin: z.number().optional(),
  yearsExperienceMax: z.number().optional(),
  educationRequirements: z.array(z.string()).optional(),
  department: z.string().optional(),
  reportingTo: z.string().optional(),
  travelRequirements: z.string().optional(),
  securityClearance: z.string().optional(),
  visaSponsorship: z.string().optional(),
  benefits: z.array(z.string()).optional(),
  additionalNotes: z.string().optional(),
  // New fields: company intro, role narrative, other content
  aboutCompany: z.string().optional(),
  aboutRoleNarrative: z.string().optional(),
  otherContent: z.string().optional(),
  companyLogoUrl: z.string().url().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  source: z.enum(["manual", "greenhouse_scan", "email"]).optional(),
  sourceSnapshotId: z.number().nullable().optional(),
  // Structured bullet items from the intake section tables
  roleBullets: z
    .array(
      z.object({
        type: z.enum(ROLE_BULLET_TYPES),
        content: z.string().min(1),
      }),
    )
    .optional(),
});

const batchBodySchema = z.object({
  jobs: z.array(
    z.object({
      jobUrl: z.string().url(),
      companyName: z.string().optional(),
      jobTitle: z.string().optional(),
      salaryMin: z.number().optional(),
      salaryMax: z.number().optional(),
      salaryCurrency: z.string().optional(),
      roleInstructions: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});

const batchResponseSchema = z.object({
  succeeded: z.array(selectRoleSchema),
  failed: z.array(
    z.object({
      jobUrl: z.string(),
      errorMessage: z.string(),
    }),
  ),
});

export const intakeRouter = new OpenAPIHono<{ Bindings: Env }>();

intakeRouter.openapi(
  createRoute({
    method: "post",
    path: "/scrape",
    operationId: "intakeScrape",
    request: { body: { content: { "application/json": { schema: scrapeBody } } } },
    responses: {
      200: {
        description: "SSE scrape progress",
        content: { "text/event-stream": { schema: sseResponseSchema } },
      },
    },
  }),
  (async (c: any) => {
    const { url } = c.req.valid("json");
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (stage: string, payload?: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ stage, payload })}\n\n`));
        };

        try {
          const { posting, pdfUrl, markdown, html } = await scrapeWithFallback(c.env, url, send);
          send("mapping", {
            ...posting,
            jobUrl: posting.jobUrl ?? url,
            jobPostingPdfUrl: pdfUrl,
            scrapedMarkdown: markdown,
            scrapedHtml: html,
          });
          controller.close();
        } catch (error) {
          send("error", {
            message: error instanceof Error ? error.message : "Unknown intake error",
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      },
    });
  }) as any,
);

intakeRouter.openapi(
  createRoute({
    method: "post",
    path: "/confirm",
    operationId: "intakeConfirm",
    request: { body: { content: { "application/json": { schema: confirmBody } } } },
    responses: {
      201: {
        description: "Confirmed role",
        content: { "application/json": { schema: selectRoleSchema } },
      },
    },
  }),
  (async (c: any) => {
    const body = c.req.valid("json");
    const db = getDb(c.env);

    // Drive folder creation is non-blocking — if it fails, we still create the role
    let folderId: string | null = null;
    const { Logger } = await import("@/backend/lib/logger");
    const logger = new Logger(c.env);

    try {
      const folder = await new GoogleDriveClient(c.env).createFolder(
        `${body.companyName} - ${body.jobTitle}`,
        c.env.PARENT_DRIVE_FOLDER_ID,
      );
      folderId = folder.id;
    } catch (driveError) {
      await logger.error("Google Drive folder creation failed (non-fatal)", {
        error: String(driveError),
      });
    }

    // Separate transient/extracted fields from core role columns
    const {
      scrapedMarkdown,
      scrapedHtml,
      responsibilities,
      requiredQualifications,
      preferredQualifications,
      requiredSkills,
      preferredSkills,
      location,
      workplaceType,
      rtoPolicy,
      yearsExperienceMin,
      yearsExperienceMax,
      educationRequirements,
      department,
      reportingTo,
      travelRequirements,
      securityClearance,
      visaSponsorship,
      benefits,
      additionalNotes,
      aboutCompany,
      aboutRoleNarrative,
      otherContent,
      metadata: incomingMeta,
      roleBullets: incomingBullets,
      ...coreValues
    } = body;

    // Pack extracted fields into metadata JSON
    const metadata = {
      ...incomingMeta,
      responsibilities,
      requiredQualifications,
      preferredQualifications,
      requiredSkills,
      preferredSkills,
      location,
      workplaceType,
      rtoPolicy,
      educationRequirements,
      department,
      reportingTo,
      travelRequirements,
      securityClearance,
      visaSponsorship,
      benefits,
      additionalNotes,
    };

    // Lookup or create company
    const companyName = body.companyName || "Unknown Company";
    let companyId: string;

    // Extract Greenhouse board token from job URL if applicable
    const ghParsed = body.jobUrl ? parseGreenhouseUrl(body.jobUrl) : null;
    const greenhouseToken = ghParsed?.boardToken ?? undefined;

    const [existingCompany] = await db
      .select()
      .from(companies)
      .where(eq(companies.name, companyName))
      .limit(1);

    if (existingCompany) {
      companyId = existingCompany.id;
      // Backfill greenhouse_token if not already set
      if (greenhouseToken && !existingCompany.greenhouseToken) {
        await db
          .update(companies)
          .set({ greenhouseToken, updatedAt: new Date() })
          .where(eq(companies.id, companyId));
      }
    } else {
      companyId = crypto.randomUUID();
      await db.insert(companies).values({
        id: companyId,
        name: companyName,
        ...(greenhouseToken ? { greenhouseToken } : {}),
      });
    }

    const [role] = await db
      .insert(roles)
      .values({
        ...coreValues,
        companyName,
        companyId,
        metadata,
        id: crypto.randomUUID(),
        driveFolderId: folderId,
        yearsExperienceMin: yearsExperienceMin ?? null,
        yearsExperienceMax: yearsExperienceMax ?? null,
        aboutCompany: aboutCompany ?? null,
        aboutRoleNarrative: aboutRoleNarrative ?? null,
        otherContent: otherContent ?? null,
      })
      .returning();
    // --- Background tasks (fire-and-forget, must NOT crash the 201 response) ---
    const bgErrors: { taskType: string; error: string; occurredAt: string }[] = [];

    try {
      await db.insert(threads).values({
        id: crypto.randomUUID(),
        title: `${role.companyName} ${role.jobTitle}`,
        roleId: role.id,
      });
    } catch (threadErr) {
      await logger.error("Thread creation failed (non-fatal)", { error: String(threadErr) });
      bgErrors.push({
        taskType: "thread_creation",
        error: threadErr instanceof Error ? threadErr.message : String(threadErr),
        occurredAt: new Date().toISOString(),
      });
    }

    try {
      await enqueueOrchestratorTask(c.env, role.id, {
        type: "job_extract",
        roleId: role.id,
        payload: {
          url: role.jobUrl ?? body.jobUrl,
          markdown: scrapedMarkdown,
        },
      });
    } catch (extractErr) {
      await logger.error("Orchestrator job_extract enqueue failed (non-fatal)", {
        error: String(extractErr),
      });
      bgErrors.push({
        taskType: "job_extract_enqueue",
        error: extractErr instanceof Error ? extractErr.message : String(extractErr),
        occurredAt: new Date().toISOString(),
      });
    }

    try {
      await enqueueOrchestratorTask(c.env, role.id, {
        type: "company_analysis",
        roleId: role.id,
        payload: { companyId },
      });
    } catch (companyErr) {
      await logger.error("Orchestrator company_analysis enqueue failed (non-fatal)", {
        error: String(companyErr),
      });
      bgErrors.push({
        taskType: "company_analysis_enqueue",
        error: companyErr instanceof Error ? companyErr.message : String(companyErr),
        occurredAt: new Date().toISOString(),
      });
    }

    try {
      await enqueueOrchestratorTask(c.env, role.id, {
        type: "role_assets",
        roleId: role.id,
        payload: {
          scrapedMarkdown,
          scrapedHtml,
          mode: "assets_only",
        },
      });
    } catch (wfErr) {
      await logger.error("Orchestrator role_assets enqueue failed (non-fatal)", {
        error: String(wfErr),
      });
      bgErrors.push({
        taskType: "role_assets_enqueue",
        error: wfErr instanceof Error ? wfErr.message : String(wfErr),
        occurredAt: new Date().toISOString(),
      });
    }

    // Insert role bullets if provided
    if (incomingBullets && incomingBullets.length > 0) {
      const typeCounters: Record<string, number> = {};
      const bulletRows = incomingBullets
        .filter((b: { type: string; content: string }) => b.content?.trim())
        .map((b: { type: string; content: string }) => {
          typeCounters[b.type] = (typeCounters[b.type] ?? 0) + 1;
          return {
            roleId: role.id,
            type: b.type as (typeof ROLE_BULLET_TYPES)[number],
            content: b.content.trim(),
            sortOrder: typeCounters[b.type] - 1,
          };
        });

      if (bulletRows.length > 0) {
        try {
          // Cloudflare D1 has a hard limit of ~100 bound parameters per query.
          // Since each bullet has ~6 parameters, we chunk inserts into groups of 15 (90 parameters).
          const chunkSize = 15;
          for (let i = 0; i < bulletRows.length; i += chunkSize) {
            const chunk = bulletRows.slice(i, i + chunkSize);
            await db.insert(roleBulletsTable).values(chunk);
          }
        } catch (bulletErr) {
          await logger.error("Role bullet insertion failed (non-fatal)", {
            error: String(bulletErr),
          });
        }
      }
    }

    // If any background tasks failed, persist errors to the role's metadata
    if (bgErrors.length > 0) {
      try {
        const { RoleStatusService } = await import("../../services/role-status-service");
        await RoleStatusService.transition(c.env, role.id, "processing_error", {
          trigger: "system",
          metadata: { processingErrors: bgErrors },
        });
        await db
          .update(roles)
          .set({
            metadata: { processingErrors: bgErrors },
            updatedAt: new Date(),
          })
          .where(eq(roles.id, role.id));
      } catch (metaErr) {
        await logger.error("Failed to persist background errors to role metadata", {
          error: String(metaErr),
        });
      }
    }

    return c.json(role, 201);
  }) as any,
);

intakeRouter.openapi(
  createRoute({
    method: "post",
    path: "/batch",
    operationId: "intakeBatch",
    request: { body: { content: { "application/json": { schema: batchBodySchema } } } },
    responses: {
      200: {
        description: "Batch result",
        content: { "application/json": { schema: batchResponseSchema } },
      },
    },
  }),
  (async (c: any) => {
    const { jobs } = c.req.valid("json");
    const db = getDb(c.env);

    const succeeded: any[] = [];
    const failed: any[] = [];

    for (const job of jobs) {
      try {
        const { posting, pdfUrl, markdown, html } = await scrapeWithFallback(c.env, job.jobUrl);

        const companyName = posting.companyName || job.companyName || "Unknown Company";
        const jobTitle = posting.jobTitle || job.jobTitle || "Unknown Title";

        const folder = await new GoogleDriveClient(c.env).createFolder(
          `${companyName} - ${jobTitle}`,
          c.env.PARENT_DRIVE_FOLDER_ID,
        );

        // Extract Greenhouse board token from job URL if applicable
        const ghParsed = parseGreenhouseUrl(job.jobUrl);
        const greenhouseToken = ghParsed?.boardToken ?? undefined;

        let companyId: string;
        const [existingCompany] = await db
          .select()
          .from(companies)
          .where(eq(companies.name, companyName))
          .limit(1);

        if (existingCompany) {
          companyId = existingCompany.id;
          // Backfill greenhouse_token if not already set
          if (greenhouseToken && !existingCompany.greenhouseToken) {
            await db
              .update(companies)
              .set({ greenhouseToken, updatedAt: new Date() })
              .where(eq(companies.id, companyId));
          }
        } else {
          companyId = crypto.randomUUID();
          await db.insert(companies).values({
            id: companyId,
            name: companyName,
            ...(greenhouseToken ? { greenhouseToken } : {}),
          });
        }

        const [role] = await db
          .insert(roles)
          .values({
            id: crypto.randomUUID(),
            companyName,
            companyId,
            jobTitle,
            jobUrl: job.jobUrl,
            salaryMin: posting.salaryMin ?? job.salaryMin,
            salaryMax: posting.salaryMax ?? job.salaryMax,
            salaryCurrency: posting.salaryCurrency ?? job.salaryCurrency,
            roleInstructions: posting.roleInstructions ?? job.roleInstructions,
            metadata: { ...job.metadata, ...posting.metadata },
            jobPostingPdfUrl: pdfUrl,
            driveFolderId: folder.id,
          })
          .returning();

        await db.insert(threads).values({
          id: crypto.randomUUID(),
          title: `${companyName} ${jobTitle}`,
          roleId: role.id,
        });

        await enqueueOrchestratorTask(c.env, role.id, {
          type: "job_extract",
          roleId: role.id,
          payload: {
            url: role.jobUrl,
            markdown,
          },
        });

        await enqueueOrchestratorTask(c.env, "global", {
          type: "company_analysis",
          payload: { companyId },
        });

        await startRoleAssetsWorkflow(c.env, role, markdown, html, "assets_only");

        succeeded.push(role);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await db.insert(jobFailures).values({
          id: crypto.randomUUID(),
          jobUrl: job.jobUrl,
          errorMessage,
        });
        failed.push({ jobUrl: job.jobUrl, errorMessage });
      }
    }

    return c.json({ succeeded, failed });
  }) as any,
);
