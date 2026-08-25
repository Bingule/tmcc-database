import { describe, expect, it } from "vitest";
import {
  CvCycleStructureError,
  splitAlignedCvCycles,
  splitCvCycle
} from "../src/lib/cvCycle";
import type { CvSeries } from "../src/lib/cvTypes";

function points(potentials: number[]) {
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

  it("rejects an internal duplicate that does not record a reversal", () => {
    expectStructureError(() => splitCvCycle(points([0, 1, 1, 2])), "duplicatePotential");
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
});
