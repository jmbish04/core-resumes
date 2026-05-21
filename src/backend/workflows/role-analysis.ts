// src/backend/ai/workflows/role-analysis-workflow.ts
import { getAgentByName } from "agents";
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { eq, inArray, desc } from "drizzle-orm";

import { analyzeRole } from "@/ai/tasks/analyze/role";
import { getActiveBullets } from "@/ai/tasks/draft";
import { generateResumeBulletsTask } from "@/ai/tasks/generate/resume-bullets";
import { recognizePatternsTask } from "@/ai/tasks/recognize-patterns";
import { getDb } from "@/db";
import {
  roleBullets,
  roleBulletAnalyses,
  roleResumeBullets,
  roleResumeBulletsMap,
  roleBulletPatterns,
  roleBulletPatternMap,
} from "@/db/schema";

async function buildScoredBulletsContext(env: Env, roleId: string) {
  const db = getDb(env);
  const bullets = await db.select().from(roleBullets).where(eq(roleBullets.roleId, roleId));
  if (bullets.length === 0) return "No bullets found.";

  const analyses = await db
    .select()
    .from(roleBulletAnalyses)
    .where(
      inArray(
        roleBulletAnalyses.bulletId,
        bullets.map((b) => b.id),
      ),
    )
    .orderBy(desc(roleBulletAnalyses.revisionNumber));

  const latestAnalysisByBulletId = new Map();
  for (const a of analyses) {
    if (!latestAnalysisByBulletId.has(a.bulletId)) {
      latestAnalysisByBulletId.set(a.bulletId, a);
    }
  }

  let context = "";
  for (const b of bullets) {
    const analysis = latestAnalysisByBulletId.get(b.id);
    context += `Bullet ID: ${b.id}\nType: ${b.type}\nContent: ${b.content}\n`;
    if (analysis) {
      context += `Score: ${analysis.aiScore}/100\nRationale: ${analysis.aiRationale}\n`;
    }
    context += "\n";
  }
  return context;
}

type Params = { roleId: string; orchestratorAgentName: string };

export class RoleAnalysisWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { roleId, orchestratorAgentName } = event.payload;

    // Communicate progress back to the Orchestrator Agent via Agents SDK RPC
    const notifyAgent = async (status: string, percent: number) => {
      const stub = await getAgentByName(this.env.ORCHESTRATOR_AGENT, orchestratorAgentName);
      await stub.handleWorkflowProgress({ roleId, status, percent });
    };

    // Step 1: Score Bullets (placeholder — analyzeRole currently handles Phase 1 + 2)
    await step.do(
      "score-bullets",
      {
        retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
        timeout: "30 minutes",
      },
      async () => {
        // Phase 1 bullet scoring is currently bundled inside analyzeRole.
        // When we split phases, this step will call scoreBulletsTask directly.
        return { success: true };
      },
    );
    await step.do("notify-step-1", async () => await notifyAgent("score-bullets-complete", 25));

    // Step 2: Holistic Analysis
    await step.do(
      "holistic-analysis",
      {
        retries: { limit: 3, delay: "5 seconds" },
        timeout: "30 minutes",
      },
      async () => {
        await analyzeRole(this.env, roleId);
        return { success: true };
      },
    );
    await step.do("notify-step-2", async () => await notifyAgent("holistic-analysis-complete", 50));

    // Step 3: Resume Ideation
    await step.do(
      "resume-bullet-ideation",
      {
        retries: { limit: 3, delay: "5 seconds" },
        timeout: "30 minutes",
      },
      async () => {
        const db = getDb(this.env);
        const scoredBulletsContext = await buildScoredBulletsContext(this.env, roleId);

        const activeBullets = await getActiveBullets(this.env);
        const inventoryContext = activeBullets
          .map((b) => `[${b.category}] ${b.content}`)
          .join("\n");

        const context = `### Scored Job Requirements\n${scoredBulletsContext}\n### Candidate Bullet Inventory\n${inventoryContext}`;

        const result = await generateResumeBulletsTask(this.env, context);

        if (result.ideations.length > 0) {
          await db.delete(roleResumeBullets).where(eq(roleResumeBullets.roleId, roleId));

          for (const ideation of result.ideations) {
            const [inserted] = await db
              .insert(roleResumeBullets)
              .values({
                roleId,
                potentialResumeBullet: ideation.potential_resume_bullet,
                source: ideation.source as any,
                aiRationale: ideation.ai_rationale,
                interviewTip: ideation.interview_tip ?? null,
                category: ideation.category,
                impact: ideation.impact ?? null,
              })
              .returning();

            if (ideation.mapped_role_bullet_ids && ideation.mapped_role_bullet_ids.length > 0) {
              const maps = ideation.mapped_role_bullet_ids.map((rbId) => ({
                resumeBulletId: inserted.id,
                roleBulletId: rbId,
              }));
              await db.insert(roleResumeBulletsMap).values(maps);
            }
          }
        }
        return { success: true };
      },
    );
    await step.do("notify-step-3", async () => await notifyAgent("resume-ideation-complete", 75));

    // Step 4: Pattern Recognition
    await step.do(
      "pattern-recognition",
      {
        retries: { limit: 3, delay: "5 seconds" },
        timeout: "30 minutes",
      },
      async () => {
        const db = getDb(this.env);
        const scoredBulletsContext = await buildScoredBulletsContext(this.env, roleId);

        const result = await recognizePatternsTask(this.env, scoredBulletsContext);

        if (result.patterns.length > 0) {
          await db.delete(roleBulletPatterns).where(eq(roleBulletPatterns.roleId, roleId));

          for (const pattern of result.patterns) {
            const [inserted] = await db
              .insert(roleBulletPatterns)
              .values({
                roleId,
                observation: pattern.observation,
                recommendation: pattern.recommendation,
                insight: pattern.insight,
              })
              .returning();

            if (pattern.mapped_role_bullet_ids && pattern.mapped_role_bullet_ids.length > 0) {
              const maps = pattern.mapped_role_bullet_ids.map((rbId) => ({
                patternId: inserted.id,
                roleBulletId: rbId,
              }));
              await db.insert(roleBulletPatternMap).values(maps);
            }
          }
        }
        return { success: true };
      },
    );
    await step.do(
      "notify-step-4",
      async () => await notifyAgent("pattern-recognition-complete", 100),
    );

    return { roleId, status: "completed" };
  }
}
