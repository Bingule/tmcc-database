import { describe, expect, it } from "vitest";
import {
  analyzeBValue,
  analyzeDunn,
  attemptBValueFits,
  attemptDunnFits,
  integrateDunnContributions,
  interpolateCommonGrid
} from "../src/lib/cvAnalysis";
import { CvAnalysisError, type CvSeries, type InterpolatedCvData } from "../src/lib/cvTypes";

function makeBValueData(options: {
  a: number;
  b: number;
  scanRates: number[];
  sign?: number;
}): InterpolatedCvData {
  const sign = options.sign ?? 1;
  return {
    potentials: [0.25],
    scanRates: options.scanRates,
    currents: options.scanRates.map((scanRate) => [sign * options.a * scanRate ** options.b])
  };
}

function makeDunnData(options: {
  k1: number;
  k2: number;
  scanRates: number[];
  potentials?: number[];
}): InterpolatedCvData {
  const potentials = options.potentials ?? [0, 1, 2];
  return {
    potentials,
    scanRates: options.scanRates,
    currents: options.scanRates.map((scanRate) =>
      potentials.map(() => options.k1 * scanRate + options.k2 * Math.sqrt(scanRate))
    )
  };
}

function makeCompleteLoopFitData(): InterpolatedCvData {
  const potentials = [0, 1, 2, 1, 0];
  const scanRates = [1, 4, 9];
  const coefficients = [1, 2, 3, 7, 8];
  return {
    potentials,
    scanRates,
    currents: scanRates.map((scanRate) => coefficients.map((coefficient) => coefficient * scanRate)),
    branches: [
      { branchIndex: 0, direction: 1, startIndex: 0, endIndex: 2 },
      { branchIndex: 1, direction: -1, startIndex: 2, endIndex: 4 }
    ]
  };
}

function expectCvError(action: () => unknown, code: CvAnalysisError["code"]) {
  try {
    action();
    throw new Error("expectedCvAnalysisError");
  } catch (error) {
    expect(error).toBeInstanceOf(CvAnalysisError);
    expect((error as CvAnalysisError).code).toBe(code);
  }
}

describe("interpolateCommonGrid", () => {
  it("uses the measured-potential union inside the shared range and linearly fills internal gaps", () => {
    const input: CvSeries[] = [
      {
        label: "slow",
        scanRate: 1,
        points: [
          { potential: 0, current: 0 },
          { potential: 2, current: 4 },
          { potential: 4, current: 8 }
        ]
      },
      {
        label: "fast",
        scanRate: 5,
        points: [
          { potential: 1, current: 10 },
          { potential: 3, current: 30 },
          { potential: 5, current: 50 }
        ]
      }
    ];
    const snapshot = structuredClone(input);

    const result = interpolateCommonGrid(input);

    expect(result).toEqual({
      potentials: [1, 2, 3, 4],
      scanRates: [1, 5],
      currents: [
        [2, 4, 6, 8],
        [10, 20, 30, 40]
      ],
      branches: [{ branchIndex: 0, direction: 1, startIndex: 0, endIndex: 3 }]
    });
    expect(input).toEqual(snapshot);
  });

  it("never adds potentials outside the intersection or extrapolates", () => {
    const result = interpolateCommonGrid([
      { label: "a", scanRate: 1, points: [{ potential: -2, current: 1 }, { potential: 0, current: 2 }] },
      { label: "b", scanRate: 2, points: [{ potential: -1, current: 3 }, { potential: 2, current: 4 }] }
    ]);

    expect(result.potentials).toEqual([-1, 0]);
    expect(result.currents[0]).toEqual([1.5, 2]);
    expect(result.currents[1][0]).toBe(3);
    expect(result.currents[1][1]).toBeCloseTo(10 / 3, 14);
  });

  it("rejects series whose potential ranges do not overlap", () => {
    expectCvError(() => interpolateCommonGrid([
      { label: "a", scanRate: 1, points: [{ potential: 0, current: 1 }, { potential: 1, current: 2 }] },
      { label: "b", scanRate: 2, points: [{ potential: 2, current: 3 }, { potential: 3, current: 4 }] }
    ]), "noCommonPotentialRange");
  });

  it("rejects structurally invalid duplicate potentials with a stable typed error", () => {
    expectCvError(() => interpolateCommonGrid([
      {
        label: "duplicate",
        scanRate: 1,
        points: [{ potential: 0, current: 1 }, { potential: 0, current: 2 }]
      }
    ]), "invalidCycleStructure");
  });

  it("preserves a shared turning point once and records overlapping branch spans", () => {
    const result = interpolateCommonGrid([
      {
        label: "shared",
        scanRate: 1,
        points: [
          { potential: 0, current: 1 },
          { potential: 1, current: 2 },
          { potential: 2, current: 3 },
          { potential: 1, current: 20 },
          { potential: 0, current: 10 }
        ]
      }
    ]);

    expect(result.potentials).toEqual([0, 1, 2, 1, 0]);
    expect(result.branches).toEqual([
      { branchIndex: 0, direction: 1, startIndex: 0, endIndex: 2 },
      { branchIndex: 1, direction: -1, startIndex: 2, endIndex: 4 }
    ]);
    expect(result.currents[0]).toEqual([1, 2, 3, 20, 10]);
  });

  it("keeps separate turning-point rows when any aligned series records both sides", () => {
    const result = interpolateCommonGrid([
      {
        label: "double",
        scanRate: 1,
        points: [
          { potential: 0, current: 1 },
          { potential: 1, current: 2 },
          { potential: 2, current: 3 },
          { potential: 2, current: 30 },
          { potential: 1, current: 20 },
          { potential: 0, current: 10 }
        ]
      },
      {
        label: "shared",
        scanRate: 2,
        points: [
          { potential: 0, current: 10 },
          { potential: 1, current: 20 },
          { potential: 2, current: 30 },
          { potential: 1, current: 200 },
          { potential: 0, current: 100 }
        ]
      }
    ]);

    expect(result.potentials).toEqual([0, 1, 2, 2, 1, 0]);
    expect(result.branches).toEqual([
      { branchIndex: 0, direction: 1, startIndex: 0, endIndex: 2 },
      { branchIndex: 1, direction: -1, startIndex: 3, endIndex: 5 }
    ]);
    expect(result.currents).toEqual([
      [1, 2, 3, 30, 20, 10],
      [10, 20, 30, 30, 200, 100]
    ]);
  });

  it("reuses a shared series endpoint at both mixed-boundary positions when turning extents differ", () => {
    const result = interpolateCommonGrid([
      {
        label: "double-at-two",
        scanRate: 1,
        points: [
          { potential: 0, current: 0 },
          { potential: 1, current: 10 },
          { potential: 2, current: 20 },
          { potential: 2, current: 200 },
          { potential: 1, current: 100 },
          { potential: 0, current: 0 }
        ]
      },
      {
        label: "shared-at-three",
        scanRate: 2,
        points: [
          { potential: 0, current: 0 },
          { potential: 1, current: 10 },
          { potential: 3, current: 30 },
          { potential: 1, current: 300 },
          { potential: 0, current: 0 }
        ]
      }
    ]);

    expect(result.potentials).toEqual([0, 1, 2, 2, 1, 0]);
    expect(result.currents).toEqual([
      [0, 10, 20, 200, 100, 0],
      [0, 10, 20, 20, 300, 0]
    ]);
  });

  it("retains all three branches in source order across two turns", () => {
    const result = interpolateCommonGrid([{
      label: "two-turn",
      scanRate: 1,
      points: [
        { potential: 0, current: 1 },
        { potential: 1, current: 2 },
        { potential: 2, current: 3 },
        { potential: 1, current: 4 },
        { potential: 0, current: 5 },
        { potential: 1, current: 6 },
        { potential: 2, current: 7 }
      ]
    }]);

    expect(result.potentials).toEqual([0, 1, 2, 1, 0, 1, 2]);
    expect(result.branches).toEqual([
      { branchIndex: 0, direction: 1, startIndex: 0, endIndex: 2 },
      { branchIndex: 1, direction: -1, startIndex: 2, endIndex: 4 },
      { branchIndex: 2, direction: 1, startIndex: 4, endIndex: 6 }
    ]);
    expect(result.currents[0]).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("interpolates each branch from that branch's measured-potential union", () => {
    const result = interpolateCommonGrid([
      {
        label: "sparse-forward",
        scanRate: 1,
        points: [
          { potential: 0, current: 0 },
          { potential: 2, current: 20 },
          { potential: 1, current: 30 },
          { potential: 0, current: 0 }
        ]
      },
      {
        label: "sparse-reverse",
        scanRate: 2,
        points: [
          { potential: 0, current: 0 },
          { potential: 1, current: 100 },
          { potential: 2, current: 200 },
          { potential: 0, current: 0 }
        ]
      }
    ]);

    expect(result.potentials).toEqual([0, 1, 2, 1, 0]);
    expect(result.currents).toEqual([
      [0, 10, 20, 30, 0],
      [0, 100, 200, 100, 0]
    ]);
  });

  it("rejects empty, non-finite, and non-positive inputs without returning invalid numbers", () => {
    expectCvError(() => interpolateCommonGrid([]), "noSeries");
    expectCvError(() => interpolateCommonGrid([{ label: "empty", scanRate: 1, points: [] }]), "noPoints");
    expectCvError(() => interpolateCommonGrid([
      { label: "bad-rate", scanRate: 0, points: [{ potential: 0, current: 1 }] }
    ]), "invalidScanRate");
    expectCvError(() => interpolateCommonGrid([
      { label: "bad-potential", scanRate: 1, points: [{ potential: Number.NaN, current: 1 }] }
    ]), "invalidPotential");
    expectCvError(() => interpolateCommonGrid([
      { label: "bad-current", scanRate: 1, points: [{ potential: 0, current: Number.POSITIVE_INFINITY }] }
    ]), "invalidCurrent");
  });
});

describe("analyzeBValue", () => {
  it("keeps repeated potentials branch-addressable and fits each branch's currents", () => {
    const records = attemptBValueFits(makeCompleteLoopFitData())
      .filter((record) => record.potential === 1);

    expect(records.map(({ sequenceIndex, branchIndex }) => ({ sequenceIndex, branchIndex }))).toEqual([
      { sequenceIndex: 1, branchIndex: 0 },
      { sequenceIndex: 3, branchIndex: 1 }
    ]);
    expect(records[0].fit!.intercept).toBeCloseTo(Math.log(2), 10);
    expect(records[1].fit!.intercept).toBeCloseTo(Math.log(7), 10);
  });

  it.each([0.5, 1])("recovers a synthetic b value of %s", (expectedB) => {
    const result = analyzeBValue(makeBValueData({ a: 2.5, b: expectedB, scanRates: [1, 2, 5, 10] }));

    expect(result).toHaveLength(1);
    expect(result[0].b).toBeCloseTo(expectedB, 10);
    expect(result[0].intercept).toBeCloseTo(Math.log(2.5), 10);
    expect(result[0].rSquared).toBeCloseTo(1, 10);
    expect(result[0].pointCount).toBe(4);
    expect(result[0].fitPoints).toHaveLength(4);
  });

  it("uses current magnitude for wholly negative currents", () => {
    const result = analyzeBValue(makeBValueData({ a: 3, b: 0.75, scanRates: [1, 3, 9], sign: -1 }));

    expect(result[0].b).toBeCloseTo(0.75, 10);
    expect(result[0].intercept).toBeCloseTo(Math.log(3), 10);
  });

  it("skips zero and non-finite currents while requiring three usable rates", () => {
    const data: InterpolatedCvData = {
      potentials: [0],
      scanRates: [1, 2, 4, 8, 16],
      currents: [[2], [0], [Number.NaN], [16], [32]]
    };

    const result = analyzeBValue(data);
    expect(result[0].b).toBeCloseTo(1, 10);
    expect(result[0].pointCount).toBe(3);
    expect(result[0].fitPoints).toEqual([
      { logScanRate: 0, logCurrentMagnitude: Math.log(2) },
      { logScanRate: Math.log(8), logCurrentMagnitude: Math.log(16) },
      { logScanRate: Math.log(16), logCurrentMagnitude: Math.log(32) }
    ]);
  });

  it("returns no fit with fewer than three distinct positive scan rates", () => {
    expect(analyzeBValue({ potentials: [0], scanRates: [1, 1], currents: [[2], [3]] })).toEqual([]);
    expect(analyzeBValue({ potentials: [0], scanRates: [1, 2], currents: [[2], [4]] })).toEqual([]);
    expect(analyzeBValue({ potentials: [0], scanRates: [0, -1, 2], currents: [[1], [2], [4]] })).toEqual([]);
  });

  it("keeps extreme logarithmic fits finite", () => {
    const result = analyzeBValue({
      potentials: [0],
      scanRates: [Number.MIN_VALUE, Math.sqrt(Number.MIN_VALUE), 1],
      currents: [[Number.MAX_VALUE], [1], [Number.MIN_VALUE]]
    });

    expect(result).toHaveLength(1);
    expect([
      result[0].potential,
      result[0].b,
      result[0].intercept,
      result[0].rSquared,
      ...result[0].fitPoints.flatMap((point) => [point.logScanRate, point.logCurrentMagnitude])
    ].every(Number.isFinite)).toBe(true);
  });
});

describe("analyzeDunn", () => {
  it("keeps repeated potentials branch-addressable and fits each branch's currents", () => {
    const records = attemptDunnFits(makeCompleteLoopFitData())
      .filter((record) => record.potential === 1);

    expect(records.map(({ sequenceIndex, branchIndex }) => ({ sequenceIndex, branchIndex }))).toEqual([
      { sequenceIndex: 1, branchIndex: 0 },
      { sequenceIndex: 3, branchIndex: 1 }
    ]);
    expect(records[0].fit!.k1).toBeCloseTo(2, 10);
    expect(records[0].fit!.k2).toBeCloseTo(0, 10);
    expect(records[1].fit!.k1).toBeCloseTo(7, 10);
    expect(records[1].fit!.k2).toBeCloseTo(0, 10);
  });

  it("recovers signed k1 and k2 coefficients and normalized contributions", () => {
    const result = analyzeDunn(makeDunnData({ k1: 1.7, k2: -0.8, scanRates: [1, 2, 5, 10] }));

    expect(result.points).toHaveLength(3);
    expect(result.points[0].k1).toBeCloseTo(1.7, 10);
    expect(result.points[0].k2).toBeCloseTo(-0.8, 10);
    expect(result.points[0].rSquared).toBeCloseTo(1, 10);
    expect(result.points[0].pointCount).toBe(4);
    expect(result.contributions).toHaveLength(4);
    for (const current of result.contributions[0].capacitiveCurrent) {
      expect(current).toBeCloseTo(1.7, 10);
    }
    for (const current of result.contributions[0].diffusionCurrent) {
      expect(current).toBeCloseTo(-0.8, 10);
    }
    expect(result.contributions[0].capacitivePercent + result.contributions[0].diffusionPercent)
      .toBeCloseTo(100, 10);
    expect(result.contributions[0]).toMatchObject({
      validPointCount: 3,
      sampledPointCount: 3,
      coveragePercent: 100
    });
  });

  it("integrates component magnitudes without anodic/cathodic cancellation", () => {
    const potentials = [0, 1, 2];
    const scanRates = [1, 4, 9];
    const k1 = [-2, 2, -2];
    const k2 = [1, -1, 1];
    const data: InterpolatedCvData = {
      potentials,
      scanRates,
      currents: scanRates.map((scanRate) => potentials.map((_, index) =>
        k1[index] * scanRate + k2[index] * Math.sqrt(scanRate)
      ))
    };

    const result = analyzeDunn(data);
    const contribution = result.contributions[0];

    contribution.capacitiveCurrent.forEach((current, index) => expect(current).toBeCloseTo(k1[index], 10));
    contribution.diffusionCurrent.forEach((current, index) => expect(current).toBeCloseTo(k2[index], 10));
    expect(contribution.capacitivePercent).toBeCloseTo(2 / 3 * 100, 10);
    expect(contribution.diffusionPercent).toBeCloseTo(1 / 3 * 100, 10);
  });

  it("integrates both sides of a shared-turning-point loop once with positive branch widths", () => {
    const data: InterpolatedCvData = {
      potentials: [0, 1, 2, 1, 0],
      scanRates: [1],
      currents: [[0, 0, 0, 0, 0]],
      branches: [
        { branchIndex: 0, direction: 1, startIndex: 0, endIndex: 2 },
        { branchIndex: 1, direction: -1, startIndex: 2, endIndex: 4 }
      ]
    };
    const contribution = integrateDunnContributions(data, [
      { k1: 1, k2: 4 },
      { k1: 1, k2: 4 },
      { k1: 1, k2: 4 },
      { k1: 3, k2: 1 },
      { k1: 3, k2: 1 }
    ])[0];

    expect(contribution.capacitivePercent).toBeCloseTo(7 / 18.5 * 100, 10);
    expect(contribution.diffusionPercent).toBeCloseTo(11.5 / 18.5 * 100, 10);
    expect(contribution).toMatchObject({
      validPointCount: 5,
      sampledPointCount: 5,
      coveragePercent: 100
    });
  });

  it.each([
    {
      name: "a gap between branch endpoints",
      potentials: [0, 1, 3, 6, 4, 2],
      expectedCapacitivePercent: 19 / 32 * 100
    },
    {
      name: "separately duplicated turning potentials",
      potentials: [0, 1, 2, 2, 1, 0],
      expectedCapacitivePercent: 10 / 18 * 100
    }
  ])("does not create a cross-branch interval for $name", ({ potentials, expectedCapacitivePercent }) => {
    const data: InterpolatedCvData = {
      potentials,
      scanRates: [1],
      currents: [potentials.map(() => 0)],
      branches: [
        { branchIndex: 0, direction: 1, startIndex: 0, endIndex: 2 },
        { branchIndex: 1, direction: -1, startIndex: 3, endIndex: 5 }
      ]
    };
    const contribution = integrateDunnContributions(data, [
      { k1: 1, k2: 3 },
      { k1: 1, k2: 3 },
      { k1: 1, k2: 3 },
      { k1: 4, k2: 1 },
      { k1: 4, k2: 1 },
      { k1: 4, k2: 1 }
    ])[0];

    expect(contribution.capacitivePercent).toBeCloseTo(expectedCapacitivePercent, 10);
    expect(contribution.diffusionPercent).toBeCloseTo(100 - expectedCapacitivePercent, 10);
    expect(contribution).toMatchObject({
      validPointCount: 6,
      sampledPointCount: 6,
      coveragePercent: 100
    });
  });

  it("lets a null coefficient break only intervals in its own branch", () => {
    const data: InterpolatedCvData = {
      potentials: [0, 1, 2, 5, 4, 3],
      scanRates: [1],
      currents: [[0, 0, 0, 0, 0, 0]],
      branches: [
        { branchIndex: 0, direction: 1, startIndex: 0, endIndex: 2 },
        { branchIndex: 1, direction: -1, startIndex: 3, endIndex: 5 }
      ]
    };
    const contribution = integrateDunnContributions(data, [
      { k1: 1, k2: 1 },
      null,
      { k1: 1, k2: 4 },
      { k1: 3, k2: 1 },
      { k1: 3, k2: 1 },
      { k1: 3, k2: 1 }
    ])[0];

    expect(contribution.capacitivePercent).toBeCloseTo(75, 10);
    expect(contribution.diffusionPercent).toBeCloseTo(25, 10);
    expect(contribution.validPointCount).toBe(5);
    expect(contribution.sampledPointCount).toBe(6);
    expect(contribution.coveragePercent).toBeCloseTo(5 / 6 * 100, 10);
  });

  it("uses only adjacent intervals where both reconstructed components are jointly valid", () => {
    const data: InterpolatedCvData = {
      potentials: [0, 1, 2],
      scanRates: [1, 4, 9],
      currents: [
        [3, 3, 3],
        [10, Number.NaN, 10],
        [21, Number.NaN, 21]
      ]
    };

    const result = analyzeDunn(data);
    expect(result.points.map((point) => point.potential)).toEqual([0, 2]);
    expect(result.contributions).toEqual([]);
  });

  it("preserves a failed potential fit as null when other intervals support a valid summary", () => {
    const data: InterpolatedCvData = {
      potentials: [0, 1, 2, 3],
      scanRates: [1, 4, 9],
      currents: [
        [3, 3, 3, 3],
        [10, Number.NaN, 10, 10],
        [21, Number.NaN, 21, 21]
      ]
    };

    const contribution = analyzeDunn(data).contributions[0];
    expect(contribution.capacitiveCurrent[1]).toBeNull();
    expect(contribution.diffusionCurrent[1]).toBeNull();
    expect(contribution.capacitiveCurrent[0]).not.toBe(0);
    expect(contribution.diffusionCurrent[0]).not.toBe(0);
  });

  it("uses one joint null mask when either reconstructed component is non-finite", () => {
    const data: InterpolatedCvData = {
      potentials: [0, 1, 2, 3],
      scanRates: [Number.MAX_VALUE],
      currents: [[0, 0, 0, 0]]
    };

    const contribution = integrateDunnContributions(data, [
      { k1: 1, k2: 1 },
      { k1: 2, k2: 1 },
      { k1: 0, k2: 1 },
      { k1: 0, k2: 1 }
    ])[0];

    expect(contribution).toBeDefined();
    expect(contribution.capacitiveCurrent[1]).toBeNull();
    expect(contribution.diffusionCurrent[1]).toBeNull();
    expect(contribution.validPointCount).toBe(3);
    expect(contribution.coveragePercent).toBe(75);
  });

  it("returns no contribution percentages when total magnitude is zero", () => {
    const result = analyzeDunn(makeDunnData({ k1: 0, k2: 0, scanRates: [1, 4, 9] }));

    expect(result.points).toHaveLength(3);
    expect(result.contributions).toEqual([]);
  });

  it("returns no fits when scan rates have zero variance or are not positive", () => {
    expect(analyzeDunn(makeDunnData({ k1: 1, k2: 2, scanRates: [2, 2] }))).toEqual({
      points: [],
      contributions: []
    });
    expect(analyzeDunn({ potentials: [0], scanRates: [0, -1], currents: [[1], [2]] })).toEqual({
      points: [],
      contributions: []
    });
  });

  it("rejects malformed matrix dimensions with a stable typed error", () => {
    expectCvError(() => analyzeBValue({ potentials: [0, 1], scanRates: [1], currents: [[2]] }), "invalidDataShape");
    expectCvError(() => analyzeDunn({ potentials: [0], scanRates: [1, 2], currents: [[2]] }), "invalidDataShape");
  });
});
