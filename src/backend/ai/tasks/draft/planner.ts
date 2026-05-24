import { z } from "zod";

import type { DraftDocType } from "./types";

import type { Role } from "../../../db/schema";
import { getModelRegistry } from "../../models";
import { getProvider } from "../../providers";
import { extractText } from "../../utils/extract-text";

const DraftPlanSchema = z.object({
  focusAreas: z.array(z.string()).default([]),
  keywordTargets: z.array(z.string()).default([]),
  docGuidance: z.string().default(""),
});

export type DraftPlan = z.infer<typeof DraftPlanSchema>;

export async function planDraft(opts: {
  env: Env;
  role: Role;
  docType: DraftDocType;
  roleContext: string;
  bulletsBlock: string;
}): Promise<DraftPlan> {
  const { env, role, docType, roleContext, bulletsBlock } = opts;
  const provider = await getProvider(env);
  const model = getModelRegistry(env).analyze;

  const result = await provider.invokeModel(model, {
    messages: [
      {
        role: "system",
        content: `You are a job application planning agent.

You produce a concise execution plan for drafting high-quality application materials.

Return ONLY valid JSON with this exact schema:
{
  "focusAreas": string[],
  "keywordTargets": string[],
  "docGuidance": string
}

Rules:
- focusAreas: 3-6 short items.
- keywordTargets: 10-30 ATS keyword targets, atomic where possible.
- docGuidance: 6-12 bullets worth of guidance written as a single string, using real new lines (not escaped).
- No markdown fences.`,
      },
      {
        role: "user",
        content: `Doc type: ${docType}
Company: ${role.companyName}
Title: ${role.jobTitle}

Role requirements/context:
${roleContext}

Candidate bullet inventory:
${bulletsBlock || "(none)"}`,
      },
    ],
    temperature: 0.2,
    max_tokens: 2048,
  });

  const text = extractText(result).trim();
  try {
    return DraftPlanSchema.parse(JSON.parse(text));
  } catch {
    // Best-effort fallback: planner output is advisory only.
    return { focusAreas: [], keywordTargets: [], docGuidance: "" };
  }
}

