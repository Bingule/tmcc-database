import { describe, expect, it } from "vitest";
import {
  CvCycleStructureError,
  normalizeAlignedCvCycles,
  normalizeCvCycle,
  splitAlignedCvCycles,
  splitCvCycle
} from "../src/lib/cvCycle";
import type { CvSeries } from "../src/lib/cvTypes";

function points(potentials: readonly number[]) {
  return potentials.map((potential, index) => ({ potential, current: index + 1 }));
}

function series(potentials: number[], label: string): CvSeries {
  return { label, scanRate: 1, points: points(potentials) };
}

function expectStructureError(action: () => unknown, reason: CvCycleStructureError["reason"]) {
  try {
    action();
    throw new Error("expectedCvCycleStructureError");
  } catch (error) {
    expect(error).toBeInstanceOf(CvCycleStructureError);
    expect((error as CvCycleStructureError).reason).toBe(reason);
  }
}

describe("splitCvCycle", () => {
  it("shares a singly recorded turning point between ascending and descending branches", () => {
    const branches = splitCvCycle(points([0, 1, 2, 1, 0]));

    expect(branches).toMatchObject([
      { branchIndex: 0, direction: 1, sharesStartWithPrevious: false },
      { branchIndex: 1, direction: -1, sharesStartWithPrevious: true }
    ]);
    expect(branches[0].points.map((point) => point.sourceIndex)).toEqual([0, 1, 2]);
    expect(branches[1].points.map((point) => point.sourceIndex)).toEqual([2, 3, 4]);
  });

  it("does not mutate the input points while segmenting", () => {
    const input = points([0, 1, 2, 1, 0]);
    const original = input.map((point) => ({ ...point }));

    splitCvCycle(input);

    expect(input).toEqual(original);
    expect(input[0]).not.toBe(original[0]);
  });

  it("keeps separately recorded turning points exclusive to their branches", () => {
    const branches = splitCvCycle(points([0, 1, 2, 2, 1, 0]));

    expect(branches[0].points.map((point) => point.sourceIndex)).toEqual([0, 1, 2]);
    expect(branches[1].points.map((point) => point.sourceIndex)).toEqual([3, 4, 5]);
    expect(branches[1].sharesStartWithPrevious).toBe(false);
  });

  it("segments up to two reversals", () => {
    expect(splitCvCycle(points([0, 1, -1, 0])).map((branch) => branch.direction)).toEqual([1, -1, 1]);
  });

  it.each([
    ["ascending", [0, 1, 2], 1],
    ["descending", [2, 1, 0], -1]
  ] as const)("keeps a monotonic %s scan as one branch", (_name, potentials, direction) => {
    const branches = splitCvCycle(points(potentials));
    expect(branches).toHaveLength(1);
    expect(branches[0]).toMatchObject({ branchIndex: 0, direction, sharesStartWithPrevious: false });
  });

  it("rejects more than two reversals", () => {
    expectStructureError(() => splitCvCycle(points([0, 1, 0, 1, 0])), "tooManyTurningPoints");
  });

  it("keeps same-direction potential plateaus in their original branch order", () => {
    const branches = splitCvCycle(points([0, 1, 1, 2]));

    expect(branches).toHaveLength(1);
    expect(branches[0].points.map((point) => point.sourceIndex)).toEqual([0, 1, 2, 3]);
  });

  it("rejects a branch without two distinct potentials", () => {
    expectStructureError(() => splitCvCycle(points([0])), "branchPointCount");
  });
});

describe("splitAlignedCvCycles", () => {
  it("rejects series with different branch counts or directions", () => {
    expectStructureError(
      () => splitAlignedCvCycles([series([0, 1, 0], "first"), series([0, 1, 2], "second")]),
      "inconsistentBranches"
    );
  });

  it("allows matching branch directions with mixed single and double turning-point recording", () => {
    const branches = splitAlignedCvCycles([
      series([0, 1, 2, 1, 0], "single"),
      series([0, 1, 2, 2, 1, 0], "double")
    ]);

    expect(branches[0][1].sharesStartWithPrevious).toBe(true);
    expect(branches[1][1].sharesStartWithPrevious).toBe(false);
  });

  it("aligns a cycle recorded from a turning point with one recorded across the cycle seam", () => {
    const branches = splitAlignedCvCycles([
      series([0.2, 1, 0, 0.2], "seam-crossing"),
      series([0, 0.5, 1, 0.5, 0], "turning-point-start")
    ]);

    expect(branches.map((cycle) => cycle.map((branch) => branch.direction))).toEqual([
      [1, -1, 1],
      [1, -1, 1]
    ]);
    expect(branches[1][2]).toMatchObject({
      branchIndex: 2,
      direction: 1,
      sharesStartWithPrevious: false,
      cyclicClosure: true
    });
    expect(branches[1][2].points.map((point) => point.sourceIndex)).toEqual([0, 1, 2]);
  });
});

describe("normalizeCvCycle", () => {
  it("normalizes an endpoint-started one-turn loop", () => {
    const cycle = normalizeCvCycle(points([-1, -0.5, 0, -0.5, -1]));

    expect(cycle.forward.points.map((point) => point.potential)).toEqual([-1, -0.5, 0]);
    expect(cycle.reverse.points.map((point) => point.potential)).toEqual([0, -0.5, -1]);
    expect(cycle.ignoredPointCount).toBe(0);
  });

  it("joins same-direction seam fragments into one logical branch", () => {
    const cycle = normalizeCvCycle(points([-0.5, 0, -0.5, -1, -0.75, -0.5]));

    expect(cycle.forward.points.map((point) => point.potential)).toEqual([-1, -0.75, -0.5, 0]);
    expect(cycle.reverse.points.map((point) => point.potential)).toEqual([0, -0.5, -1]);
    expect(cycle.originalPoints.map((point) => point.potential)).toEqual([-0.5, 0, -0.5, -1, -0.75, -0.5]);
  });

  it("ignores only an incomplete next cycle after closure", () => {
    const cycle = normalizeCvCycle(points([-1, -0.5, 0, -0.5, -1, -0.8, -0.6]));

    expect(cycle.selectedEndIndex).toBe(4);
    expect(cycle.ignoredPointCount).toBe(2);
  });

  it("keeps the true endpoint instead of closing at the first point inside tolerance", () => {
    const ascending = Array.from({ length: 301 }, (_, index) => index);
    const descending = Array.from({ length: 300 }, (_, index) => 299 - index);
    const cycle = normalizeCvCycle(points([...ascending, ...descending]));

    expect(cycle.selectedEndIndex).toBe(600);
    expect(cycle.originalPoints.at(-1)?.potential).toBe(0);
    expect(cycle.ignoredPointCount).toBe(0);
  });

  it("ignores a tail that extends beyond an already closed endpoint-started loop", () => {
    const cycle = normalizeCvCycle(points([-1, 0, -1, -0.5, 0.5]));

    expect(cycle.selectedEndIndex).toBe(2);
    expect(cycle.ignoredPointCount).toBe(2);
  });

  it("ignores an extreme tail after an already closed endpoint-started loop", () => {
    const cycle = normalizeCvCycle(points([-1, 0, -1, 100]));

    expect(cycle.selectedEndIndex).toBe(2);
    expect(cycle.ignoredPointCount).toBe(1);
  });

  it("does not let an extreme tail turn a mid-sweep start into an endpoint start", () => {
    const cycle = normalizeCvCycle(points([-1, 0, -1, -1.1, -1, 100]));

    expect(cycle.selectedEndIndex).toBe(4);
    expect(cycle.ignoredPointCount).toBe(1);
  });

  it("does not treat a later return after another reversal as an endpoint-started closure", () => {
    expect(() => normalizeCvCycle(points([-1, 0, -0.5, 0, -1]))).toThrow("branchPointCount");
  });

  it("retains double-recorded turning currents on opposite branches", () => {
    const input = [
      { potential: -1, current: -1 },
      { potential: 0, current: 3 },
      { potential: 0, current: 2 },
      { potential: -1, current: -2 }
    ];
    const cycle = normalizeCvCycle(input);

    expect(cycle.forward.points.at(-1)).toMatchObject({ potential: 0, current: 3 });
    expect(cycle.reverse.points[0]).toMatchObject({ potential: 0, current: 2 });
  });
});

describe("normalizeAlignedCvCycles", () => {
  it("accepts mixed one-turn and seam-started cycles with matching directions", () => {
    const cycles = normalizeAlignedCvCycles([
      { label: "2", scanRate: 2, points: points([-1, -0.5, 0, -0.5, -1]) },
      { label: "5", scanRate: 5, points: points([-0.5, 0, -0.5, -1, -0.5]) }
    ]);

    expect(cycles).toHaveLength(2);
    expect(cycles.every((cycle) => cycle.forward.direction === 1 && cycle.reverse.direction === -1)).toBe(true);
  });
});
