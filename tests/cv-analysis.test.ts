import { describe, expect, it } from "vitest";
import { analyzeBValue, analyzeDunn, interpolateCommonGrid } from "../src/lib/cvAnalysis";
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
          { potential: 4, current: 8 },
          { potential: 2, current: 4 },
          { potential: 0, current: 0 }
        ]
      },
      {
        label: "fast",
        scanRate: 5,
        points: [
          { potential: 3, current: 30 },
          { potential: 5, current: 50 },
          { potential: 1, current: 10 }
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
      ]
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

  it("rejects duplicate potentials within a series with a stable typed error", () => {
    expectCvError(() => interpolateCommonGrid([
      {
        label: "duplicate",
        scanRate: 1,
        points: [{ potential: 0, current: 1 }, { potential: 0, current: 2 }]
      }
    ]), "duplicatePotential");
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

  it("skips zero and non-finite currents", () => {
    const data: InterpolatedCvData = {
      potentials: [0],
      scanRates: [1, 2, 4, 8],
      currents: [[2], [0], [Number.NaN], [16]]
    };

    const result = analyzeBValue(data);
    expect(result[0].b).toBeCloseTo(1, 10);
    expect(result[0].pointCount).toBe(2);
    expect(result[0].fitPoints).toEqual([
      { logScanRate: 0, logCurrentMagnitude: Math.log(2) },
      { logScanRate: Math.log(8), logCurrentMagnitude: Math.log(16) }
    ]);
  });

  it("returns no fit with fewer than two distinct positive scan rates", () => {
    expect(analyzeBValue({ potentials: [0], scanRates: [1, 1], currents: [[2], [3]] })).toEqual([]);
    expect(analyzeBValue({ potentials: [0], scanRates: [0, -1, 2], currents: [[1], [2], [0]] })).toEqual([]);
  });

  it("keeps extreme logarithmic fits finite", () => {
    const result = analyzeBValue({
      potentials: [0],
      scanRates: [Number.MIN_VALUE, 1],
      currents: [[Number.MAX_VALUE], [Number.MIN_VALUE]]
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
