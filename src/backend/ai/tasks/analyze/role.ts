/**
 * @fileoverview Role hireability analysis pipeline — two-phase AI task
 * that evaluates a candidate's fit for a role.
 *
 * Phase 1: Individual Bullet Scoring
 *  1. Load role_bullets from D1 (user-curated content from intake)
 *  2. Group by type, query NotebookLM for evidence per type
 *  3. Score each bullet individually via gpt-oss-120b structured output
 *  4. Persist to role_bullet_analyses with incremented revision_number
 *
 * Phase 2: Holistic Role Analysis
 *  1. Load freshly-scored bullet analyses as context
 *  2. Feed to gpt-oss-120b for holistic reasoning (cross-bullet compensation)
 *  3. Persist to role_analyses (version++) + role_alignment_scores (per-type summaries)
 */

import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { RoleBulletType } from "@/db/schemas/role-bullets";

import { getDb } from "@/db";
import {
  globalConfig,
  roleAlignmentScores,
  roleAnalyses,
  roleBulletAnalyses,
  roleBullets,
  ROLE_BULLET_TYPES,
  roles,
} from "@/db/schema";
import { generateStructuredOutput } from "@/backend/ai/providers";
import { kimi_k2_5 } from "@/backend/ai/models/kimi-k2.5";
import { consultNotebook } from "@/backend/ai/tools/notebooklm/notebooklm";
import { getActiveBullets } from "@/backend/ai/tasks/draft";


// ---------------------------------------------------------------------------
// Type labels for human-readable prompt sections
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  REQUIRED_QUALIFICATION: "Required Qualifications",
  PREFERRED_QUALIFICATION: "Preferred Qualifications",
  KEY_RESPONSIBILITY: "Key Responsibilities",
  EDUCATION_REQUIREMENT: "Education Requirements",
  REQUIRED_SKILL: "Required Skills",
  PREFERRED_SKILL: "Preferred Skills",
  BENEFIT: "Benefits",
};

// ---------------------------------------------------------------------------
// Phase 1 structured output schema — individual bullet scoring
// ---------------------------------------------------------------------------

const BulletScoringSchema = z.object({
  scores: z.array(
    z.object({
      bullet_id: z.number().describe("The database ID of the role_bullet being scored"),
      score: z.number().int().min(0).max(100).describe("Alignment score (0–100)"),
      rationale: z.string().describe("Evidence-based explanation of the alignment score"),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Phase 2 structured output schema — holistic analysis
// ---------------------------------------------------------------------------

const HolisticAnalysisSchema = z.object({
  hire_likelihood: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Overall likelihood-to-hire score (0–100)"),
  hire_score_rationale: z
    .string()
    .describe(
      "Detailed rationale for the hire score, referencing bullet analyses and cross-bullet compensation",
    ),
  compensation_score: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("Score comparing role compensation against candidate baseline (0–100)"),
  compensation_score_rationale: z
    .string()
    .describe("Rationale for compensation comparison, factoring base, stock, benefits, bonus"),
  future_promotion_path: z
    .number()
    .int()
    .describe("Estimated compensation for the next promotion level, computed as roughly 15-20% above the advertised max. Output as raw number (e.g., 280000)."),
  the_hook: z
    .string()
    .describe(
      "A punchy 1-2 sentence opening pitch that positions the candidate's unique value proposition for THIS specific role. Should reference specific metrics or outcomes.",
    ),
  strategic_recommendation: z
    .string()
    .describe(
      "Key strategies and talking points to win this role. Reference specific evidence from career history, identify which narratives to emphasize, and highlight compensating strengths for any gaps.",
    ),
  counter_positioning: z
    .string()
    .describe(
      "The 'JD Trap' analysis — identify whether this role truly needs a credentialed specialist or a pragmatic builder. Explain how the candidate's non-traditional background is actually an advantage, citing specific examples where builder mentality outperformed specialist credentials.",
    ),
  type_summaries: z.array(
    z.object({
      type: z.enum(ROLE_BULLET_TYPES).describe("Bullet type category"),
      score: z
        .number()
        .int()
        .min(0)
        .max(100)
        .describe("Holistic alignment score for this type (0–100)"),
      rationale: z.string().describe("Per-type rationale referencing individual bullet scores"),
      holistic_rationale: z
        .string()
        .describe(
          "Cross-bullet contextual reasoning — how strengths compensate for gaps within this type",
        ),
    }),
  ),
});

export type RoleAnalysisResult = z.infer<typeof HolisticAnalysisSchema>;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Perform a comprehensive two-phase hireability analysis for a role.
 *
 * Phase 1: Score individual role_bullets → role_bullet_analyses
 * Phase 2: Holistic analysis using bullet scores → role_analyses + role_alignment_scores
 *
 * @param env - Worker environment bindings
 * @param roleId - The role to analyze
 * @returns The persisted analysis ID
 */
export async function analyzeRole(env: Env, roleId: string): Promise<string> {
  const db = getDb(env);

  // Load role context
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) {
    throw new Error(`Role not found: ${roleId}`);
  }

  const jobContent = extractJobContent(role);

  // Load existing role_bullets
  const bulletRows = await db
    .select()
    .from(roleBullets)
    .where(eq(roleBullets.roleId, roleId))
    .orderBy(roleBullets.type, roleBullets.sortOrder);

  if (bulletRows.length === 0) {
    throw new Error(
      `Role ${roleId} has no role_bullets. Please add bullet items via the intake form before running analysis.`,
    );
  }

  // Load configuration
  const configRows = await db
    .select({ key: globalConfig.key, value: globalConfig.value })
    .from(globalConfig);

  const defaultsUsed: string[] = [];
  const getConfig = (key: string, fallback: string): string => {
    const row = configRows.find((r) => r.key === key);
    const hasUserValue = typeof row?.value === "string" && row.value.trim() !== "";
    if (!hasUserValue) {
      defaultsUsed.push(key);
    }
    return hasUserValue ? (row!.value as string) : fallback;
  };

  const notebookLmPrompt = getConfig(
    "notebooklm_prompt",
    "Based on my 13 years of performance reviews, accomplishments, AND my updated Career Stories / Agent Memory, what specific evidence supports my qualification for the following {{label}}s?\n\n{{itemsList}}\n\nFor each item, cite specific examples, metrics, or achievements. Ensure you prioritize recent Agent Memory context if it directly addresses the requirement.",
  );
  const compensationBaseline = getConfig(
    "compensation_baseline",
    "Previous role at Google: $176,000 base salary",
  );
  const careerStories = getConfig("career_stories", "");

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: Individual Bullet Scoring
  // ═══════════════════════════════════════════════════════════════════════════

  // Group bullets by type for NotebookLM queries
  const typeGroups = groupBy(bulletRows, (b) => b.type);

  // Query NotebookLM for evidence per type
  const evidenceByType: Record<string, string> = {};
  for (const [type, items] of Object.entries(typeGroups)) {
    const query = buildNotebookQuery(
      type,
      items.map((i) => i.content),
      notebookLmPrompt,
    );
    try {
      const consultation = await consultNotebook(env, query);
      evidenceByType[type] = consultation.answer;
    } catch {
      evidenceByType[type] = "(NotebookLM unavailable — scoring based on resume bullets only)";
    }
  }

  // Load resume bullets for additional context
  const resumeBulletRows = await getActiveBullets(env);
  const resumeBulletsContext =
    resumeBulletRows.length > 0
      ? resumeBulletRows.map((b) => `[${b.category}] ${b.content}`).join("\n")
      : "(No resume bullets available)";

  // Score each bullet individually
  const bulletScoring = await generateStructuredOutput(env, {
    messages: [
      {
        role: "system",
        content: buildPhase1SystemPrompt(),
      },
      {
        role: "user",
        content: buildPhase1UserPrompt(
          bulletRows,
          evidenceByType,
          resumeBulletsContext,
          role,
          jobContent,
          careerStories,
        ),
      },
    ],
    schema: BulletScoringSchema,
    schemaName: "BulletScoring",
    temperature: 0,
    max_tokens: 8096,
    model: kimi_k2_5,
  });

  // Determine next revision_number per bullet
  const existingRevisions = await db
    .select({
      bulletId: roleBulletAnalyses.bulletId,
      maxRevision: sql<number>`MAX(${roleBulletAnalyses.revisionNumber})`,
    })
    .from(roleBulletAnalyses)
    .where(
      sql`${roleBulletAnalyses.bulletId} IN (${sql.join(
        bulletRows.map((b) => sql`${b.id}`),
        sql`, `,
      )})`,
    )
    .groupBy(roleBulletAnalyses.bulletId);

  const maxRevisionByBullet = new Map<number, number>();
  for (const row of existingRevisions) {
    maxRevisionByBullet.set(row.bulletId, row.maxRevision);
  }

  // Persist Phase 1 scores
  const bulletAnalysisRows = bulletScoring.scores
    .filter((s) => bulletRows.some((b) => b.id === s.bullet_id))
    .map((s) => ({
      bulletId: s.bullet_id,
      revisionNumber: (maxRevisionByBullet.get(s.bullet_id) ?? 0) + 1,
      aiScore: s.score,
      aiRationale: s.rationale,
    }));

  if (bulletAnalysisRows.length > 0) {
    // D1 does not support multi-row INSERT with NULL autoincrement PKs.
    // Batch individual inserts instead.
    const stmts = bulletAnalysisRows.map((row) =>
      db.insert(roleBulletAnalyses).values(row),
    );
    type Stmt = (typeof stmts)[number];
    await db.batch(stmts as unknown as [Stmt, ...Stmt[]]);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: Holistic Role Analysis
  // ═══════════════════════════════════════════════════════════════════════════

  // Build scored bullets context for the holistic prompt
  const scoredBulletsContext = bulletRows.map((b) => {
    const scoring = bulletScoring.scores.find((s) => s.bullet_id === b.id);
    return {
      id: b.id,
      type: b.type,
      content: b.content,
      score: scoring?.score ?? 0,
      rationale: scoring?.rationale ?? "Not scored",
    };
  });

  const holisticAnalysis = await generateStructuredOutput(env, {
    messages: [
      {
        role: "system",
        content: buildPhase2SystemPrompt(compensationBaseline),
      },
      {
        role: "user",
        content: buildPhase2UserPrompt(
          scoredBulletsContext,
          evidenceByType,
          resumeBulletsContext,
          role,
          jobContent,
          careerStories,
        ),
      },
    ],
    schema: HolisticAnalysisSchema,
    schemaName: "HolisticAnalysis",
    temperature: 0,
    max_tokens: 8096,
    model: kimi_k2_5,
  });

  // Compute next version number
  const existingAnalyses = await db
    .select({ id: roleAnalyses.id })
    .from(roleAnalyses)
    .where(eq(roleAnalyses.roleId, roleId));
  const nextVersion = existingAnalyses.length + 1;

  // Persist Phase 2 — role_analyses
  const analysisId = crypto.randomUUID();
  await db.insert(roleAnalyses).values({
    id: analysisId,
    roleId,
    version: nextVersion,
    hireScore: holisticAnalysis.hire_likelihood,
    hireRationale: holisticAnalysis.hire_score_rationale,
    compensationScore: holisticAnalysis.compensation_score,
    compensationRationale: holisticAnalysis.compensation_score_rationale,
    futurePromotionPath: holisticAnalysis.future_promotion_path,
    theHook: holisticAnalysis.the_hook,
    strategicRecommendation: holisticAnalysis.strategic_recommendation,
    counterPositioning: holisticAnalysis.counter_positioning,
    configNotebooklmPrompt: notebookLmPrompt,
    configCompensationBaseline: compensationBaseline,
    configCareerStories: careerStories,
    usedDefaults: defaultsUsed.length > 0,
  });

  // Persist Phase 2 — role_alignment_scores (holistic per-type summaries)
  if (holisticAnalysis.type_summaries.length > 0) {
    await db.insert(roleAlignmentScores).values(
      holisticAnalysis.type_summaries.map((summary) => ({
        id: crypto.randomUUID(),
        analysisId,
        roleId,
        type: summary.type,
        content: TYPE_LABELS[summary.type] ?? summary.type,
        score: summary.score,
        rationale: summary.rationale,
        holisticRationale: summary.holistic_rationale,
      })),
    );
  }

  return analysisId;
}

// ---------------------------------------------------------------------------
// Phase 1 prompt builders
// ---------------------------------------------------------------------------

function buildPhase1SystemPrompt(): string {
  return `You are an expert career analyst scoring individual job requirement bullets against a candidate's career evidence.

You will receive:
1. A list of role_bullets (each with a database ID, type, and content)
2. Evidence from the candidate's 13-year career history (via NotebookLM) grouped by type
3. The candidate's verified resume accomplishments
4. (Optional) Career Stories & Agent Memory — curated context provided by the candidate

<CAREER_STORIES_OVERRIDE_POLICY>
IMPORTANT: If a section titled "Career Stories & Agent Memory (OVERRIDES)" is present in the user prompt, treat its contents as absolute, verified factual evidence with the HIGHEST priority. This context represents corrections, clarifications, and supplementary evidence the candidate has explicitly verified.

When Agent Memory provides context that bridges a gap — for example, mapping a proprietary tool name to a well-known equivalent (e.g., AppMaker → AppSheet), detailing recent independent projects (MCP servers, Claude integrations), or providing specific metrics ($16M savings, 300% adoption) — you MUST incorporate this evidence and score accordingly in the 75-100 range.

Do NOT penalize a bullet for "lack of direct evidence" if the Agent Memory directly addresses that requirement.
</CAREER_STORIES_OVERRIDE_POLICY>

Score EACH bullet individually (0–100) based on evidence strength:
- 90–100 (Exceptional): Direct, verified evidence WITH specific metrics or outcomes
- 75–89 (Strong Alignment): Clear, verifiable evidence of capability
- 40–74 (Moderate Alignment): Partial evidence or transferable experience
- 0–39 (Gap Identified): Little to no evidence; candidate needs to position differently

Be honest and evidence-based. Cite specific examples in your rationale.
When Agent Memory overrides are present, explicitly reference them in your rationale.
Score every bullet — do not skip any.

You must respond with a valid JSON object matching the requested schema exactly. Use the exact key names: "scores", "bullet_id", "score", "rationale".
DO NOT wrap your response in markdown fences.
EXAMPLE FORMAT:
{
  "scores": [
    {
      "bullet_id": 123,
      "score": 85,
      "rationale": "..."
    }
  ]
}`;
}

function buildPhase1UserPrompt(
  bullets: Array<{ id: number; type: string; content: string }>,
  evidenceByType: Record<string, string>,
  resumeBulletsContext: string,
  role: typeof roles.$inferSelect,
  jobContent: string | null,
  careerStories: string,
): string {
  const sections = [`## Job: ${role.jobTitle} at ${role.companyName}`];

  if (jobContent) {
    sections.push("", "## Full Job Posting", jobContent);
  }

  // Career Stories BEFORE bullets so the LLM has full context when scoring
  if (careerStories) {
    sections.push(
      "",
      "## Career Stories & Agent Memory (OVERRIDES)",
      "The following context has been explicitly verified by the candidate. Treat as ground truth.",
      careerStories,
    );
  }

  sections.push(
    "",
    "## Role Bullets to Score",
    ...bullets.map((b) => `- [ID: ${b.id}] [${b.type}] ${b.content}`),
    "",
    "## Evidence from Career History (NotebookLM)",
    ...Object.entries(evidenceByType).map(
      ([type, evidence]) => `### ${TYPE_LABELS[type] ?? type}\n${evidence}`,
    ),
    "",
    "## Verified Resume Accomplishments",
    resumeBulletsContext,
  );

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Phase 2 prompt builders
// ---------------------------------------------------------------------------

function buildPhase2SystemPrompt(compensationBaseline: string): string {
  return `You are an expert career analyst and executive coach performing a holistic hireability assessment.

You have individual bullet-level scores from Phase 1. Your job is to:
1. Consider how different bullet scores interact within each type category
2. Identify where strengths in some bullets compensate for gaps in others
3. Provide holistic per-type analysis that captures the full picture
4. Compute an overall hire_likelihood considering all types together
5. Craft a compelling opening pitch (the_hook)
6. Develop strategic recommendations for winning this role
7. Analyze the "JD Trap" — counter-positioning the candidate's non-traditional background as an advantage

<IMPLICIT_SKILL_MAPPING>
When evaluating the job posting and candidate alignment, you MUST infer hard skills from contextual phrasing. Do NOT limit your analysis to explicitly named technologies. Apply these mappings:
  - "high traffic" / "large scale" → scalability, high availability, load balancing
  - "multiple services" / "service-oriented" → distributed systems, microservices, API design
  - "complex codebase" / "legacy systems" → complex systems thinking, refactoring, code archaeology
  - "fast-paced" / "startup" → rapid prototyping, agile, MVP development
  - "data-driven decisions" → analytics, A/B testing, metrics instrumentation
  - "cross-functional" → stakeholder management, technical communication, bridging domains
  - "compliance" / "regulated environment" → audit trails, security, governance frameworks
  - "enterprise" → scalability, SSO/SAML, multi-tenancy, SLA management

Apply this skill inference when scoring the candidate's alignment, especially for requirements that use contextual language rather than explicit technology names.
</IMPLICIT_SKILL_MAPPING>

<ATS_TAXONOMY_EVALUATION>
When computing hire_likelihood and counter_positioning, evaluate the candidate's coverage across ALL 5 ATS taxonomy categories:
  1. Programming Languages & Frameworks — Does the candidate have evidence of the core languages/frameworks?
  2. Testing & Quality — Does the candidate demonstrate testing discipline (TDD, CI/CD, code review)?
  3. Engineering Practices — Does the candidate show mastery of architectural patterns (SOLID, DDD, microservices)?
  4. Business Domain — Does the candidate have experience in the role's industry vertical (SaaS, fintech, legaltech)?
  5. Infrastructure & DevOps — Does the candidate understand deployment, cloud, and operational tooling?

Weight each category proportionally to how prominently it appears in the job posting. A role emphasizing "microservices architecture" should weight Engineering Practices higher than one focused on "data analysis."
</ATS_TAXONOMY_EVALUATION>

Candidate Context:
- 12+ years at Google as a "0-to-1" intrapreneur
- Ships platform-critical tools (saving $16M annually, boosting adoption 300%)
- Bridges Legal, Engineering, and Business domains — the "Translator"
- No formal Law Degree (JD), which keeps the candidate ROI-focused and pragmatic
- Built a "Shadow Ecosystem" of custom apps that users voluntarily adopted over official tools
- Reduced time-to-matter creation by 70%
- Validated the need for a 55+ person engineering team through solo prototype work

Key guidance for holistic_rationale:
- If a bullet scored low in isolation, consider whether other strong bullets within the same type (or across types) make the gap less impactful
- Consider what a hiring manager would weigh most heavily — required qualifications and key responsibilities matter more than preferred items
- Reference specific bullet scores and explain compensating factors

Key guidance for the_hook:
- Must be 1-2 sentences maximum
- Must reference at least one specific metric ($16M, 300%, 70%)
- Must be tailored to THIS role, not generic
- Think of it as the first line of a cold email to the hiring manager

Key guidance for counter_positioning:
- Analyze whether this role truly needs a credentialed specialist (e.g., JD/law degree) or a pragmatic builder
- If the JD lists a law degree, explain why the candidate's builder mentality is BETTER than credentials for this role
- Reference specific examples where the candidate's approach outperformed traditional credentialed approaches
- If no credential gap exists, analyze other potential "trap" qualifications and how to reframe them

Key guidance for strategic_recommendation:
- Provide 3-5 specific talking points or strategies
- Each should reference concrete evidence from career history
- Include which narratives to emphasize and which to de-emphasize
- Identify the strongest compensating factors for any gaps

Scoring tiers:
- 75–100 (Strong Alignment): Clear evidence, candidate is well-positioned
- 40–74 (Moderate Alignment): Partial evidence, positioning possible with the right framing
- 0–39 (Gap Identified): Significant gap, may need mitigation strategy

Compensation baseline for comparison: ${compensationBaseline}
For compensation_score: 50 = equivalent, >50 = role pays more, <50 = role pays less.

Weight required qualifications and key responsibilities more heavily than preferred items.

You must respond with a valid JSON object matching the requested schema. DO NOT wrap your response in markdown fences.`;
}

function buildPhase2UserPrompt(
  scoredBullets: Array<{
    id: number;
    type: string;
    content: string;
    score: number;
    rationale: string;
  }>,
  evidenceByType: Record<string, string>,
  resumeBulletsContext: string,
  role: typeof roles.$inferSelect,
  jobContent: string | null,
  careerStories: string,
): string {
  const grouped = groupBy(scoredBullets, (b) => b.type);

  const sections = [`## Job: ${role.jobTitle} at ${role.companyName}`];

  if (jobContent) {
    sections.push("", "## Full Job Posting", jobContent);
  }

  sections.push("", "## Phase 1 Bullet Analyses (Individual Scores)");

  for (const [type, items] of Object.entries(grouped)) {
    sections.push(
      "",
      `### ${TYPE_LABELS[type] ?? type}`,
      ...items.map((b) => `- [Score: ${b.score}/100] ${b.content}\n  Rationale: ${b.rationale}`),
    );
  }

  sections.push(
    "",
    "## NotebookLM Evidence Summary",
    ...Object.entries(evidenceByType).map(
      ([type, evidence]) => `### ${TYPE_LABELS[type] ?? type}\n${evidence}`,
    ),
  );

  if (careerStories) {
    sections.push("", "## Career Stories", careerStories);
  }

  sections.push("", "## Verified Resume Accomplishments", resumeBulletsContext);

  if (role.salaryMin || role.salaryMax) {
    sections.push(
      "",
      "## Salary Information",
      `Range: ${role.salaryCurrency ?? "USD"} ${role.salaryMin ?? "?"} – ${role.salaryMax ?? "?"}`,
    );
  }

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract job posting text from the role's metadata or roleInstructions.
 */
function extractJobContent(role: typeof roles.$inferSelect): string | null {
  const meta = role.metadata;

  // Try metadata.jobDescription first, then metadata.rawHtml/rawText
  if (meta) {
    if (typeof meta.jobDescription === "string" && meta.jobDescription.length > 0) {
      return meta.jobDescription;
    }
    if (typeof meta.rawText === "string" && meta.rawText.length > 0) {
      return meta.rawText;
    }
    if (typeof meta.rawHtml === "string" && meta.rawHtml.length > 0) {
      return meta.rawHtml;
    }
  }

  // Fall back to roleInstructions if it contains a pasted job posting
  if (role.roleInstructions && role.roleInstructions.length > 100) {
    return role.roleInstructions;
  }

  return null;
}

/**
 * Build a targeted NotebookLM query for a specific category of requirements.
 */
function buildNotebookQuery(type: string, items: string[], promptTemplate: string): string {
  const label = TYPE_LABELS[type] ?? type.replace(/_/g, " ");
  const itemsList = items.map((item, i) => `${i + 1}. ${item}`).join("\n");

  return promptTemplate.replace("{{label}}", label).replace("{{itemsList}}", itemsList);
}

/**
 * Group an array by a key function.
 */
function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of arr) {
    const key = keyFn(item);
    (groups[key] ??= []).push(item);
  }
  return groups;
}