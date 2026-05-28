import { D1Database } from "@cloudflare/workers-types";
import { BenchmarkInput, Finding } from "../types";

export async function runAdjacentLevelsCheck(db: D1Database, input: BenchmarkInput): Promise<Finding> {
  return {
    benchmark: "vs_adjacent_levels",
    status: "insufficient_data", // stub
    confidence: "low",
    magnitude: null,
    supportingData: {},
    caveats: ["Stub implementation."],
  };
}
