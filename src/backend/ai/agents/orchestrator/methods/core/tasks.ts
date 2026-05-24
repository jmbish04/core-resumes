import { eq } from "drizzle-orm";

import type { OrchestratorAgent } from "@/backend/ai/agents/orchestrator";
import type {
  OrchestratorTask,
  OrchestratorTaskStatus,
} from "@/backend/ai/agents/orchestrator/types";
import type { ROLE_BULLET_TYPES } from "@/db/schemas/applications/role-bullets";

import { analyzeRole, generateInterview } from "@/ai/tasks";
import { classifyEmailStatus } from "@/ai/tasks";
import { analyzeCompany } from "@/ai/tasks/analyze/company";
import { enforceTokenLimit } from "@/ai/utils/token-estimator";
import { RoleInsightsService } from "@/backend/services/role-insights";
import { getDb } from "@/db";
import { emails, roleBullets, roles } from "@/db/schema";

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

// ---------------------------------------------------------------------------
// Bullet sync: maps extracted posting arrays → role_bullets insert rows
// ---------------------------------------------------------------------------

const EXTRACTED_FIELD_TO_BULLET_TYPE: Record<string, (typeof ROLE_BULLET_TYPES)[number]> = {
  responsibilities: "KEY_RESPONSIBILITY",
  requiredQualifications: "REQUIRED_QUALIFICATION",
  preferredQualifications: "PREFERRED_QUALIFICATION",
  requiredSkills: "REQUIRED_SKILL",
  preferredSkills: "PREFERRED_SKILL",
  educationRequirements: "EDUCATION_REQUIREMENT",
  benefits: "BENEFIT",
};

/**
 * Convert an extracted job posting into `role_bullets` insert rows.
 * Only processes non-empty string arrays from known bullet fields.
 */
function convertExtractedToBulletRows(
  extracted: Record<string, unknown>,
  roleId: string,
): Array<{
  roleId: string;
  type: (typeof ROLE_BULLET_TYPES)[number];
  content: string;
  sortOrder: number;
}> {
  const rows: Array<{
    roleId: string;
    type: (typeof ROLE_BULLET_TYPES)[number];
    content: string;
    sortOrder: number;
  }> = [];

  for (const [field, bulletType] of Object.entries(EXTRACTED_FIELD_TO_BULLET_TYPE)) {
    const arr = extracted[field];
    if (!Array.isArray(arr)) continue;

    let sortOrder = 0;
    for (const item of arr) {
      const text = typeof item === "string" ? item.trim() : "";
      if (text.length < 5) continue; // Skip empty/trivial entries
      rows.push({ roleId, type: bulletType, content: text, sortOrder });
      sortOrder++;
    }
  }

  return rows;
}

export async function handleEnqueueTask(
  agent: OrchestratorAgent,
  task: Omit<OrchestratorTask, "id" | "status"> & { id?: string; status?: OrchestratorTaskStatus },
) {
  const nextTask: OrchestratorTask = {
    id: task.id ?? crypto.randomUUID(),
    type: task.type,
    status: task.status ?? "pending",
    roleId: task.roleId ?? agent.state.roleId,
    payload: task.payload,
  };
  agent.setState({ ...agent.state, pendingTasks: [...agent.state.pendingTasks, nextTask] });
  agent.broadcastProgress("queued", nextTask);

  return nextTask;
}

export async function handleProcessPendingTasks(agent: OrchestratorAgent, env: Env) {
  // Process tasks in batches — when a task enqueues follow-up tasks (e.g.
  // job_extract → insight_location), those are added to state mid-loop.
  // Re-check for new pending tasks after each batch completes.
  let iteration = 0;
  const MAX_ITERATIONS = 10; // Safety valve to prevent infinite loops

  while (iteration < MAX_ITERATIONS) {
    const pendingTasks = agent.state.pendingTasks.filter((item) => item.status === "pending");

    if (pendingTasks.length === 0) {
      break;
    }

    iteration++;

    for (const task of pendingTasks) {
      const { Logger } = await import("@/backend/lib/logger");
      const logger = new Logger(env);

      await logger.info(`[OrchestratorAgent][${agent.name}] Starting task`, {
        type: task.type,
        id: task.id,
      });
      agent.updateTask(task.id, { status: "running", error: undefined });
      agent.broadcastProgress("running", task);

      try {
        await processTask(agent, env, task);
        await logger.info(`[OrchestratorAgent][${agent.name}] Successfully completed task`, {
          type: task.type,
          id: task.id,
        });
        agent.updateTask(task.id, { status: "complete" });
        agent.broadcastProgress("complete", task);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown task failure";
        await logger.error(`[OrchestratorAgent][${agent.name}] TASK FAILED`, {
          type: task.type,
          id: task.id,
          error: message,
        });

        agent.updateTask(task.id, { status: "failed", error: message });
        agent.broadcastProgress("failed", { ...task, error: message });

        // Persist error to the role's metadata so it's visible on the frontend
        await persistTaskError(agent, env, task, error);
      }
    }
  }

  // After ALL tasks have been processed, evaluate final role status
  await evaluateRoleStatus(agent, env);
}

async function persistTaskError(
  agent: OrchestratorAgent,
  env: Env,
  task: OrchestratorTask,
  error: unknown,
) {
  const targetRoleId = task.roleId ?? agent.state.roleId;
  if (!targetRoleId || targetRoleId === "global") return;

  try {
    const db = getDb(env);
    const [role] = await db.select().from(roles).where(eq(roles.id, targetRoleId)).limit(1);
    if (!role) return;

    const existingMeta = (role.metadata as Record<string, unknown>) ?? {};
    const existingErrors = Array.isArray(existingMeta.processingErrors)
      ? (existingMeta.processingErrors as Record<string, unknown>[])
      : [];
    existingErrors.push({
      taskType: task.type,
      taskId: task.id,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      occurredAt: new Date().toISOString(),
    });
    await db
      .update(roles)
      .set({
        metadata: { ...existingMeta, processingErrors: existingErrors },
        updatedAt: new Date(),
      })
      .where(eq(roles.id, targetRoleId));
  } catch (persistErr) {
    const { Logger } = await import("@/backend/lib/logger");
    const logger = new Logger(env);
    await logger.error("Failed to persist processing error to role (non-fatal)", {
      error: String(persistErr),
    });
  }
}

async function evaluateRoleStatus(agent: OrchestratorAgent, env: Env) {
  const roleId = agent.state.roleId;
  if (!roleId || roleId === "global") return;

  const allTasks = agent.state.pendingTasks;
  const anyFailed = allTasks.some((t) => t.status === "failed");
  const allComplete = allTasks.length > 0 && allTasks.every((t) => t.status === "complete");

  try {
    const { RoleStatusService } = await import("@/backend/services/role-status-service");

    if (anyFailed) {
      const failedTaskIds = allTasks.filter((t) => t.status === "failed").map((t) => t.id);
      await RoleStatusService.transition(env, roleId, "processing_error", {
        trigger: "system",
        metadata: { failedTasks: failedTaskIds },
      });
    } else if (allComplete) {
      // All tasks passed — clear errors and restore to preparing
      const db = getDb(env);
      const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);

      if (role && (role.status === "processing_error" || role.status === "preparing")) {
        await RoleStatusService.transition(env, roleId, "preparing", {
          trigger: "system",
          notes: "All pipeline tasks completed successfully.",
        });

        // Clear persisted processing errors from metadata
        if (role.metadata && typeof role.metadata === "object") {
          const meta = { ...(role.metadata as Record<string, unknown>) };
          delete meta.processingErrors;
          await db.update(roles).set({ metadata: meta }).where(eq(roles.id, roleId));
        }

        agent.broadcast(
          JSON.stringify({
            type: "role_status_update",
            payload: { roleId, status: "preparing", previousStatus: role.status },
          }),
        );
      }
    }
  } catch (err) {
    const { Logger } = await import("@/backend/lib/logger");
    const logger = new Logger(env);
    await logger.error("Failed to evaluate role status (non-fatal)", { error: String(err) });
  }
}

async function processTask(agent: OrchestratorAgent, env: Env, task: OrchestratorTask) {
  switch (task.type) {
    case "job_extract": {
      const url = readString(task.payload?.url);
      const preScrapedMarkdown = readString(task.payload?.markdown);

      if (!url && !preScrapedMarkdown) {
        throw new Error("job_extract task requires payload.url or payload.markdown");
      }

      // Use pre-scraped markdown when available; otherwise scrape fresh.
      // The hybrid extraction path takes over inside `extract_job_details`
      // when `scrapedElements` is supplied.
      let textForExtraction: string;
      let pdfUrl: string | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let extracted: any;

      if (preScrapedMarkdown) {
        textForExtraction = preScrapedMarkdown;
        // No DOM available → falls back to legacy single-blob extraction.
        extracted = await agent.extract_job_details(textForExtraction);
      } else {
        const scraped = await agent.scrape_job(url!);
        textForExtraction = scraped.markdown || scraped.text || scraped.html;
        pdfUrl = scraped.pdfUrl;

        // Hybrid extraction (Pass H + A + B), bullets verbatim from the DOM.
        extracted = await agent.extract_job_details(textForExtraction, scraped.scrapedElements);
      }

      // Persist extraction result + pdfUrl back to the role
      if (task.roleId && task.roleId !== "global") {
        const db = getDb(env);
        const [existing] = await db.select().from(roles).where(eq(roles.id, task.roleId)).limit(1);

        // Handle company logo if extracted
        if (existing?.companyId && extracted.companyLogoUrl) {
          try {
            const { BrowserRendering } = await import("@/backend/ai/tools/browser-rendering");
            const browser = new BrowserRendering(env);
            const cfUrl = await browser.uploadImageFromUrl(extracted.companyLogoUrl);

            // Import companies schema
            const { companies } = await import("@/backend/db/schema");
            const [company] = await db
              .select()
              .from(companies)
              .where(eq(companies.id, existing.companyId))
              .limit(1);

            if (company) {
              await db
                .update(companies)
                .set({
                  attributes: {
                    ...(company.attributes as Record<string, unknown>),
                    logoUrl: cfUrl,
                  },
                  updatedAt: new Date(),
                })
                .where(eq(companies.id, existing.companyId));
            }
          } catch (err) {
            const { Logger } = await import("@/backend/lib/logger");
            const logger = new Logger(env);
            await logger.error("Failed to upload extracted company logo", { error: String(err) });
          }
        }

        if (existing) {
          const existingMeta = (existing.metadata as Record<string, unknown>) ?? {};
          const patch: Record<string, unknown> = {
            metadata: {
              ...existingMeta,
              extractedPosting: extracted,
              extractedAt: new Date().toISOString(),
              // Backfill comprehensive fields into top-level metadata
              responsibilities: extracted.responsibilities ?? existingMeta.responsibilities,
              requiredQualifications:
                extracted.requiredQualifications ?? existingMeta.requiredQualifications,
              preferredQualifications:
                extracted.preferredQualifications ?? existingMeta.preferredQualifications,
              requiredSkills: extracted.requiredSkills ?? existingMeta.requiredSkills,
              preferredSkills: extracted.preferredSkills ?? existingMeta.preferredSkills,
              location: extracted.location ?? existingMeta.location,
              allLocations: extracted.allLocations ?? existingMeta.allLocations,
              californiaLocations:
                extracted.californiaLocations ?? existingMeta.californiaLocations,
              workplaceType: extracted.workplaceType ?? existingMeta.workplaceType,
              rtoPolicy: extracted.rtoPolicy ?? existingMeta.rtoPolicy,
              yearsExperienceMin: extracted.yearsExperienceMin ?? existingMeta.yearsExperienceMin,
              yearsExperienceMax: extracted.yearsExperienceMax ?? existingMeta.yearsExperienceMax,
              educationRequirements:
                extracted.educationRequirements ?? existingMeta.educationRequirements,
              department: extracted.department ?? existingMeta.department,
              reportingTo: extracted.reportingTo ?? existingMeta.reportingTo,
              travelRequirements: extracted.travelRequirements ?? existingMeta.travelRequirements,
              securityClearance: extracted.securityClearance ?? existingMeta.securityClearance,
              visaSponsorship: extracted.visaSponsorship ?? existingMeta.visaSponsorship,
              benefits: extracted.benefits ?? existingMeta.benefits,
              additionalNotes: extracted.additionalNotes ?? existingMeta.additionalNotes,
              // Hybrid extraction telemetry (Pass H/A assignments, bullet
              // counts, paragraph filter stats). Replaces the deprecated
              // `bulletFidelity` field — bullets are now provably verbatim
              // from the DOM by construction.
              hybridExtraction:
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (extracted as any)._hybridMeta ?? existingMeta.hybridExtraction,
              // Legacy compatibility: keep `bulletFidelity` populated only
              // for the lossy single-blob fallback path.
              bulletFidelity:
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (extracted as any)._fidelityMeta ?? existingMeta.bulletFidelity,
            },
          };

          // Backfill core columns only if they're still default/empty
          if (!existing.salaryMin && extracted.salaryMin) {
            patch.salaryMin = extracted.salaryMin;
          }
          if (!existing.salaryMax && extracted.salaryMax) {
            patch.salaryMax = extracted.salaryMax;
          }
          if (existing.companyName === "Unknown Company" && extracted.companyName) {
            patch.companyName = extracted.companyName;
          }
          if (existing.jobTitle === "Unknown Title" && extracted.jobTitle) {
            patch.jobTitle = extracted.jobTitle;
          }
          if (!existing.jobPostingPdfUrl && pdfUrl) {
            patch.jobPostingPdfUrl = pdfUrl;
          }

          await db.update(roles).set(patch).where(eq(roles.id, task.roleId));
        }
      }

      // ── Sync extracted bullets to role_bullets (insert-if-empty) ────────
      // The role_bullets table is the canonical source for downstream tasks
      // (role_analysis, mock_interview). The intake form inserts bullets at
      // confirm-time, but if the scrape was incomplete or the user confirmed
      // without reviewing, the table may be empty. This backfill ensures
      // extracted bullets always reach the table.
      if (task.roleId && task.roleId !== "global" && extracted) {
        try {
          const db = getDb(env);
          const [existingBullet] = await db
            .select({ id: roleBullets.id })
            .from(roleBullets)
            .where(eq(roleBullets.roleId, task.roleId))
            .limit(1);

          if (!existingBullet) {
            const bulletRows = convertExtractedToBulletRows(
              extracted as Record<string, unknown>,
              task.roleId,
            );
            if (bulletRows.length > 0) {
              // Cloudflare D1 has a hard limit of ~100 bound parameters per query.
              // Since each bullet has ~6 parameters, we chunk inserts into groups of 15 (90 parameters).
              const chunkSize = 15;
              for (let i = 0; i < bulletRows.length; i += chunkSize) {
                const chunk = bulletRows.slice(i, i + chunkSize);
                await db.insert(roleBullets).values(chunk);
              }
              const { Logger } = await import("@/backend/lib/logger");
              const logger = new Logger(env);
              await logger.info(`[orchestrator] Synced extracted bullets to role_bullets`, {
                roleId: task.roleId,
                count: bulletRows.length,
              });
            }
          }
        } catch (bulletSyncErr) {
          const { Logger } = await import("@/backend/lib/logger");
          const logger = new Logger(env);
          await logger.error("Failed to sync extracted bullets to role_bullets (non-fatal)", {
            error: String(bulletSyncErr),
          });
        }
      }

      // Auto-chain: enqueue downstream analysis tasks after successful extraction.
      // Bullets are now guaranteed to exist (synced above), so we always enqueue
      // role_analysis and mock_interview alongside insight tasks.
      if (task.roleId && task.roleId !== "global") {
        try {
          const db = getDb(env);
          await handleEnqueueTask(agent, { type: "insight_location", roleId: task.roleId });
          await handleEnqueueTask(agent, { type: "insight_compensation", roleId: task.roleId });
          await handleEnqueueTask(agent, { type: "insight_combined", roleId: task.roleId });

          // Only enqueue analysis + interview if bullets exist in D1
          const [hasBullets] = await db
            .select({ id: roleBullets.id })
            .from(roleBullets)
            .where(eq(roleBullets.roleId, task.roleId))
            .limit(1);

          if (hasBullets) {
            await handleEnqueueTask(agent, { type: "role_analysis", roleId: task.roleId });
            const { Logger } = await import("@/backend/lib/logger");
            const logger = new Logger(env);
            await logger.info(`[orchestrator] Enqueued 4 follow-up tasks`, { roleId: task.roleId });
          } else {
            const { Logger } = await import("@/backend/lib/logger");
            const logger = new Logger(env);
            await logger.info(
              `[orchestrator] Enqueued 3 follow-up tasks (no bullets for analysis)`,
              { roleId: task.roleId },
            );
          }
        } catch (chainErr) {
          const { Logger } = await import("@/backend/lib/logger");
          const logger = new Logger(env);
          await logger.error("Failed to enqueue follow-up insight tasks (non-fatal)", {
            error: String(chainErr),
          });
        }
      }

      return extracted;
    }
    case "email_draft":
    case "email_workflow": {
      const emailId = readString(task.payload?.emailId);
      if (!emailId) {
        throw new Error(`${task.type} task requires payload.emailId`);
      }
      return agent.draft_email_reply(emailId);
    }
    case "offer_analysis": {
      // Phase 3: Will parse offer attachments and generate negotiation strategy
      const emailId = readString(task.payload?.emailId);
      if (!emailId) {
        throw new Error("offer_analysis task requires payload.emailId");
      }
      return { status: "pending_implementation", emailId };
    }
    case "resume_review":
    case "cover_letter_draft": {
      const { draftWithNotebook } = await import("@/ai/tasks/draft/notebook");
      return draftWithNotebook({
        env,
        roleId: task.roleId ?? "global",
        docType: task.type === "resume_review" ? "resume" : "cover_letter",
        onProgress: (progress) => agent.broadcastProgress(progress.phase, task),
      });
    }
    case "resume_comment_response": {
      const gdocId = readString(task.payload?.gdocId);
      const targetRoleId = task.roleId ?? readString(task.payload?.roleId);
      if (!gdocId) throw new Error("resume_comment_response requires payload.gdocId");
      if (!targetRoleId || targetRoleId === "global")
        throw new Error("resume_comment_response requires a valid roleId");

      const { respondToComments } = await import("@/ai/tasks/respond-to-comments");
      return respondToComments(env, targetRoleId, gdocId, (progress) => {
        agent.broadcastProgress(progress.phase, task);
      });
    }
    case "role_analysis": {
      const targetRoleId = task.roleId ?? readString(task.payload?.roleId);
      if (!targetRoleId || targetRoleId === "global") {
        throw new Error("role_analysis task requires a valid roleId");
      }
      return analyzeRole(env, targetRoleId);
    }
    case "company_analysis": {
      const companyId = readString(task.payload?.companyId);
      if (!companyId) {
        throw new Error("company_analysis task requires payload.companyId");
      }
      return analyzeCompany(env, companyId);
    }
    case "insight_location": {
      const targetRoleId = task.roleId ?? agent.state.roleId;
      if (!targetRoleId || targetRoleId === "global") {
        throw new Error("insight_location task requires a valid roleId");
      }
      const svc = new RoleInsightsService();
      return svc.generateLocationInsight(env, targetRoleId);
    }
    case "insight_compensation": {
      const targetRoleId = task.roleId ?? agent.state.roleId;
      if (!targetRoleId || targetRoleId === "global") {
        throw new Error("insight_compensation task requires a valid roleId");
      }
      const svc = new RoleInsightsService();
      return svc.generateCompensationInsight(env, targetRoleId);
    }
    case "insight_combined": {
      const targetRoleId = task.roleId ?? agent.state.roleId;
      if (!targetRoleId || targetRoleId === "global") {
        throw new Error("insight_combined task requires a valid roleId");
      }
      const svc = new RoleInsightsService();
      return svc.generateCombinedInsight(env, targetRoleId);
    }
    case "role_assets": {
      const targetRoleId = task.roleId ?? agent.state.roleId;
      if (!targetRoleId || targetRoleId === "global") {
        throw new Error("role_assets task requires a valid roleId");
      }
      const { startRoleAssetsWorkflow } = await import("@/services/role-assets");
      const db = getDb(env);
      const [role] = await db.select().from(roles).where(eq(roles.id, targetRoleId)).limit(1);
      if (!role) throw new Error(`Role not found: ${targetRoleId}`);
      await startRoleAssetsWorkflow(
        env,
        role,
        readString(task.payload?.scrapedMarkdown),
        readString(task.payload?.scrapedHtml),
        readString(task.payload?.mode) as "podcast" | "assets_only" | undefined,
      );
      return { status: "workflow_started" };
    }
    case "email_status_inference": {
      const emailId = readString(task.payload?.emailId);
      if (!emailId) {
        throw new Error("email_status_inference task requires payload.emailId");
      }
      const db = getDb(env);
      const [email] = await db.select().from(emails).where(eq(emails.id, emailId)).limit(1);
      if (!email || !email.roleId) {
        throw new Error(`Email not found or not associated: ${emailId}`);
      }
      const [role] = await db.select().from(roles).where(eq(roles.id, email.roleId)).limit(1);
      if (!role) {
        throw new Error(`Role not found for email: ${emailId}`);
      }
      return classifyEmailStatus(env, email.subject, email.body, role.status);
    }
    case "interview_feedback": {
      const transcription = readString(task.payload?.transcription);
      const targetRoleId = task.roleId ?? readString(task.payload?.roleId);
      if (!transcription) {
        throw new Error("interview_feedback task requires payload.transcription");
      }
      enforceTokenLimit(transcription, 120000, "Interview Transcription");
      const query = `Analyze this interview transcription and provide specific, actionable feedback.
Focus on: (1) areas where the candidate could improve their answers,
(2) questions that were handled well, (3) suggestions for better responses.

Transcription:
${transcription}`;
      const feedback = await agent.consult_notebook(query);
      if (targetRoleId && targetRoleId !== "global") {
        const thread = await agent.ensureThread(targetRoleId);
        await agent.addMessage(
          thread.id,
          targetRoleId,
          "agent",
          `## Interview Feedback\n\n${typeof feedback === "string" ? feedback : JSON.stringify(feedback)}`,
          { source: "interview_feedback" },
        );
      }
      return feedback;
    }
    case "mock_interview": {
      const targetRoleId = task.roleId ?? readString(task.payload?.roleId);
      if (!targetRoleId || targetRoleId === "global") {
        throw new Error("mock_interview task requires a valid roleId");
      }
      return generateInterview(env, targetRoleId);
    }
    default: {
      throw new Error(`Unknown task type: ${(task as any).type}`);
    }
  }
}
