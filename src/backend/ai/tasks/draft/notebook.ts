/**
 * @fileoverview NotebookLM-backed resume/cover-letter drafting pipeline.
 *
 * 4-phase pipeline:
 *   Phase 1 — Pre-Draft Consultation (NotebookLM: career evidence for this role)
 *   Phase 2 — AI Draft (Workers AI: draft document with NotebookLM evidence + bullets)
 *   Phase 3a — Accuracy Review (NotebookLM: verify factual accuracy)
 *   Phase 3b — Strategic Review (NotebookLM: positioning & strategy feedback)
 *   Phase 4 — Google Doc Creation (template render → upload → persist)
 *
 * Each phase stores interactions in career memory and broadcasts progress
 * via the provided callback.
 */

import { eq } from "drizzle-orm";

import type { DraftResult, DraftWithNotebookOpts } from "../types";

import { getDb } from "../../../db";
import { roles, documents, resumeBullets, type Role } from "../../../db/schema";
import { CareerMemoryService } from "../../../services/career-memory";
import { handleCreateBrandedDocFromTemplate } from "../../agents/orchestrator/methods/docs/google-docs";
import { getModelRegistry } from "../../models";
import { AiProvider } from "../../providers";
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
import { consultNotebook } from "../../tools/notebooklm/notebooklm";
import { extractText } from "../../utils/extract-text";
import { enforceTokenLimit } from "../../utils/token-estimator";

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export async function draftWithNotebook(opts: DraftWithNotebookOpts): Promise<DraftResult> {
  const { env, roleId, docType, onProgress } = opts;
  const progress = onProgress ?? (() => {});
  const memory = new CareerMemoryService(env);
  const provider = new AiProvider(env);
  const model = getModelRegistry(env).draft;
  const memoryIds: string[] = [];

  // Load role data
  const db = getDb(env);
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) throw new Error(`Role not found: ${roleId}`);

  // Load resume bullets
  const bullets = await db
    .select()
    .from(resumeBullets)
    .where(eq(resumeBullets.isActive, true))
    .orderBy(resumeBullets.category);

  const bulletsBlock =
    bullets.length > 0
      ? bullets
          .map((b) => {
            const metric = b.impactMetric ? ` (${b.impactMetric})` : "";
            return `[${b.category}]${metric} ${b.content}`;
          })
          .join("\n")
      : "";

  const roleContext = buildRoleContext(role);

  // ── Phase 1: Pre-Draft Consultation ─────────────────────────────────

  progress({ phase: "consulting", message: "Consulting career knowledge base..." });

  let preDraftEvidence = "";
  try {
    const preDraftQuery = `Given this ${role.jobTitle} role at ${role.companyName}, what are the most relevant experiences, projects, and achievements from my career history?

Role requirements:
${roleContext}

<STRICT_VERBATIM_EXTRACTION>
Please cite specific examples with dates, metrics, and outcomes. Do NOT summarize or shorten the facts.
</STRICT_VERBATIM_EXTRACTION>`;

    const preDraftResult = await consultNotebook(env, preDraftQuery);
    preDraftEvidence = preDraftResult.answer;

    memoryIds.push(
      await memory.remember({
        query: preDraftQuery,
        answer: preDraftEvidence,
        source: "notebooklm",
        agent: "orchestrator",
        category: docType === "resume" ? "resume_draft" : "cover_letter",
        roleId,
        references: preDraftResult.references ?? [],
        metadata: { phase: "pre_draft", docType },
      }),
    );
  } catch (error) {
    console.error("Pre-draft consultation failed, continuing with bullets only:", error);
  }

  // ── Phase 2: AI Draft ───────────────────────────────────────────────

  progress({
    phase: "drafting",
    message: `Drafting ${docType === "resume" ? "resume" : "cover letter"} content...`,
  });

  const systemPrompt = `You are Colby, an expert career assistant. Draft polished, truthful job-application content.
${preDraftEvidence ? `\n## Evidence from Career Knowledge Base\n${preDraftEvidence}` : ""}
${bulletsBlock ? `\n## Historical Performance Truths\n${bulletsBlock}` : ""}

Rules:
- Use ONLY verified facts from the evidence and bullets above
- Map accomplishments to the specific role requirements
- Include quantifiable metrics where available
- Write in a professional, compelling tone
- Format as a ${docType === "resume" ? "professional resume" : "cover letter"}`;

  const draftResult = await provider.invokeModel(model, {
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Draft a ${docType === "resume" ? "resume" : "cover letter"} for:\n\n${roleContext}`,
      },
    ],
    temperature: 0.4,
    max_tokens: 8096,
  });

  let draftContent = extractText(draftResult);

  // ── Phase 3a: Accuracy Review ───────────────────────────────────────

  progress({ phase: "accuracy_review", message: "Verifying factual accuracy..." });

  try {
    const accuracyQuery = `Review this ${docType === "resume" ? "resume" : "cover letter"} draft for factual accuracy against my career history.
Flag any inaccuracies, exaggerations, or claims that don't match my actual experience.

Role:
${role.jobTitle} at ${role.companyName}

Draft:
${draftContent}`;

    enforceTokenLimit(accuracyQuery, 120000, "Accuracy Review Query");

    const accuracyResult = await consultNotebook(env, accuracyQuery);

    memoryIds.push(
      await memory.remember({
        query: accuracyQuery,
        answer: accuracyResult.answer,
        source: "draft_review",
        agent: "orchestrator",
        category: docType === "resume" ? "resume_draft" : "cover_letter",
        roleId,
        references: accuracyResult.references ?? [],
        metadata: { phase: "accuracy_review", docType },
      }),
    );

    // Apply corrections if issues found
    if (
      accuracyResult.answer.toLowerCase().includes("inaccura") ||
      accuracyResult.answer.toLowerCase().includes("incorrect") ||
      accuracyResult.answer.toLowerCase().includes("not match")
    ) {
      const correctionResult = await provider.invokeModel(model, {
        messages: [
          {
            role: "system",
            content:
              "You are a career document editor. Apply the accuracy corrections to the draft. Only change factual inaccuracies — preserve tone and structure.",
          },
          {
            role: "user",
            content: `Draft:\n${draftContent}\n\nAccuracy feedback:\n${accuracyResult.answer}\n\nPlease apply all corrections and return the updated draft.`,
          },
        ],
        temperature: 0.2,
        max_tokens: 8096,
      });
      draftContent = extractText(correctionResult);
    }
  } catch (error) {
    console.error("Accuracy review failed, continuing with unchecked draft:", error);
  }

  // ── Phase 3b: Strategic Review ──────────────────────────────────────

  progress({ phase: "strategic_review", message: "Optimizing positioning..." });

  try {
    const strategyQuery = `Review this ${docType === "resume" ? "resume" : "cover letter"} for strategic positioning.
Are the strongest relevant experiences highlighted?
Any missing achievements that should be included?
Does the framing align with what this role is looking for?

Role:
${role.jobTitle} at ${role.companyName}

${docType === "resume" ? "Resume" : "Cover Letter"}:
${draftContent}`;

    enforceTokenLimit(strategyQuery, 120000, "Strategy Review Query");

    const strategyResult = await consultNotebook(env, strategyQuery);

    memoryIds.push(
      await memory.remember({
        query: strategyQuery,
        answer: strategyResult.answer,
        source: "draft_review",
        agent: "orchestrator",
        category: docType === "resume" ? "resume_draft" : "cover_letter",
        roleId,
        references: strategyResult.references ?? [],
        metadata: { phase: "strategic_review", docType },
      }),
    );

    // Apply strategic improvements
    if (strategyResult.answer.length > 50) {
      const improvedResult = await provider.invokeModel(model, {
        messages: [
          {
            role: "system",
            content:
              "You are a career strategist. Apply the strategic improvements to strengthen the draft. Only improve positioning — don't change verified facts.",
          },
          {
            role: "user",
            content: `Draft:\n${draftContent}\n\nStrategic feedback:\n${strategyResult.answer}\n\nPlease apply strategic improvements and return the updated draft.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 8096,
      });
      draftContent = extractText(improvedResult);
    }
  } catch (error) {
    console.error("Strategic review failed, continuing with accuracy-checked draft:", error);
  }

  // ── Phase 4: Google Doc Creation ────────────────────────────────────

  progress({ phase: "creating_doc", message: "Creating Google Doc..." });

  const templateType = docType === "resume" ? "resume" : "cover_letter";
  const docName = `${docType === "resume" ? "Resume" : "Cover Letter"} - ${role.companyName} - ${role.jobTitle}`;
  const folderId = role.driveFolderId ?? env.PARENT_DRIVE_FOLDER_ID;

  const createdDoc = await handleCreateBrandedDocFromTemplate(
    env,
    templateType,
    {
      content: draftContent,
      company: role.companyName,
      role: role.jobTitle,
      date: new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    },
    role.companyName,
    folderId,
    docName,
  );

  // Persist document record in D1
  const docId = crypto.randomUUID();
  const existingDocs = await db.select().from(documents).where(eq(documents.roleId, roleId));
  const version = existingDocs.filter((d) => d.type === docType).length + 1;

  await db.insert(documents).values({
    id: docId,
    gdocId: createdDoc.id,
    roleId,
    type: docType,
    version,
    name: docName,
  });

  progress({
    phase: "complete",
    message: `${docType === "resume" ? "Resume" : "Cover letter"} created successfully`,
    docId,
    gdocId: createdDoc.id,
    webViewLink: createdDoc.webViewLink,
  });

  return {
    content: draftContent,
    docId,
    gdocId: createdDoc.id,
    webViewLink: createdDoc.webViewLink,
    memoryIds,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRoleContext(role: Role): string {
  const meta = (role.metadata as Record<string, unknown>) ?? {};
  const parts = [`Company: ${role.companyName}`, `Title: ${role.jobTitle}`];

  if (meta.responsibilities)
    parts.push(`Responsibilities: ${JSON.stringify(meta.responsibilities)}`);
  if (meta.requiredQualifications)
    parts.push(`Required Qualifications: ${JSON.stringify(meta.requiredQualifications)}`);
  if (meta.preferredQualifications)
    parts.push(`Preferred Qualifications: ${JSON.stringify(meta.preferredQualifications)}`);
  if (meta.requiredSkills) parts.push(`Required Skills: ${JSON.stringify(meta.requiredSkills)}`);
  if (meta.location) parts.push(`Location: ${JSON.stringify(meta.location)}`);
  if (meta.workplaceType) parts.push(`Workplace: ${meta.workplaceType}`);
  if (meta.yearsExperienceMin) parts.push(`Min Years Experience: ${meta.yearsExperienceMin}`);
  if (meta.educationRequirements)
    parts.push(`Education: ${JSON.stringify(meta.educationRequirements)}`);

  return parts.join("\n");
}
