import { describe, it, expect } from "vitest";
import { runSameRoleSameCompanyCheck } from "./vs-same-role-same-company";
import type { BenchmarkInput } from "../types";

/**
 * Minimal D1 stub. Each handler matches the SQL by regex and returns a row for
 * `.first()`. Supports both `prepare().first()` and `prepare().bind().first()`.
 */
function makeDb(handlers: Array<{ match: RegExp; first?: unknown }>) {
  const resolve = (sql: string) => handlers.find((h) => h.match.test(sql));
  return {
    prepare(sql: string) {
      const api = {
        bind: (..._args: unknown[]) => api,
        first: async () => (resolve(sql)?.first ?? null) as any,
        all: async () => ({ results: [] as any[] }),
      };
      return api;
    },
  } as any;
}

const input: BenchmarkInput = {
  roleId: "r1",
  companyName: "Acme",
  jobTitle: "Software Engineer",
  salaryMin: 140000,
  salaryMax: 160000, // midpoint 150000
  geoId: null,
  metro: null,
  latestSnapshotId: 1,
};

const COMPANY_SQL = /FROM market_company_salaries\s+WHERE company_name = \? AND job_title = \?/;

describe("runSameRoleSameCompanyCheck", () => {
  it("returns insufficient_data when offer salary is missing", async () => {
    const db = makeDb([]);
    const result = await runSameRoleSameCompanyCheck(db, {
      ...input,
      salaryMin: null,
      salaryMax: null,
    });
    expect(result.status).toBe("insufficient_data");
  });

  it("returns insufficient_data when no market rows match", async () => {
    const db = makeDb([{ match: /role_family_taxonomy/, first: null }]);
    const result = await runSameRoleSameCompanyCheck(db, input);
    expect(result.status).toBe("insufficient_data");
  });

  it("flags below when midpoint is under p25", async () => {
    const db = makeDb([
      { match: COMPANY_SQL, first: { p25: 160000, median: 180000, p75: 200000, sample_size: 40 } },
    ]);
    const result = await runSameRoleSameCompanyCheck(db, input);
    expect(result.status).toBe("below");
    expect(result.confidence).toBe("high");
    expect(result.magnitude).toBeLessThan(0);
  });

  it("flags at when midpoint sits inside the band", async () => {
    const db = makeDb([
      { match: COMPANY_SQL, first: { p25: 140000, median: 150000, p75: 165000, sample_size: 15 } },
    ]);
    const result = await runSameRoleSameCompanyCheck(db, input);
    expect(result.status).toBe("at");
    expect(result.confidence).toBe("medium");
  });

  it("flags above when midpoint exceeds p75", async () => {
    const db = makeDb([
      { match: COMPANY_SQL, first: { p25: 100000, median: 120000, p75: 140000, sample_size: 5 } },
    ]);
    const result = await runSameRoleSameCompanyCheck(db, input);
    expect(result.status).toBe("above");
    expect(result.confidence).toBe("low");
    expect(result.magnitude).toBeGreaterThan(0);
  });
});
