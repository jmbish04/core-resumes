/**
 * @fileoverview Service for starting the role assets workflow.
 *
 * Extracted from intake.ts to avoid circular imports when called from the
 * orchestrator task processor.
 */

import { eq } from "drizzle-orm";

import { buildRoleMarkdown } from "@/ai/tools/role/markdown";
import { getDb } from "@/db";
import { rolePodcasts, roles } from "@/db/schema";

/**
 * Start the RoleAssetsWorkflow for a given role. Creates a `role_podcasts`
 * record and invokes the Workflow binding.
 */
export async function startRoleAssetsWorkflow(
  env: Env,
  role: typeof roles.$inferSelect,
  scrapedMarkdown?: string,
  scrapedHtml?: string,
  mode: "assets_only" | "podcast" = "podcast",
): Promise<void> {
  const db = getDb(env);
  const podcastId = crypto.randomUUID();
  const notebooklmSourceFilename = `role-${role.id}.md`;
  const manualMarkdown = scrapedMarkdown?.trim()
    ? undefined
    : buildRoleMarkdown({
        companyName: role.companyName,
        jobTitle: role.jobTitle,
        jobUrl: role.jobUrl,
        salaryMin: role.salaryMin,
        salaryMax: role.salaryMax,
        salaryCurrency: role.salaryCurrency,
        roleInstructions: role.roleInstructions,
        metadata: role.metadata,
      });

  await db.insert(rolePodcasts).values({
    id: podcastId,
    roleId: role.id,
    notebooklmSourceFilename,
    status: "queued",
  });

  try {
    const instance = await env.ROLE_ASSETS_WORKFLOW.create({
      id: podcastId,
      params: {
        roleId: role.id,
        podcastId,
        scrapedMarkdown,
        scrapedHtml,
        manualMarkdown,
        mode,
      },
    });
    await db
      .update(rolePodcasts)
      .set({ workflowInstanceId: instance.id, updatedAt: new Date() })
      .where(eq(rolePodcasts.id, podcastId));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(rolePodcasts)
      .set({
        status: "failed",
        stepErrors: [{ step: "workflow_create", message, at: new Date().toISOString() }],
        updatedAt: new Date(),
      })
      .where(eq(rolePodcasts.id, podcastId));
    
    const { Logger } = await import("@/backend/lib/logger");
    const logger = new Logger(env);
    await logger.error("Failed to start role assets workflow (non-fatal)", { error: String(error) });
  }
}
