import { Agent } from "agents";
import { runIndustryCompTrends } from "../../../../services/salary/benchmarks/aggregate/industry-comp-trends";
import { runRoleDemandHeat } from "../../../../services/salary/benchmarks/aggregate/role-demand-heat";
import { runPivotTrajectory } from "../../../../services/salary/benchmarks/aggregate/pivot-trajectory";
import { runRemoteDiscountIndex } from "../../../../services/salary/benchmarks/aggregate/remote-discount-index";
import { runGeoPremiumDeltas } from "../../../../services/salary/benchmarks/aggregate/geo-premium-deltas";
import type { PivotTrajectoryInput } from "../../../../services/salary/types";

export async function runAggregateMode(agent: Agent<Env, any>, env: Env, input: PivotTrajectoryInput) {
  const db = env.DB;
  
  const [
    industryCompTrends,
    roleDemandHeat,
    pivotTrajectory,
    remoteDiscountIndex,
    geoPremiumDeltas
  ] = await Promise.all([
    runIndustryCompTrends(db),
    runRoleDemandHeat(db),
    runPivotTrajectory(db, input || { 
      currentRoleTitle: "Software Engineer", 
      currentSalary: 150000, 
      targetRoleTitle: "Engineering Manager", 
      projectionYears: 5 
    }),
    runRemoteDiscountIndex(db),
    runGeoPremiumDeltas(db)
  ]);

  return {
    industryCompTrends,
    roleDemandHeat,
    pivotTrajectory,
    remoteDiscountIndex,
    geoPremiumDeltas
  };
}
