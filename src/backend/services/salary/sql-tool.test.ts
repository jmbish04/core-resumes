import { describe, it, expect, vi } from "vitest";
import { querySalaryData } from "./sql-tool";

describe("querySalaryData", () => {
  it("rejects non-SELECT statements", async () => {
    const db = { prepare: vi.fn() } as any;
    const auditDb = { prepare: vi.fn().mockReturnValue({ bind: () => ({ run: () => Promise.resolve() }) }) } as any;
    
    const result = await querySalaryData(db, "DELETE FROM roles", { roleId: "1", mode: "A", auditDb });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(["STATEMENT_TYPE", "PARSE"]).toContain(result.code);
    }
  });

  it("rejects stacked statements", async () => {
    const db = { prepare: vi.fn() } as any;
    const auditDb = { prepare: vi.fn().mockReturnValue({ bind: () => ({ run: () => Promise.resolve() }) }) } as any;
    
    const result = await querySalaryData(db, "SELECT * FROM roles; DROP TABLE roles;", { roleId: "1", mode: "A", auditDb });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("STATEMENT_TYPE");
    }
  });

  it("rejects non-allowlist tables", async () => {
    const db = { prepare: vi.fn() } as any;
    const auditDb = { prepare: vi.fn().mockReturnValue({ bind: () => ({ run: () => Promise.resolve() }) }) } as any;
    
    const result = await querySalaryData(db, "SELECT * FROM secret_table", { roleId: "1", mode: "A", auditDb });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("TABLE_DENIED");
    }
  });
});
