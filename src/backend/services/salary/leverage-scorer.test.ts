import { describe, it, expect } from "vitest";
import { scoreLeverage } from "./leverage-scorer";
import type { Finding, FindingConfidence, FindingStatus } from "./types";

function finding(
  status: FindingStatus,
  confidence: FindingConfidence,
  magnitude: number | null = null,
  benchmark = "test_benchmark",
): Finding {
  return { benchmark, status, confidence, magnitude, supportingData: {} };
}

describe("scoreLeverage", () => {
  it("returns insufficient_data when every finding is insufficient_data", () => {
    const result = scoreLeverage([
      finding("insufficient_data", "low"),
      finding("insufficient_data", "low"),
    ]);
    expect(result.score).toBe("insufficient_data");
    expect(result.primaryLevers).toHaveLength(0);
    expect(result.vulnerabilities).toHaveLength(0);
  });

  it("returns insufficient_data for an empty battery", () => {
    expect(scoreLeverage([]).score).toBe("insufficient_data");
  });

  it("scores strong when high-confidence below-market findings dominate", () => {
    const result = scoreLeverage([
      finding("below", "high", -0.12, "vs_peer_companies"),
      finding("below", "high", -0.08, "vs_same_role_same_company"),
    ]);
    expect(result.score).toBe("strong");
    expect(result.primaryLevers.length).toBeGreaterThanOrEqual(2);
  });

  it("scores weak when high-confidence above-market findings dominate", () => {
    const result = scoreLeverage([
      finding("above", "high", 0.15, "vs_peer_companies"),
      finding("above", "high", 0.1, "vs_cross_market"),
    ]);
    expect(result.score).toBe("weak");
    expect(result.vulnerabilities.length).toBeGreaterThanOrEqual(2);
  });

  it("scores moderate when signal nets out", () => {
    const result = scoreLeverage([
      finding("below", "high", -0.1, "vs_peer_companies"),
      finding("above", "high", 0.1, "vs_cross_market"),
    ]);
    expect(result.score).toBe("moderate");
  });

  it("does NOT score strong on low-confidence below findings alone", () => {
    // Two low-confidence below findings (weight 0.15 each = 0.3) must not clear
    // the strong threshold — the whole point of confidence weighting.
    const result = scoreLeverage([
      finding("below", "low", -0.2, "vs_peer_companies"),
      finding("below", "low", -0.18, "vs_same_role_same_company"),
    ]);
    expect(result.score).toBe("moderate");
    // Low-confidence findings surface as caveats, not stated levers.
    expect(result.primaryLevers).toHaveLength(0);
    expect(result.caveats.length).toBeGreaterThan(0);
  });

  it("treats 'at' findings as inline caveats, not levers or vulnerabilities", () => {
    const result = scoreLeverage([finding("at", "high", 0.01, "vs_yoe_band")]);
    expect(result.primaryLevers).toHaveLength(0);
    expect(result.vulnerabilities).toHaveLength(0);
    expect(result.caveats.some((c) => c.includes("inline"))).toBe(true);
  });
});
