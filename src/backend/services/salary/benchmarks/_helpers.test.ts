import { describe, it, expect } from "vitest";
import {
  adjacentSeniorities,
  confidenceFromSample,
  levelToSeniority,
  offerMidpoint,
  positionAgainstBand,
} from "./_helpers";
import type { BenchmarkInput } from "../types";

const baseInput: BenchmarkInput = {
  roleId: "r1",
  companyName: "acme",
  jobTitle: "software engineer",
  salaryMin: null,
  salaryMax: null,
  geoId: null,
  metro: null,
  latestSnapshotId: 1,
};

describe("offerMidpoint", () => {
  it("averages min and max when both present", () => {
    expect(offerMidpoint({ ...baseInput, salaryMin: 100, salaryMax: 200 })).toBe(150);
  });
  it("falls back to a single bound", () => {
    expect(offerMidpoint({ ...baseInput, salaryMin: 120 })).toBe(120);
    expect(offerMidpoint({ ...baseInput, salaryMax: 180 })).toBe(180);
  });
  it("returns null when neither bound is present", () => {
    expect(offerMidpoint(baseInput)).toBeNull();
  });
});

describe("positionAgainstBand", () => {
  const band = { p25: 100, median: 150, p75: 200, sample_size: 40 };
  it("flags below when under p25", () => {
    expect(positionAgainstBand(90, band).status).toBe("below");
  });
  it("flags above when over p75", () => {
    expect(positionAgainstBand(220, band).status).toBe("above");
  });
  it("flags at when inside the band", () => {
    expect(positionAgainstBand(150, band).status).toBe("at");
  });
  it("computes fractional magnitude vs median", () => {
    expect(positionAgainstBand(135, band).magnitude).toBe(-0.1);
  });
});

describe("confidenceFromSample", () => {
  it("maps sample size to confidence tiers", () => {
    expect(confidenceFromSample(50)).toBe("high");
    expect(confidenceFromSample(15)).toBe("medium");
    expect(confidenceFromSample(3)).toBe("low");
  });
});

describe("levelToSeniority / adjacentSeniorities", () => {
  it("maps taxonomy levels to entry/mid/senior buckets", () => {
    expect(levelToSeniority("junior")).toBe("entry");
    expect(levelToSeniority("mid")).toBe("mid");
    expect(levelToSeniority("staff")).toBe("senior");
    expect(levelToSeniority("principal")).toBe("senior");
  });
  it("returns adjacent buckets", () => {
    expect(adjacentSeniorities("entry")).toEqual(["mid"]);
    expect(adjacentSeniorities("mid")).toEqual(["entry", "senior"]);
    expect(adjacentSeniorities("senior")).toEqual(["mid"]);
  });
});
