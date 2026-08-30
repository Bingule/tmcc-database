import { describe, expect, it } from "vitest";
import { fitDunnBranches, resolveTurningPointTrim } from "../src/lib/cvDunnFit";
import type { CvAlignedBranchGrid } from "../src/lib/cvTypes";

function makeGrid(overrides: Partial<CvAlignedBranchGrid> = {}): CvAlignedBranchGrid {
  const scanRates = [1, 4, 9];
  const potentials = [0, 0.25, 0.5, 0.75, 1];
  const currents = scanRates.map((v) => potentials.map(() => 2 * v + 3 * Math.sqrt(v)));
  return {
    potentials,
    scanRates,
    forwardCurrents: currents,
    reverseCurrents: currents,
    commonMinimum: 0,
    commonMaximum: 1,
    nativePotentialInterval: 0.25,
    resolvedPotentialInterval: 0.25,
    cycles: [],
    ...overrides
  };
}

describe("fitDunnBranches", () => {
  it("recovers branch-specific Dunn coefficients at arbitrary scan rates", () => {
    const scanRates = [0.2, 0.6, 1.4, 3.1];
    const potentials = [-1, -0.5, 0];
    const make = (k1: number, k2: number) => scanRates.map((v) =>
      potentials.map(() => k1 * v + k2 * Math.sqrt(v)));
    const result = fitDunnBranches(makeGrid({
      potentials,
      scanRates,
      forwardCurrents: make(2, 3),
      reverseCurrents: make(-1, 4),
      commonMinimum: -1,
      commonMaximum: 0,
      nativePotentialInterval: 0.5,
      resolvedPotentialInterval: 0.5
    }), { mode: "manual", millivolts: 0 });

    expect(result.forward[1].fit?.k1).toBeCloseTo(2, 12);
    expect(result.forward[1].fit?.k2).toBeCloseTo(3, 12);
    expect(result.forward[1].fit?.rSquared).toBe(1);
    expect(result.forward[1].trimmed).toBe(false);
    expect(result.reverse[1].fit?.k1).toBeCloseTo(-1, 12);
    expect(result.reverse[1].fit?.k2).toBeCloseTo(4, 12);
    expect(result.reverse[1].fit?.rSquared).toBe(1);
    expect(result.reverse[1].trimmed).toBe(false);
    expect(result.forward.every((record) => !record.trimmed)).toBe(true);
  });

  it("marks reversal trim points without deleting them from the fit grid", () => {
    const result = fitDunnBranches(makeGrid(), { mode: "manual", millivolts: 200 });

    expect(result.forward).toHaveLength(5);
    expect(result.reverse).toHaveLength(5);
    expect(result.forward[0]).toMatchObject({ trimmed: true, fit: null, status: "trimmed" });
    expect(result.forward[4]).toMatchObject({ trimmed: true, fit: null, status: "trimmed" });
    expect(result.forward[2]).toMatchObject({ trimmed: false, status: "valid" });
  });

  it("retains a nullable record when too few distinct valid scan rates remain", () => {
    const grid = makeGrid({
      scanRates: [1, 1, 4],
      forwardCurrents: [[1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [3, 3, 3, 3, 3]],
      reverseCurrents: [[1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [3, 3, 3, 3, 3]]
    });

    expect(fitDunnBranches(grid, { mode: "manual", millivolts: 0 }).forward[2])
      .toMatchObject({ fit: null, status: "insufficientData", trimmed: false });
  });

  it("retains fit evidence when the positive potential span is extremely small", () => {
    const span = 1e-300;
    const potentials = [0, span / 2, span];
    const scanRates = [1, 4, 9];
    const currents = scanRates.map((v) =>
      potentials.map(() => 2 * v + 3 * Math.sqrt(v)));
    const result = fitDunnBranches(makeGrid({
      potentials,
      scanRates,
      forwardCurrents: currents,
      reverseCurrents: currents,
      commonMinimum: 0,
      commonMaximum: span,
      nativePotentialInterval: span / 2,
      resolvedPotentialInterval: span / 2
    }), { mode: "auto" });

    expect(result.forward[1]).toMatchObject({ trimmed: false, status: "valid" });
    expect(result.reverse[1]).toMatchObject({ trimmed: false, status: "valid" });
  });

  it("reduces auto trim only when needed to retain sparse nonuniform interior evidence", () => {
    const potentials = [0, 0.001, 0.999, 1];
    const scanRates = [1, 4, 9];
    const currents = scanRates.map((v) =>
      potentials.map(() => 2 * v + 3 * Math.sqrt(v)));
    const result = fitDunnBranches(makeGrid({
      potentials,
      scanRates,
      forwardCurrents: currents,
      reverseCurrents: currents,
      nativePotentialInterval: 0.001,
      resolvedPotentialInterval: 0.001
    }), { mode: "auto" });

    expect(result.resolvedTurningPointTrim).toBeLessThan(0.001);
    expect(result.forward.some((record) => record.status === "valid")).toBe(true);
    expect(result.reverse.some((record) => record.status === "valid")).toBe(true);
  });
});

describe("resolveTurningPointTrim", () => {
  it("uses the same 0.5% physical span on coarse and dense potential grids", () => {
    const resolveFor = (pointCount: number) => resolveTurningPointTrim(makeGrid({
      potentials: Array.from(
        { length: pointCount },
        (_, index) => -0.8 + 1.4 * index / (pointCount - 1)
      ),
      scanRates: [1, 2, 4],
      forwardCurrents: [],
      reverseCurrents: [],
      commonMinimum: -0.8,
      commonMaximum: 0.6,
      nativePotentialInterval: 1.4 / (pointCount - 1),
      resolvedPotentialInterval: 1.4 / (pointCount - 1)
    }), { mode: "auto" });

    const coarse = resolveFor(51);
    const dense = resolveFor(501);
    expect(coarse).toBeCloseTo(0.007, 12);
    expect(dense).toBeCloseTo(coarse, 12);
  });

  it("keeps auto trim below half of a very small positive span", () => {
    const span = 1e-300;
    const trim = resolveTurningPointTrim(makeGrid({
      potentials: [0, span / 2, span],
      commonMinimum: 0,
      commonMaximum: span,
      nativePotentialInterval: span / 2,
      resolvedPotentialInterval: span / 2
    }), { mode: "auto" });

    expect(trim).toBeGreaterThanOrEqual(0);
    expect(trim).toBeLessThan(span / 2);
  });

  it("rejects an auto trim for a zero potential span", () => {
    expect(() => resolveTurningPointTrim(makeGrid({
      potentials: [0],
      commonMinimum: 0,
      commonMaximum: 0
    }), { mode: "auto" })).toThrow("invalidDataShape");
  });

  it("converts a manual trim from millivolts to volts", () => {
    expect(resolveTurningPointTrim(makeGrid(), { mode: "manual", millivolts: 125 }))
      .toBeCloseTo(0.125, 12);
  });

  it("allows a zero manual trim", () => {
    expect(resolveTurningPointTrim(makeGrid(), { mode: "manual", millivolts: 0 })).toBe(0);
  });

  it("rejects a manual trim equal to half the common potential span", () => {
    expect(() => resolveTurningPointTrim(makeGrid(), { mode: "manual", millivolts: 500 }))
      .toThrow("invalidTurningPointTrim");
  });

  it("rejects a manual trim greater than half the common potential span", () => {
    expect(() => resolveTurningPointTrim(makeGrid(), { mode: "manual", millivolts: 600 }))
      .toThrow("invalidTurningPointTrim");
  });
});
