/**
 * @fileoverview Multi-Agent Location Analysis Task
 *
 * Uses the OpenAI Agents SDK to orchestrate two specialist agents:
 *   1. CommuteAgent — generates a structured 27-row commute table from factual API data
 *   2. LocationAnalystAgent — scores location (0–100), writes rationale, assesses workplace
 *
 * Agents run sequentially: CommuteAgent produces the table, which feeds into
 * LocationAnalystAgent for holistic scoring.
 *
 * All requests route through Cloudflare AI Gateway /compat → Workers AI.
 */

import { Agent, Runner } from "@openai/agents";
import { z } from "zod";
import {
  getAIGatewayCompatClient,
  AIGatewayModelProvider,
  WORKERS_AI_GPT_OSS,
} from "../../providers/ai-gateway-compat";

// ---------------------------------------------------------------------------
// Output schemas
// ---------------------------------------------------------------------------

const CommuteRowSchema = z.object({
  direction: z.enum(["to_office", "to_home"]).describe("Whether commuting to office or back home"),
  departure_time: z.string().describe("Departure time, e.g. '8:30 AM', '5:00 PM'"),
  mode: z.string().describe("Transportation mode, e.g. 'Driving (Tesla Model 3)', 'BART + Walk', 'Muni + Walk'"),
  duration_minutes: z.number().nullable().describe("Estimated door-to-door commute duration in minutes"),
  monthly_cost: z.number().nullable().describe("Estimated monthly cost for this commute mode at full-time frequency"),
});

const LocationInsightSchema = z.object({
  score: z.number().int().min(0).max(100).describe("Location score 0–100"),
  rationale: z.string().describe("Detailed rationale for the location score"),
  commute_table: z.array(CommuteRowSchema).describe("Full commute grid"),
  workplace_assessment: z.string().describe("Assessment of WFH/hybrid/onsite fit"),
});

export type LocationInsight = z.infer<typeof LocationInsightSchema>;

// ---------------------------------------------------------------------------
// Agent definitions (constructed per-invocation with dynamic context)
// ---------------------------------------------------------------------------

function createCommuteAgent() {
  return new Agent({
    name: "CommuteAgent",
    model: WORKERS_AI_GPT_OSS,
    instructions: `You are a commute data specialist. Your ONLY job is to generate a precise commute table.

You will receive factual driving data from routing APIs and must produce a grid of commute entries.

Rules:
1. Generate ALL requested rows — never truncate or summarize
2. Each row must have: direction, departure_time, mode, duration_minutes, monthly_cost
3. Duration must be DOOR-TO-DOOR (include walking to/from stations, waiting, transfers)
4. Monthly cost assumes 3 days/week in-office frequency
5. Use factual API data as baseline for driving, adjust transit estimates proportionally
6. For public transit modes, add 10-15 min walking buffer and estimate realistic transfer times
7. Return ONLY valid JSON — no markdown fences, no explanatory text

MORNING DEPARTURES (direction: "to_office"):
- Departure times: 8:30 AM, 9:00 AM, 9:30 AM, 10:00 AM
- Modes for EACH time: "Driving (Tesla Model 3)", "BART + Walk", "Muni + Walk"
- Total: 12 morning rows

EVENING DEPARTURES (direction: "to_home"):
- Departure times: 4:00 PM, 4:30 PM, 5:00 PM, 5:30 PM, 6:00 PM
- Modes for EACH time: "Driving (Tesla Model 3)", "BART + Walk", "Muni + Walk"
- Total: 15 evening rows

You MUST produce exactly 27 rows total.`,
    modelSettings: {
      temperature: 0,
      maxTokens: 8096,
    },
  });
}

function createLocationAnalystAgent() {
  return new Agent({
    name: "LocationAnalystAgent",
    model: WORKERS_AI_GPT_OSS,
    instructions: `You are a career location analyst evaluating job opportunities for Justin, a tech professional based in San Francisco (94134, 126 Colby St).

Justin's commute preferences:
- Strongly prefers WFH (work from home)
- Acceptable: hybrid 2 days/week with short commute
- Benchmark: 7 years commuting SF→Mountain View via Google Bus (free transit)
- Currently drives a Tesla Model 3
- Has access to BART and Muni for public transit

Your job is to:
1. Analyze the commute data provided
2. Score the location 0–100 based on the scoring rubrics
3. Write a detailed rationale explaining the score
4. Provide a workplace assessment evaluating WFH/hybrid/onsite fit

Be precise and analytical. Factor in: commute time distribution, cost impact, frequency requirements, and quality of life.

Return ONLY valid JSON — no markdown fences, no explanatory text.`,
    modelSettings: {
      temperature: 0,
      maxTokens: 8096,
    },
  });
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export type LocationAnalysisInput = {
  roleData: { jobTitle: string; companyName: string };
  locationData: { location: string; workplaceType: string; rtoPolicy: string };
  commuteFactualData: string;
  rubrics: Array<{ criteria: string; scoreRangeMin: number; scoreRangeMax: number }>;
};

/**
 * Run the multi-agent location analysis pipeline.
 *
 * Phase 1: CommuteAgent generates the 27-row commute table
 * Phase 2: LocationAnalystAgent scores and writes rationale using the commute data
 *
 * @returns Merged LocationInsight matching the existing executeLocationAI shape
 * @throws If either agent fails (caller should implement fallback)
 */
export async function runLocationAnalysisAgents(
  env: Env,
  input: LocationAnalysisInput,
): Promise<LocationInsight> {
  // Build the AI Gateway-routed model provider
  const client = await getAIGatewayCompatClient(env);
  const modelProvider = new AIGatewayModelProvider(client);
  const runner = new Runner({ modelProvider });

  const { roleData, locationData, commuteFactualData, rubrics } = input;

  const rubricText = rubrics
    .map((r) => `- ${r.criteria}: ${r.scoreRangeMin}–${r.scoreRangeMax}`)
    .join("\n");

  // ─── Phase 1: Commute Table Generation ────────────────────────────────
  const commutePrompt = `Generate the commute table for:
Role: ${roleData.jobTitle} at ${roleData.companyName}
Office Location: ${locationData.location}
Workplace Type: ${locationData.workplaceType}

Factual Commute Data from routing APIs:
${commuteFactualData}

Produce a JSON object with a single key "commute_table" containing an array of exactly 27 commute row objects.`;

  const commuteAgent = createCommuteAgent();

  const commuteResult = await runner.run(commuteAgent, commutePrompt, {
    maxTurns: 1,
  });

  // Extract text output from the agent result
  const commuteText = extractTextOutput(commuteResult);
  const commuteData = parseAgentJson(commuteText);

  // Validate the commute table shape
  const commuteTable = Array.isArray(commuteData?.commute_table)
    ? commuteData.commute_table
    : Array.isArray(commuteData)
      ? commuteData
      : [];

  if (commuteTable.length === 0) {
    throw new Error("CommuteAgent returned empty commute table");
  }

  console.log(
    `[analyze-location] CommuteAgent produced ${commuteTable.length} rows`,
  );

  // ─── Phase 2: Location Scoring ────────────────────────────────────────
  const analystPrompt = `Analyze this location for the following role and produce a score, rationale, and workplace assessment.

Role: ${roleData.jobTitle} at ${roleData.companyName}
Location: ${locationData.location}
Workplace Type: ${locationData.workplaceType}
RTO Policy: ${locationData.rtoPolicy}

Scoring Rubrics:
${rubricText}

Commute Data (from routing APIs + CommuteAgent analysis):
${JSON.stringify(commuteTable, null, 2)}

Produce a JSON object with keys: "score" (number 0-100), "rationale" (string), "workplace_assessment" (string).`;

  const analystAgent = createLocationAnalystAgent();

  const analystResult = await runner.run(analystAgent, analystPrompt, {
    maxTurns: 1,
  });

  const analystText = extractTextOutput(analystResult);
  const analystData = parseAgentJson(analystText);

  // ─── Merge & Validate ─────────────────────────────────────────────────
  const merged = {
    score: analystData?.score ?? 0,
    rationale: analystData?.rationale ?? "",
    commute_table: commuteTable,
    workplace_assessment: analystData?.workplace_assessment ?? "",
  };

  // Validate with Zod (with .catch fallbacks for resilience)
  const SafeLocationInsightSchema = z.object({
    score: z.number().int().min(0).max(100).optional().default(0).catch(0),
    rationale: z.string().optional().default("").catch(""),
    commute_table: z.array(
      z.object({
        direction: z.enum(["to_office", "to_home"]).optional().default("to_office").catch("to_office"),
        departure_time: z.string().optional().default("").catch(""),
        mode: z.string().optional().default("").catch(""),
        duration_minutes: z.number().nullable().optional().default(null).catch(null),
        monthly_cost: z.number().nullable().optional().default(null).catch(null),
      }),
    ).optional().default([]).catch([]),
    workplace_assessment: z.string().optional().default("").catch(""),
  });

  const validated = SafeLocationInsightSchema.parse(merged);

  console.log(
    `[analyze-location] Pipeline complete — score: ${validated.score}, rows: ${validated.commute_table.length}`,
  );

  return validated;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the final text content from a RunResult.
 * The SDK wraps output in RunMessageOutputItem objects.
 */
function extractTextOutput(result: any): string {
  // result.finalOutput is the text when no output_type is set
  if (typeof result.finalOutput === "string") {
    return result.finalOutput;
  }

  // Walk output items looking for message text
  if (Array.isArray(result.output)) {
    for (const item of result.output) {
      if (item?.type === "message" && item?.rawItem?.content) {
        for (const content of item.rawItem.content) {
          if (content.type === "output_text" || content.type === "text") {
            return content.text ?? "";
          }
        }
      }
    }
  }

  return typeof result.finalOutput === "object"
    ? JSON.stringify(result.finalOutput)
    : String(result.finalOutput ?? "");
}

/**
 * Parse JSON from agent text output. Strips markdown fences if present.
 */
function parseAgentJson(text: string): any {
  // Strip markdown code fences
  const cleaned = text
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Try to find JSON object/array in the text
    const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    throw new Error(`Failed to parse agent JSON output: ${cleaned.slice(0, 200)}`);
  }
}
