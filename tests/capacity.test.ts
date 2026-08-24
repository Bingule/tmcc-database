import { describe, expect, it } from "vitest";
import { FARADAY_CONSTANT, calculateTheoreticalCapacity } from "../src/lib/capacity";

describe("theoretical capacity calculation", () => {
  it("uses the Faraday constant in Q = nF/(3.6M)", () => {
    expect(FARADAY_CONSTANT).toBe(96485.33212);
    expect(calculateTheoreticalCapacity(100, 1)).toBeCloseTo(268.0148114, 6);
  });

  it.each([
    [0, 1],
    [-1, 1],
    [Number.POSITIVE_INFINITY, 1],
    [100, 0],
    [100, -1],
    [100, Number.NaN]
  ])("rejects non-positive or non-finite inputs (%s, %s)", (molarMass, electrons) => {
    expect(() => calculateTheoreticalCapacity(molarMass, electrons)).toThrow();
  });
});
