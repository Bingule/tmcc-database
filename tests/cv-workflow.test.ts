import { describe, expect, it } from "vitest";
import { analyzeCvWorkflow, selectPointInterval } from "../src/lib/cvWorkflow";
import { CvAnalysisError, type CvSeries, type InterpolatedCvData } from "../src/lib/cvTypes";

function expectCvError(action: () => unknown, code: CvAnalysisError["code"]) {
  try {
    action();
    throw new Error("expectedCvAnalysisError");
  } catch (error) {
    expect(error).toBeInstanceOf(CvAnalysisError);
    expect((error as CvAnalysisError).code).toBe(code);
  }
}

function makeSeries(potentials: number[], scanRates: number[], currentsByPotential: number[][]): CvSeries[] {
  return scanRates.map((scanRate, seriesIndex) => ({
    label: `rate-${scanRate}`,
    scanRate,
    points: potentials.map((potential, potentialIndex) => ({
      potential,
      current: currentsByPotential[potentialIndex][seriesIndex]
    }))
  }));
}

describe("selectPointInterval", () => {
  const data: InterpolatedCvData = {
    potentials: [0, 1, 2, 3, 4, 5, 6],
    scanRates: [1, 2, 5],
    currents: [
      [1, 2, 3, 4, 5, 6, 7],
      [2, 3, 4, 5, 6, 7, 8],
      [3, 4, 5, 6, 7, 8, 9]
    ]
  };

  it("retains indices 0, N, 2N and the final common-grid point", () => {
    const selected = selectPointInterval(data, 5);

    expect(selected.potentials).toEqual([0, 5, 6]);
    expect(selected.currents[0]).toEqual([1, 6, 7]);
    expect(selected.scanRates).toEqual(data.scanRates);
  });

  it("returns independent arrays at interval 1 and retains both ends at interval 30", () => {
    const all = selectPointInterval(data, 1);
    const endpoints = selectPointInterval(data, 30);

    expect(all).toEqual(data);
    expect(all).not.toBe(data);
    expect(all.potentials).not.toBe(data.potentials);
    expect(all.scanRates).not.toBe(data.scanRates);
    expect(all.currents).not.toBe(data.currents);
    expect(all.currents[0]).not.toBe(data.currents[0]);
    expect(endpoints.potentials).toEqual([0, 6]);
    expect(endpoints.currents[2]).toEqual([3, 9]);
  });

  it.each([0, 31, 1.5, Number.NaN])("rejects invalid interval %s with a stable error", (interval) => {
    expectCvError(() => selectPointInterval(data, interval), "invalidPointInterval");
  });
});

describe("analyzeCvWorkflow quality records", () => {
  it("retains finite low-quality fits and disables exclusion at threshold zero", () => {
    const series = makeSeries([0], [1, 4, 9], [[1, 100, 2]]);

    const unfiltered = analyzeCvWorkflow(series, { pointInterval: 1, rSquaredThreshold: 0 });
    const strict = analyzeCvWorkflow(series, { pointInterval: 1, rSquaredThreshold: 1 });

    expect(unfiltered.bRecords).toHaveLength(1);
    expect(unfiltered.dunnRecords).toHaveLength(1);
    expect(unfiltered.bRecords[0].status).toBe("valid");
    expect(unfiltered.dunnRecords[0].status).toBe("valid");
    expect(strict.bRecords[0]).toMatchObject({ status: "belowRSquaredThreshold" });
    expect(strict.dunnRecords[0]).toMatchObject({ status: "belowRSquaredThreshold" });
    expect(strict.bRecords[0].fit).not.toBeNull();
    expect(strict.dunnRecords[0].fit).not.toBeNull();
    expect(strict.bRecords[0].fit!.rSquared).toBeLessThan(1);
    expect(strict.dunnRecords[0].fit!.rSquared).toBeLessThan(1);
    expect(strict.summary).toMatchObject({
      commonPointCount: 1,
      retainedPointCount: 1,
      validBCount: 0,
      excludedBCount: 1,
      unavailableBCount: 0,
      validDunnCount: 0,
      excludedDunnCount: 1,
      unavailableDunnCount: 0
    });
  });

  it("reports zero-current logarithms and fewer than three distinct rates without dropping rows", () => {
    const zeroCurrent = analyzeCvWorkflow(
      makeSeries([0], [1, 4, 9], [[0, 0, 0]]),
      { pointInterval: 1, rSquaredThreshold: 0.95 }
    );
    const twoRates = analyzeCvWorkflow(
      makeSeries([0], [1, 4], [[2, 8]]),
      { pointInterval: 1, rSquaredThreshold: 0.95 }
    );

    expect(zeroCurrent.bRecords).toEqual([{
      potential: 0,
      fit: null,
      status: "zeroCurrentLogUnavailable"
    }]);
    expect(zeroCurrent.dunnRecords[0].status).toBe("valid");
    expect(twoRates.bRecords).toEqual([{
      potential: 0,
      fit: null,
      status: "insufficientData"
    }]);
    expect(twoRates.dunnRecords).toEqual([{
      potential: 0,
      fit: null,
      status: "insufficientData"
    }]);
    expect(twoRates.summary.unavailableBCount).toBe(1);
    expect(twoRates.summary.unavailableDunnCount).toBe(1);
  });

  it("uses regressionFailed when three finite Dunn points cannot produce finite coefficients", () => {
    const scanRates = [Number.MIN_VALUE, 2 * Number.MIN_VALUE, 4 * Number.MIN_VALUE];
    const normalizedCurrents = [-Number.MAX_VALUE / 2, 0, Number.MAX_VALUE / 2];
    const currents = scanRates.map((scanRate, index) => normalizedCurrents[index] * Math.sqrt(scanRate));

    const result = analyzeCvWorkflow(
      makeSeries([0], scanRates, [currents]),
      { pointInterval: 1, rSquaredThreshold: 0 }
    );

    expect(currents.every(Number.isFinite)).toBe(true);
    expect(result.dunnRecords).toEqual([{
      potential: 0,
      fit: null,
      status: "regressionFailed"
    }]);
  });

  it.each([-0.01, 1.01, Number.NaN])("rejects invalid R-squared threshold %s", (rSquaredThreshold) => {
    const series = makeSeries([0], [1, 4, 9], [[1, 4, 9]]);
    expectCvError(
      () => analyzeCvWorkflow(series, { pointInterval: 1, rSquaredThreshold }),
      "invalidRSquaredThreshold"
    );
  });
});

describe("analyzeCvWorkflow Dunn mask and integration", () => {
  it("uses the valid Dunn mask for currents, contiguous integration, and coverage", () => {
    const potentials = [0, 1, 2, 3, 4];
    const scanRates = [1, 4, 9, 16];
    const k1 = [1, 1, 0, 9, 9];
    const k2 = [9, 1, 0, 1, 1];
    const currentsByPotential = potentials.map((_, potentialIndex) =>
      scanRates.map((scanRate) =>
        potentialIndex === 2
          ? [1, 100, 2, 50][scanRates.indexOf(scanRate)]
          : k1[potentialIndex] * scanRate + k2[potentialIndex] * Math.sqrt(scanRate)
      )
    );

    const result = analyzeCvWorkflow(
      makeSeries(potentials, scanRates, currentsByPotential),
      { pointInterval: 1, rSquaredThreshold: 0.95 }
    );
    const contribution = result.contributions.find((item) => item.scanRate === 1)!;

    expect(result.dunnRecords.map((record) => record.status)).toEqual([
      "valid",
      "valid",
      "belowRSquaredThreshold",
      "valid",
      "valid"
    ]);
    expect(contribution.capacitiveCurrent).toEqual([1, 1, null, 9, 9]);
    expect(contribution.diffusionCurrent).toEqual([9, 1, null, 1, 1]);
    expect(contribution.validPointCount).toBe(4);
    expect(contribution.sampledPointCount).toBe(5);
    expect(contribution.coveragePercent).toBe(80);
    expect(contribution.capacitivePercent).toBeCloseTo(62.5, 10);
    expect(contribution.diffusionPercent).toBeCloseTo(37.5, 10);
  });

  it("returns contribution unavailable when valid points have no contiguous pair", () => {
    const potentials = [0, 1, 2];
    const scanRates = [1, 4, 9, 16];
    const currentsByPotential = [
      scanRates.map((scanRate) => scanRate + Math.sqrt(scanRate)),
      [1, 100, 2, 50],
      scanRates.map((scanRate) => 2 * scanRate + 3 * Math.sqrt(scanRate))
    ];

    const result = analyzeCvWorkflow(
      makeSeries(potentials, scanRates, currentsByPotential),
      { pointInterval: 1, rSquaredThreshold: 0.95 }
    );

    expect(result.dunnRecords.map((record) => record.status)).toEqual([
      "valid",
      "belowRSquaredThreshold",
      "valid"
    ]);
    expect(result.contributions).toEqual([]);
  });
});
