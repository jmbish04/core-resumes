import { D1Database } from "@cloudflare/workers-types";
import { BenchmarkInput, Finding } from "../types";

export async function runPeerCompaniesCheck(db: D1Database, input: BenchmarkInput): Promise<Finding> {
  return {
    benchmark: "vs_peer_companies",
    status: "insufficient_data", // stub
    confidence: "low",
    magnitude: null,
    supportingData: {},
    caveats: ["Stub implementation."],
  };
}
