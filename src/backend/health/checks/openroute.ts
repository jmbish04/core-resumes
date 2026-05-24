import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { HealthStepResult } from "@/backend/health/types";

import { BrowserRendering } from "@/backend/ai/tools/browser-rendering";
import { getDb } from "@/backend/db";
import { scoringRubrics } from "@/backend/db/schema";
import { GoogleMapsService } from "@/backend/services/google-maps";
import { OpenRouteService } from "@/backend/services/openroute";
import { RoleInsightsService } from "@/backend/services/role-insights";
import { getOpenRouteApiKey } from "@/backend/utils/secrets";

import { findSFAreaJob, isSFBayArea } from "./greenhouse-boards";

/**
 * Location extraction schema — accepts both a single string and an array
 * of strings (AI models return arrays for multi-location postings like
 * "San Francisco, CA | New York City, NY").
 *
 * The transform selects the best Bay Area location when available.
 */
/**
 * Location extraction schema — split into input (pure) and runtime (transforms).
 * BulletExtractionInputSchema is JSON-Schema-safe (no .transform()/.default()).
 */
const LocationExtractionInputSchema = z.object({
  location: z
    .union([z.string(), z.array(z.string())])
    .describe(
      "ALL job locations as an array of strings. If only one location, return a single-element array.",
    ),
  allLocations: z
    .union([z.string(), z.array(z.string())])
    .optional()
    .describe("All listed locations for diagnostic visibility"),
  californiaLocations: z
    .array(z.string())
    .optional()
    .describe("Only locations in California / SF Bay Area from the job posting"),
  workplaceType: z.string().optional().describe("remote, hybrid, or onsite"),
  rtoPolicy: z.string().optional().describe("Any RTO policy details"),
});

const LocationExtractionSchema = LocationExtractionInputSchema.transform((data) => {
  const location = (() => {
    const val = data.location;
    if (Array.isArray(val)) {
      const bayAreaLoc = val.find((loc) => isSFBayArea(loc));
      return bayAreaLoc ?? val[0] ?? "Unknown";
    }
    return val ?? "Unknown";
  })();

  const allLocations = (() => {
    const val = data.allLocations;
    if (!val) return undefined;
    if (Array.isArray(val)) return val;
    return [val];
  })();

  return {
    ...data,
    location,
    allLocations,
    californiaLocations: data.californiaLocations ?? [],
    workplaceType: data.workplaceType ?? "Unknown",
    rtoPolicy: data.rtoPolicy ?? "Unknown",
  };
});

export async function checkOpenRoute(env: Env): Promise<HealthStepResult> {
  const start = Date.now();
  const issues: string[] = [];
  const details: Record<string, unknown> = {};

  // 1. Check API Key
  try {
    const key = await getOpenRouteApiKey(env);
    if (!key || key.trim() === "") {
      throw new Error("API key is empty");
    }
    details.apiKeyStatus = "ok";
  } catch (e) {
    issues.push(`API Key missing or invalid: ${e instanceof Error ? e.message : String(e)}`);
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: issues.join("; "),
      details,
    };
  }

  // 2. Dynamic Greenhouse Job Selection (from D1 boards → SF Bay Area)
  let jobUrl = "";
  let jobTitle = "";
  let markdownContent = "";
  try {
    const boardResult = await findSFAreaJob(env);

    jobUrl = boardResult.job.absolute_url;
    jobTitle = boardResult.job.title;
    details.selectedJob = {
      id: boardResult.job.id,
      title: jobTitle,
      url: jobUrl,
      location: boardResult.job.location.name,
      boardToken: boardResult.boardToken,
      companyName: boardResult.companyName,
      source: boardResult.source,
      boardsChecked: boardResult.boardsChecked,
    };

    const browser = new BrowserRendering(env);
    markdownContent = await browser.extractMarkdown(jobUrl);
    if (markdownContent.length < 200) {
      throw new Error("Markdown extraction too short");
    }
  } catch (e) {
    issues.push(`Failed to fetch/extract job: ${e instanceof Error ? e.message : String(e)}`);
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: issues.join("; "),
      details,
    };
  }

  // 3. Extract Location Info via AI
  let locationData;
  try {
    const { AiProvider } = await import("@/backend/ai/providers/index");
    locationData = await new AiProvider(env).generateStructuredOutput({
      messages: [
        {
          role: "system",
          content: `Extract the location, workplace type, and RTO policy from this job posting.

IMPORTANT: The "location" field MUST be an array of ALL listed locations.
Examples:
- Single location: ["San Francisco, CA"]
- Multiple: ["San Francisco, CA", "New York City, NY", "Washington, DC"]

Also populate "allLocations" with the same array.
Also populate "californiaLocations" with ONLY the locations in California (especially San Francisco Bay Area cities). If no California locations exist, set to an empty array [].

You must respond with a valid JSON object matching the requested schema.
DO NOT wrap your response in markdown fences.`,
        },
        { role: "user", content: `Job Posting:\n\n${markdownContent}` },
      ],
      schema: LocationExtractionSchema,
      extractionSchema: LocationExtractionInputSchema,
      schemaName: "LocationData",
      temperature: 0,
      max_tokens: 1000,
    });
    details.extractedLocation = locationData;
  } catch (e) {
    issues.push(`AI Location Extraction failed: ${e instanceof Error ? e.message : String(e)}`);
    return {
      status: "fail",
      latencyMs: Date.now() - start,
      error: issues.join("; "),
      details,
    };
  }

  // 4. Commute calculation — strategy depends on whether location is Bay Area
  const homeAddress = "126 Colby St, San Francisco, CA 94134";
  const openRoute = new OpenRouteService(env);
  const db = getDb(env);
  let commuteSummaryStr = "";
  // Prefer California locations for commute targeting (user will never relocate)
  const caLocations = locationData.californiaLocations ?? [];
  const selectedLocation = caLocations.length > 0 ? caLocations[0] : locationData.location;
  const companyName = (details.selectedJob as any)?.companyName ?? "";
  const locationIsBayArea = isSFBayArea(selectedLocation);

  if (locationIsBayArea) {
    // Bay Area location → use Google Maps for precise company office geocoding
    details.commuteStrategy = "google_maps_bay_area";
    const searchQuery = `${companyName} ${selectedLocation}`.trim();
    details.googleMapsSearchQuery = searchQuery;

    try {
      const gmService = new GoogleMapsService(env);
      const gmResult = await gmService.computeCommute(homeAddress, searchQuery, details);
      commuteSummaryStr = gmResult.commuteSummary;
      details.openRouteStatus = "ok"; // Successfully obtained commute data (via Google Maps)
    } catch (e) {
      // Google Maps failed — fall back to OpenRoute geocoding
      details.googleMapsFallbackReason = e instanceof Error ? e.message : String(e);
      try {
        const summary = await openRoute.getCommuteSummary(homeAddress, selectedLocation);
        if (summary.success) {
          commuteSummaryStr = `OpenRoute API Driving Data: ${summary.distanceMiles.toFixed(1)} miles, ${summary.durationMinutes} minutes each way.`;
          details.openRouteResponse = summary;
          details.openRouteStatus = "ok";
        } else {
          throw new Error(summary.error);
        }
      } catch (orErr) {
        issues.push(
          `Commute calculation error: Google Maps failed (${e instanceof Error ? e.message : String(e)}), OpenRoute also failed (${orErr instanceof Error ? orErr.message : String(orErr)})`,
        );
        details.openRouteStatus = "fail";
        commuteSummaryStr = "Not available. Estimate using your geographic knowledge.";
      }
    }
  } else {
    // Non-Bay Area location → getCommuteSummary handles OpenRoute → Google Maps fallback internally
    details.commuteStrategy = "openroute_primary";
    try {
      const summary = await openRoute.getCommuteSummary(homeAddress, selectedLocation);
      if (summary.success) {
        const sourceLabel =
          summary.source === "google_maps" ? "Google Maps API (fallback)" : "OpenRoute API";
        commuteSummaryStr = `${sourceLabel} Driving Data: ${summary.distanceMiles.toFixed(1)} miles, ${summary.durationMinutes} minutes each way.`;
        details.openRouteResponse = summary;
        details.commuteSource = summary.source;
        details.openRouteStatus = "ok";
      } else {
        // Both APIs failed inside getCommuteSummary
        details.openRouteResponse = summary;
        issues.push(`Commute calculation error: ${summary.error}`);
        details.openRouteStatus = "fail";
        commuteSummaryStr = "Not available. Estimate using your geographic knowledge.";
      }
    } catch (e) {
      issues.push(`Commute calculation error: ${e instanceof Error ? e.message : String(e)}`);
      details.openRouteStatus = "fail";
      commuteSummaryStr = "Not available. Estimate using your geographic knowledge.";
    }
  }

  // 5. Test AI Location Insight with factual data (or fallback string)
  const roleInsightsService = new RoleInsightsService();
  let rubrics: any[] = [];
  try {
    rubrics = await db
      .select()
      .from(scoringRubrics)
      .where(and(eq(scoringRubrics.type, "location"), eq(scoringRubrics.isActive, true)));
  } catch (e) {
    issues.push(
      `Failed to fetch location scoring rubrics: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  const roleData = {
    jobTitle: jobTitle,
    companyName: (details.selectedJob as any)?.companyName ?? "Unknown",
  };
  const locData = {
    location: locationData.location,
    workplaceType: locationData.workplaceType,
    rtoPolicy: locationData.rtoPolicy,
  };

  if (rubrics.length > 0) {
    // Only run AI insight tests if we successfully retrieved commute data.
    if (details.openRouteStatus === "ok") {
      try {
        const insight = await roleInsightsService.executeLocationAI(
          env,
          roleData,
          locData,
          commuteSummaryStr,
          rubrics,
        );
        details.aiInsightScore = insight.score;
      } catch (e) {
        issues.push(`AI Insight generation failed: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 6. Test AI Location Insight explicitly simulating an API failure
      try {
        const fallbackInsight = await roleInsightsService.executeLocationAI(
          env,
          roleData,
          locData,
          "Not available. Estimate using your geographic knowledge.",
          rubrics,
        );
        details.fallbackInsightScore = fallbackInsight.score;
      } catch (e) {
        issues.push(
          `AI Fallback Insight generation failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    } else {
      details.aiInsightSkipped = `OpenRoute status is '${details.openRouteStatus}' — AI insight tests skipped to avoid false-positive Zod errors`;
    }
  }

  const status = issues.length > 0 ? (details.openRouteStatus === "fail" ? "fail" : "warn") : "ok";

  return {
    status,
    latencyMs: Date.now() - start,
    error: issues.length > 0 ? issues.join("; ") : undefined,
    details,
  };
}
