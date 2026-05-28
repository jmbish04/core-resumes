import { D1Database } from "@cloudflare/workers-types";
import { BenchmarkInput, Finding } from "./types";
import { runGoogleAnchorCheck } from "./benchmarks/vs-google-anchor";
import { runSameRoleSameCompanyCheck } from "./benchmarks/vs-same-role-same-company";
import { runPeerCompaniesCheck } from "./benchmarks/vs-peer-companies";
import { runCrossMarketCheck } from "./benchmarks/vs-cross-market";
import { runAdjacentLevelsCheck } from "./benchmarks/vs-adjacent-levels";
import { runCompanyTrendCheck } from "./benchmarks/vs-company-trend";
import { runYoeBandCheck } from "./benchmarks/vs-yoe-band";
import { runOfferRangePositionCheck } from "./benchmarks/vs-offer-range-position";
import { runVarianceCheck } from "./benchmarks/variance-check";
import { runRecencyCheck } from "./benchmarks/recency-check";

/**
 * Executes the full benchmark battery for a single role.
 * Cache key should be (roleId, hash(input), input.latestSnapshotId).
 */
export async function runBenchmarkBattery(
  db: D1Database,
  input: BenchmarkInput
): Promise<Finding[]> {
  const promises = [
    runGoogleAnchorCheck(db, input),
    runSameRoleSameCompanyCheck(db, input),
    runPeerCompaniesCheck(db, input),
    runCrossMarketCheck(db, input),
    runAdjacentLevelsCheck(db, input),
    runCompanyTrendCheck(db, input),
    runYoeBandCheck(db, input),
    runOfferRangePositionCheck(db, input),
    runVarianceCheck(db, input),
    runRecencyCheck(db, input),
  ];

  return Promise.all(promises);
}
