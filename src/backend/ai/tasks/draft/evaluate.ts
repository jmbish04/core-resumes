import { z } from "zod";

import type { DraftDocType } from "./types";

import type { Role } from "../../../db/schema";
import { embed } from "../embed";
import { getModelRegistry } from "../../models";
import { AiProvider } from "../../providers";
import { extractText } from "../../utils/extract-text";

interface ATSTags {
  programmingLanguagesAndFrameworks?: string[];
  testingAndQuality?: string[];
  engineeringPractices?: string[];
  businessDomain?: string[];
  infrastructureAndDevOps?: string[];
  impliedSkills?: string[];
}

interface RoleMetadata {
  requiredSkills?: unknown;
  preferredSkills?: unknown;
  requiredQualifications?: unknown;
  preferredQualifications?: unknown;
  responsibilities?: unknown;
  atsTags?: ATSTags;
}

/**
 * Default score returned when no keywords are defined for a role.
 * This assumes a baseline quality when there are no specific requirements to evaluate against.
 */
const DEFAULT_SCORE_NO_KEYWORDS = 75;

const ScoresSchema = z.object({
  keyword_coverage: z.number().min(0).max(100),
  relevance: z.number().min(0).max(100),
  impact: z.number().min(0).max(100).optional(),
  tone_match: z.number().min(0).max(100),
  cover_letter_quality: z.number().min(0).max(100).optional(),
});

const DraftEvalSchema = z.object({
  scores: ScoresSchema,
  critical_issues: z.array(z.string()).default([]),
  improvement_hints: z.array(z.string()).default([]),
});

export type DraftEval = z.infer<typeof DraftEvalSchema> & {
  overall: number;
  missingKeywords: string[];
  semanticScore: number;
  atsScore: number;
};

function cosineSimilarity(a: number[], b: number[]) {
  if (a.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function extractRoleKeywords(role: Role): string[] {
  const meta = (role.metadata as RoleMetadata | undefined) ?? {};

  const rawBuckets: unknown[] = [
    meta.requiredSkills,
    meta.preferredSkills,
    meta.requiredQualifications,
    meta.preferredQualifications,
    meta.responsibilities,
    meta.atsTags?.programmingLanguagesAndFrameworks,
    meta.atsTags?.testingAndQuality,
    meta.atsTags?.engineeringPractices,
    meta.atsTags?.businessDomain,
    meta.atsTags?.infrastructureAndDevOps,
    meta.atsTags?.impliedSkills,
  ];

  const keywords = rawBuckets
    .flatMap((b) => (Array.isArray(b) ? b : []))
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);

  // De-dupe case-insensitively, preserve original casing of first occurrence.
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const kw of keywords) {
    const key = kw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(kw);
  }

  return deduped;
}

function computeKeywordCoverage(text: string, keywords: string[]) {
  if (keywords.length === 0) return { score: DEFAULT_SCORE_NO_KEYWORDS, missing: [] as string[] };

  const lower = text.toLowerCase();
  const missing: string[] = [];
  let matched = 0;

  for (const keyword of keywords) {
    const k = keyword.toLowerCase().trim();
    if (!k) continue;

    const found =
      k.includes(" ")
        ? lower.includes(k)
        : new RegExp(`\\b${escapeRegExp(k)}\\b`, "i").test(text);

    if (found) matched++;
    else missing.push(keyword);
  }

  return {
    score: Math.round((matched / keywords.length) * 10000) / 100,
    missing,
  };
}

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function computeOverallScore(docType: DraftDocType, scores: z.infer<typeof ScoresSchema>) {
  if (docType === "resume") {
    const impact = scores.impact ?? 50;
    return (
      scores.keyword_coverage * 0.35 +
      scores.relevance * 0.3 +
      impact * 0.25 +
      scores.tone_match * 0.1
    );
  }

  if (docType === "cover_letter") {
    const cl = scores.cover_letter_quality ?? 50;
    return (
      scores.keyword_coverage * 0.25 +
      scores.relevance * 0.25 +
      scores.tone_match * 0.2 +
      cl * 0.3
    );
  }

  // email_reply (not used here yet)
  return scores.relevance * 0.5 + scores.tone_match * 0.5;
}

export async function evaluateDraft(opts: {
  env: Env;
  role: Role;
  docType: DraftDocType;
  draftContent: string;
  roleContext: string;
  keywordTargets?: string[];
}): Promise<DraftEval> {
  const { env, role, docType, draftContent, roleContext, keywordTargets } = opts;

  const provider = new AiProvider(env);
  const model = getModelRegistry(env).analyze;

  const keywords = (keywordTargets?.filter(Boolean) ?? []).length
    ? (keywordTargets ?? [])
    : extractRoleKeywords(role);

  const { score: atsScore, missing: missingKeywords } = computeKeywordCoverage(
    draftContent,
    keywords,
  );

  let semanticScore = 0;
  try {
    const [draftVec, roleVec] = await embed(env, {
      texts: [draftContent.slice(0, 4000), roleContext.slice(0, 4000)],
      cacheTtl: 60 * 60,
    });
    const sim = cosineSimilarity(draftVec ?? [], roleVec ?? []);
    semanticScore = Math.round(sim * 10000) / 100;
  } catch {
    semanticScore = 0;
  }

  const dimensions =
    docType === "resume"
      ? `keyword_coverage, relevance, impact, tone_match`
      : docType === "cover_letter"
        ? `keyword_coverage, relevance, tone_match, cover_letter_quality`
        : `relevance, tone_match`;

  const result = await provider.invokeModel(model, {
    messages: [
      {
        role: "system",
        content: `You are a ruthless expert hiring manager + ATS specialist evaluating a draft.

You MUST return ONLY valid JSON. No markdown. No preamble.

Score the draft on the requested dimensions (0-100), then list critical_issues (3-6) and improvement_hints (2-4).

Requested dimensions: ${dimensions}

JSON schema:
{
  "scores": {
    "keyword_coverage": number,
    "relevance": number,
    "impact": number,
    "tone_match": number,
    "cover_letter_quality": number
  },
  "critical_issues": string[],
  "improvement_hints": string[]
}`,
      },
      {
        role: "user",
        content: `Doc type: ${docType}
Company: ${role.companyName}
Title: ${role.jobTitle}

Role context:
${roleContext}

ATS keyword targets (sample):
${keywords.slice(0, 40).join(", ")}

Programmatic keyword coverage score (0-100): ${atsScore}
Semantic similarity score (0-100): ${semanticScore}

Missing keywords (sample):
${missingKeywords.slice(0, 30).join(", ") || "(none detected)"}

Draft content:
${draftContent}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 2048,
  });

  const text = extractText(result).trim();
  let parsed: z.infer<typeof DraftEvalSchema> | null = null;
  try {
    parsed = DraftEvalSchema.parse(JSON.parse(text));
  } catch {
    parsed = null;
  }

  const llmScores = parsed?.scores ?? {
    keyword_coverage: 50,
    relevance: 50,
    impact: docType === "resume" ? 50 : undefined,
    tone_match: 50,
    cover_letter_quality: docType === "cover_letter" ? 50 : undefined,
  };

  const fusedScores = {
    ...llmScores,
    keyword_coverage: Math.round((atsScore * 0.7 + llmScores.keyword_coverage * 0.3) * 100) / 100,
    relevance: Math.round((semanticScore * 0.5 + llmScores.relevance * 0.5) * 100) / 100,
  };

  const overall = Math.round(computeOverallScore(docType, fusedScores) * 100) / 100;

  return {
    scores: fusedScores,
    overall,
    critical_issues: parsed?.critical_issues ?? [],
    improvement_hints: parsed?.improvement_hints ?? [],
    missingKeywords,
    semanticScore,
    atsScore,
  };
}

