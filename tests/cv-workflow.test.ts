import { describe, expect, it } from "vitest";
import { analyzeCvWorkflow } from "../src/lib/cvWorkflow";
import { CvAnalysisError, type CvAnalysisSettings, type CvSeries } from "../src/lib/cvTypes";
import {
  makeBp150RegressionSeries,
  makeNcpRegressionSeries,
  makeResolutionStabilitySeries,
  makeSyntheticConstrainedDunnSeries
} from "./fixtures/cvRegressionData";

function expectCvError(action: () => unknown, code: CvAnalysisError["code"]) {
  try {
    action();
    throw new Error("expectedCvAnalysisError");
  } catch (error) {
    expect(error).toBeInstanceOf(CvAnalysisError);
    expect((error as CvAnalysisError).code).toBe(code);
  }
}

function makeLowQualitySeries(): CvSeries[] {
  const scanRates = [1, 4, 9, 16];
  const amplitudes = [1, 10, 2, 20];
  const potentials = [-1, -0.5, 0, -0.5, -1];
  return scanRates.map((scanRate, seriesIndex) => ({
    label: String(scanRate),
    scanRate,
    points: potentials.map((potential, pointIndex) => ({
      potential,
      current: amplitudes[seriesIndex] * (1.5 + potential) + 0.1 * pointIndex
    }))
  }));
}

function makePowerLawLoop(options: {
  scanRates?: number[];
  distortForwardMiddle?: boolean;
  distortReverseMiddle?: boolean;
} = {}): CvSeries[] {
  const scanRates = options.scanRates ?? [1, 4, 9, 16];
  const potentials = [-1, -0.5, 0, -0.5, -1];
  return scanRates.map((scanRate, seriesIndex) => ({
    label: String(scanRate),
    scanRate,
    points: potentials.map((potential, pointIndex) => {
      if (options.distortForwardMiddle && pointIndex === 1) {
        return { potential, current: [1, 100, 2, 50][seriesIndex]! };
      }
      if (options.distortReverseMiddle && pointIndex === 3) {
        return { potential, current: [1, 100, 2, 50][seriesIndex]! };
      }
      return {
        potential,
        current: (1 + pointIndex) * scanRate + (2 + pointIndex) * Math.sqrt(scanRate)
      };
    })
  }));
}

const settings: CvAnalysisSettings = {
  potentialInterval: { mode: "auto" },
  rSquaredThreshold: 0.95,
  dunnConfidenceMode: "threshold",
  turningPointTrim: { mode: "auto" }
};

describe("analyzeCvWorkflow quality records", () => {
  it("keeps b-value threshold filtering while retaining low-R2 Dunn fits", () => {
    const result = analyzeCvWorkflow(makeLowQualitySeries(), settings);
    expect(result.bRecords.some((record) => record.status === "belowRSquaredThreshold")).toBe(true);
    expect(result.dunnRecords.forward.some((record) => (record.fit?.rSquared ?? 1) < 0.95)).toBe(true);
    expect(result.contributions.every((item) => item.g.every(Number.isFinite))).toBe(true);
  });

  it("weighted Dunn mode does not change b-value filtering", () => {
    const threshold = analyzeCvWorkflow(makeLowQualitySeries(), settings);
    const weighted = analyzeCvWorkflow(makeLowQualitySeries(), { ...settings, dunnConfidenceMode: "weighted" });
    expect(weighted.bRecords.map(({ status }) => status)).toEqual(threshold.bRecords.map(({ status }) => status));
    expect(weighted.contributions).toHaveLength(threshold.contributions.length);
  });

  it("keeps b-value threshold statuses and disables b-value exclusion at threshold zero", () => {
    const unfiltered = analyzeCvWorkflow(makePowerLawLoop({ distortForwardMiddle: true }), {
      ...settings,
      rSquaredThreshold: 0
    });
    const strict = analyzeCvWorkflow(makePowerLawLoop({ distortForwardMiddle: true }), settings);

    expect(unfiltered.bRecords.every((record) =>
      record.fit === null || record.status === "valid"
    )).toBe(true);
    expect(strict.bRecords.filter((record) => record.potential === -0.5)
      .map(({ sequenceIndex, branchIndex, status }) => ({ sequenceIndex, branchIndex, status }))).toEqual([
      { sequenceIndex: 1, branchIndex: 0, status: "belowRSquaredThreshold" },
      { sequenceIndex: 3, branchIndex: 1, status: "valid" }
    ]);
    expect(strict.bRecords.find((record) => record.status === "belowRSquaredThreshold")?.fit).not.toBeNull();
    expect(strict.summary.excludedBCount).toBeGreaterThan(0);
  });

  it("reports zero-current logarithms and fewer than three distinct rates without dropping b-value rows", () => {
    const zeroCurrent = analyzeCvWorkflow(
      makePowerLawLoop().map((series) => ({
        ...series,
        points: series.points.map((point, pointIndex) => ({
          ...point,
          current: pointIndex === 1 ? 0 : point.current
        }))
      })),
      settings
    );
    const twoRates = analyzeCvWorkflow(makePowerLawLoop({ scanRates: [1, 4] }), settings);

    expect(zeroCurrent.bRecords.some((record) => record.status === "zeroCurrentLogUnavailable")).toBe(true);
    expect(twoRates.bRecords.every((record) => record.status === "insufficientData")).toBe(true);
    expect(twoRates.summary.unavailableBCount).toBe(twoRates.bRecords.length);
  });

  it.each([-0.01, 1.01, Number.NaN])("rejects invalid R-squared threshold %s", (rSquaredThreshold) => {
    expectCvError(
      () => analyzeCvWorkflow(makePowerLawLoop(), { ...settings, rSquaredThreshold }),
      "invalidRSquaredThreshold"
    );
  });

  it("maps invalid potential interval settings to a stable workflow error", () => {
    expectCvError(
      () => analyzeCvWorkflow(makePowerLawLoop(), {
        ...settings,
        potentialInterval: { mode: "manual", millivolts: 0 }
      }),
      "invalidPotentialInterval"
    );
  });

  it("maps invalid turning-point trim settings to a stable workflow error", () => {
    expectCvError(
      () => analyzeCvWorkflow(makePowerLawLoop(), {
        ...settings,
        turningPointTrim: { mode: "manual", millivolts: 500 }
      }),
      "invalidTurningPointTrim"
    );
  });
});

describe("constrained Dunn regression datasets", () => {
  it.each([
    ["NCP", makeNcpRegressionSeries],
    ["BP150", makeBp150RegressionSeries],
    ["synthetic", makeSyntheticConstrainedDunnSeries]
  ] as const)("keeps %s contributions finite and bounded in both confidence modes", (_name, makeSeries) => {
    const series = makeSeries();
    for (const dunnConfidenceMode of ["threshold", "weighted"] as const) {
      const result = analyzeCvWorkflow(series, { ...settings, dunnConfidenceMode });
      expect(result.contributions).toHaveLength(series.length);
      for (const contribution of result.contributions) {
        expect(contribution.g.every((value) => value >= 0 && value <= 1)).toBe(true);
        expect(contribution.capacitiveForward.every(Number.isFinite)).toBe(true);
        expect(contribution.capacitiveReverse.every(Number.isFinite)).toBe(true);
        expect(contribution.diffusionForward.every(Number.isFinite)).toBe(true);
        expect(contribution.diffusionReverse.every(Number.isFinite)).toBe(true);
        expect(contribution.capacitivePercent).toBeGreaterThanOrEqual(0);
        expect(contribution.capacitivePercent).toBeLessThanOrEqual(100);
      }
    }
  });

  it("preserves the BP150 low-fit-quality warning without hard-coded percentages", () => {
    const result = analyzeCvWorkflow(makeBp150RegressionSeries(), settings);
    expect(result.contributions.every((item) => item.diagnostics.lowFitQuality)).toBe(true);
  });

  it("keeps one continuous model stable when only grid density changes tenfold", () => {
    const baseline = analyzeCvWorkflow(makeResolutionStabilitySeries(51), settings);
    const dense = analyzeCvWorkflow(makeResolutionStabilitySeries(501), settings);
    const maximumPercentageDifference = Math.max(...dense.contributions.map((item, index) =>
      Math.abs(item.capacitivePercent - baseline.contributions[index]!.capacitivePercent)));
    expect(maximumPercentageDifference).toBeLessThan(0.5);

    dense.contributions.forEach((item, seriesIndex) => {
      const coarse = baseline.contributions[seriesIndex]!;
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        const coarseIndex = Math.round(fraction * (coarse.g.length - 1));
        const denseIndex = Math.round(fraction * (item.g.length - 1));
        expect(Math.abs(item.g[denseIndex]! - coarse.g[coarseIndex]!)).toBeLessThan(0.02);
      }
    });
  });
});
