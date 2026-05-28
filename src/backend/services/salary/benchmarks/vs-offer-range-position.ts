import { D1Database } from "@cloudflare/workers-types";
import { BenchmarkInput, Finding } from "../types";

export async function runOfferRangePositionCheck(db: D1Database, input: BenchmarkInput): Promise<Finding> {
  if (!input.salaryMin || !input.salaryMax) {
    return {
      benchmark: "vs_offer_range_position",
      status: "insufficient_data",
      confidence: "low",
      magnitude: null,
      supportingData: {},
    };
  }
  
  return {
    benchmark: "vs_offer_range_position",
    status: "at", // stub
    confidence: "low",
    magnitude: null,
    supportingData: {},
    caveats: ["Stub implementation."],
  };
}
