import { describe, expect, it } from "vitest";
import { alignCvBranches, pchipInterpolate, toSequentialGrid } from "../src/lib/cvInterpolation";
import { normalizeAlignedCvCycles } from "../src/lib/cvCycle";

describe("pchipInterpolate", () => {
  it("returns exact PCHIP node values and stays within local monotone bounds", () => {
    const values = pchipInterpolate([0, 1, 2, 3], [0, 2, 2.5, 4], [0, 0.5, 1, 1.5, 2, 2.5, 3]);

    expect(values[0]).toBe(0);
    expect(values[2]).toBe(2);
    expect(values[4]).toBe(2.5);
    expect(values[6]).toBe(4);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThanOrEqual(4);
  });

  it("rejects PCHIP extrapolation", () => {
    expect(() => pchipInterpolate([0, 1], [1, 2], [-0.01])).toThrow("noCommonPotentialRange");
  });
});

describe("alignCvBranches", () => {
  it("uses a common Auto grid close to native resolution", () => {
    const series = [1, 4, 9].map((scanRate, rateIndex) => ({
      label: String(scanRate),
      scanRate,
      points: [-1, -0.5, 0, -0.5, -1].map((potential, index) => ({ potential, current: rateIndex + index }))
    }));

    const grid = alignCvBranches(series, normalizeAlignedCvCycles(series), { mode: "auto" });

    expect(grid.potentials).toEqual([-1, -0.5, 0]);
    expect(grid.resolvedPotentialInterval).toBeCloseTo(0.5, 12);
    expect(grid.forwardCurrents).toHaveLength(3);
    expect(grid.reverseCurrents).toHaveLength(3);
  });

  it("honors a finite manual interval in mV without row alignment", () => {
    const series = [
      { label: "1", scanRate: 1, points: [-1, -0.5, 0, -0.5, -1].map((potential) => ({ potential, current: potential + 1 })) },
      { label: "2", scanRate: 2, points: [-0.99, -0.49, -0.01, -0.51, -0.99].map((potential) => ({ potential, current: potential + 2 })) },
      { label: "4", scanRate: 4, points: [-0.98, -0.48, -0.02, -0.52, -0.98].map((potential) => ({ potential, current: potential + 4 })) }
    ];

    const grid = alignCvBranches(series, normalizeAlignedCvCycles(series), { mode: "manual", millivolts: 250 });

    expect(grid.commonMinimum).toBeCloseTo(-0.98, 12);
    expect(grid.commonMaximum).toBeCloseTo(-0.02, 12);
    expect(grid.potentials[0]).toBe(grid.commonMinimum);
    expect(grid.potentials.at(-1)).toBe(grid.commonMaximum);
    expect(grid.resolvedPotentialInterval).toBeLessThanOrEqual(0.25);
  });

  it("keeps forward and reverse currents independent on their shared grid", () => {
    const series = [1, 2, 4].map((scanRate) => ({
      label: String(scanRate),
      scanRate,
      points: [
        { potential: -1, current: scanRate },
        { potential: -0.5, current: scanRate + 1 },
        { potential: 0, current: scanRate + 2 },
        { potential: -0.5, current: scanRate + 11 },
        { potential: -1, current: scanRate + 12 }
      ]
    }));

    const grid = alignCvBranches(series, normalizeAlignedCvCycles(series), { mode: "auto" });

    expect(grid.forwardCurrents[0]).toEqual([1, 2, 3]);
    expect(grid.reverseCurrents[0]).toEqual([13, 12, 3]);
  });

  it("converts independently aligned branches into a sequential CV grid", () => {
    const series = [1, 2, 4].map((scanRate) => ({
      label: String(scanRate),
      scanRate,
      points: [
        { potential: -1, current: scanRate },
        { potential: -0.5, current: scanRate + 1 },
        { potential: 0, current: scanRate + 2 },
        { potential: -0.5, current: scanRate + 11 },
        { potential: -1, current: scanRate + 12 }
      ]
    }));
    const aligned = alignCvBranches(series, normalizeAlignedCvCycles(series), { mode: "auto" });

    const sequential = toSequentialGrid(aligned);

    expect(sequential).toMatchObject({
      potentials: [-1, -0.5, 0, -0.5, -1],
      branches: [
        { branchIndex: 0, direction: 1, startIndex: 0, endIndex: 2 },
        { branchIndex: 1, direction: -1, startIndex: 2, endIndex: 4 }
      ]
    });
    expect(sequential.currents[0]).toEqual([1, 2, 3, 12, 13]);
  });
});
