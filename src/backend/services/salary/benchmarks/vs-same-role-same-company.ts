import { D1Database } from "@cloudflare/workers-types";
import { BenchmarkInput, Finding } from "../types";

export async function runSameRoleSameCompanyCheck(db: D1Database, input: BenchmarkInput): Promise<Finding> {
  if (!input.companyName || !input.jobTitle || !input.salaryMin) {
    return {
      benchmark: "vs_same_role_same_company",
      status: "insufficient_data",
      confidence: "low",
      magnitude: null,
      supportingData: {},
    };
  }
  return {
    benchmark: "vs_same_role_same_company",
    status: "insufficient_data", // stub
    confidence: "low",
    magnitude: null,
    supportingData: {},
    caveats: ["Stub implementation."],
  };
}
