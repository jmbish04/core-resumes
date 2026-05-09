import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/backend/db";
import { companies, roles } from "@/backend/db/schema";
import { generateStructuredAnalysis } from "@/backend/ai/providers";
import { enforceTokenLimit } from "@/backend/ai/utils/token-estimator";

// ---------------------------------------------------------------------------
// Output schema — structured response from Kimi K2.5
// ---------------------------------------------------------------------------

/** Schema for structured AI company analysis output. */
const CompanyAnalysisSchema = z.object({
  salaryTrends: z.string().describe("Description of salary trends across roles"),
  experienceTrends: z.string().describe("Description of experience level trends"),
  commonRequirements: z
    .array(z.string())
    .describe("List of commonly required skills across roles"),
  outliers: z.array(z.string()).describe("List of notable outliers or anomalies"),
  overallSummary: z.string().describe("High-level summary of company role trends"),
});

// ---------------------------------------------------------------------------
// analyzeCompany — uses Kimi K2.5 (256k context) via structured output
// ---------------------------------------------------------------------------

export async function analyzeCompany(env: Env, companyId: string) {
  const db = getDb(env);

  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) {
    throw new Error(`Company ${companyId} not found`);
  }

  const allRoles = await db
    .select()
    .from(roles)
    .where(eq(roles.companyId, companyId));

  if (allRoles.length === 0) {
    return null;
  }

  // Build the payload
  const rolesPayload = allRoles.map((r) => ({
    title: r.jobTitle,
    status: r.status,
    salaryMin: r.salaryMin,
    salaryMax: r.salaryMax,
    experienceMin: r.yearsExperienceMin,
    experienceMax: r.yearsExperienceMax,
    createdAt: r.createdAt,
    aboutRole: r.aboutRoleNarrative,
  }));

  // Kimi K2.5 has 256k context — generous but still enforce a sane ceiling
  const payloadStr = JSON.stringify(rolesPayload, null, 2);
  const safePayload = enforceTokenLimit(payloadStr, 200_000, "analyze-company");

  const insights = await generateStructuredAnalysis(env, {
    messages: [
      {
        role: "system",
        content: `You are an expert HR data analyst. You MUST respond with ONLY valid JSON — no prose, no markdown, no code fences.

Analyze the following roles processed for the company "${company.name}".
Identify trends and outliers across all these roles for this company.
Extract trends in:
- Salary (is it increasing, consistent, any high-paying outliers?)
- Job requirements (common keywords, experience levels requested)
- Application status progression (how many are interviewing vs rejected)
- Location or any other notable metrics.

<STRICT_OUTPUT_FORMAT>
Your response MUST be a single JSON object matching this exact schema:
{
  "salaryTrends": "string description of salary trends",
  "experienceTrends": "string description of experience trends",
  "commonRequirements": ["skill1", "skill2", ...],
  "outliers": ["outlier1", ...],
  "overallSummary": "string summary"
}
Do NOT include any text outside the JSON object.
</STRICT_OUTPUT_FORMAT>`,
      },
      {
        role: "user",
        content: `
          Roles Data:
          ${safePayload}
        `,
      },
    ],
    schema: CompanyAnalysisSchema,
    schemaName: "CompanyAnalysis",
    temperature: 0,
    max_tokens: 4096,
  });

  const updatedAttributes = {
    ...company.attributes,
    insights,
    lastAnalyzedAt: new Date().toISOString(),
  };

  await db
    .update(companies)
    .set({ attributes: updatedAttributes, updatedAt: new Date() })
    .where(eq(companies.id, companyId));

  return insights;
}
