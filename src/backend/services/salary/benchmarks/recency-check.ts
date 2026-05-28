import { D1Database } from "@cloudflare/workers-types";
import { BenchmarkInput, Finding } from "../types";

export async function runRecencyCheck(db: D1Database, input: BenchmarkInput): Promise<Finding> {
  return {
    benchmark: "recency_check",
    status: "insufficient_data", // stub
    confidence: "low",
    magnitude: null,
    supportingData: {},
    caveats: ["Stub implementation."],
  };
}
