import { z } from "zod";
import { Agent } from "agents";
import { AiProvider } from "../../../../ai/providers";
import { getDb } from "../../../../db";
import { SINGLE_ROLE_SYSTEM_PROMPT } from "../prompts/single-role-system";
import { runBenchmarkBattery } from "../../../../services/salary/benchmark-battery";
import { scoreLeverage } from "../../../../services/salary/leverage-scorer";
import { roles, marketSalarySnapshots, geoLocations } from "../../../../db/schema";
import { eq, desc } from "drizzle-orm";

export async function runSingleRoleMode(agent: Agent<Env, any>, env: Env, roleId: string) {
  const db = getDb(env);

  // Fetch role and latest snapshot
  const [role] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1);
  if (!role) throw new Error(`Role ${roleId} not found`);

  // Resolve metro through the canonical geo FK (roles.geo_id → geo_locations.metro).
  // roles.metro is deprecated free text; geo_id is authoritative.
  let metro: string | null = null;
  if (role.geoId != null) {
    const [geo] = await db
      .select({ metro: geoLocations.metro })
      .from(geoLocations)
      .where(eq(geoLocations.id, role.geoId))
      .limit(1);
    metro = geo?.metro ?? null;
  }

  const [snapshot] = await db
    .select({ id: marketSalarySnapshots.id })
    .from(marketSalarySnapshots)
    .where(eq(marketSalarySnapshots.status, "success"))
    .orderBy(desc(marketSalarySnapshots.runTimestamp))
    .limit(1);
  const snapshotId = snapshot?.id ?? 0;

  // 1. Run Benchmark Battery (benchmarks use the raw D1 binding via prepared statements)
  const findings = await runBenchmarkBattery(env.DB, {
    roleId,
    companyName: role.companyName,
    jobTitle: role.jobTitle,
    salaryMin: role.salaryMin,
    salaryMax: role.salaryMax,
    geoId: role.geoId,
    metro,
    latestSnapshotId: snapshotId,
  });

  // 2. Score Leverage
  const leverage = scoreLeverage(findings);

  // 3. Agent narrative
  const provider = new AiProvider(env);
  const prompt = `
Role: ${role.jobTitle} at ${role.companyName}
Salary Range: ${role.salaryMin} - ${role.salaryMax}
Metro: ${metro ?? "Unknown"}

<FINDINGS>
${JSON.stringify(findings, null, 2)}
</FINDINGS>

<LEVERAGE_SCORE>
${JSON.stringify(leverage, null, 2)}
</LEVERAGE_SCORE>

Synthesize a negotiation playbook.
`;

  const result = await provider.generateStructuredOutput({
    messages: [
      { role: "system", content: SINGLE_ROLE_SYSTEM_PROMPT },
      { role: "user", content: prompt }
    ],
    schema: z.object({
      negotiationPlaybook: z.string(),
    }),
    schemaName: "SingleRoleNegotiationPlaybook",
  });

  return {
    findings,
    leverage,
    playbook: result.negotiationPlaybook,
  };
}
