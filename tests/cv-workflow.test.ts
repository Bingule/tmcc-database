import { describe, expect, it } from "vitest";
import { makeDunnFractionGrid } from "../src/lib/cvDunnConfidence";
import { secondDifferenceRoughness } from "../src/lib/cvDunnReconstruction";
import { pchipInterpolate } from "../src/lib/cvInterpolation";
import { analyzeCvWorkflow } from "../src/lib/cvWorkflow";
import { CvAnalysisError, type CvAnalysisSettings, type CvSeries, type CvWorkflowResult, type DunnFractionGrid } from "../src/lib/cvTypes";
import {
  makeBp150RegressionSeries,
  makeNcpRegressionSeries,
  makeResolutionStabilitySeries,
  makeSyntheticConstrainedDunnSeries,
  makeTurningPointRecoverySeries
} from "./fixtures/cvRegressionData";
import { makeThreePeakNcpLikeSeries } from "./fixtures/cvPeakData";

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
  const potentials = makeWorkflowLoopPotentials();
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
  const potentials = makeWorkflowLoopPotentials();
  return scanRates.map((scanRate, seriesIndex) => ({
    label: String(scanRate),
    scanRate,
    points: potentials.map((potential, pointIndex) => {
      if (options.distortForwardMiddle && pointIndex === 10) {
        return { potential, current: [1, 100, 2, 50][seriesIndex]! };
      }
      if (options.distortReverseMiddle && pointIndex === 30) {
        return { potential, current: [1, 100, 2, 50][seriesIndex]! };
      }
      return {
        potential,
        current: (1 + pointIndex) * scanRate + (2 + pointIndex) * Math.sqrt(scanRate)
      };
    })
  }));
}

function makeWorkflowLoopPotentials(): number[] {
  const forward = Array.from({ length: 21 }, (_, index) => -1 + index / 20);
  return [...forward, ...forward.slice(0, -1).reverse()];
}

const settings: CvAnalysisSettings = {
  potentialInterval: { mode: "auto" },
  rSquaredThreshold: 0.95,
  dunnConfidenceMode: "threshold",
  turningPointTrim: { mode: "auto" }
};

describe("analyzeCvWorkflow quality records", () => {
  it("adds peak-resolved b-value fits without changing the existing potential-resolved outputs", () => {
    const series = makeThreePeakNcpLikeSeries();
    const result = analyzeCvWorkflow(series, settings);

    expect(result.peakAnalysis.fits).toHaveLength(3);
    expect(result.peakAnalysis.fits.every((fit) => fit.points.length === series.length)).toBe(true);
    expect(result.bRecords.length).toBe(result.analysisGrid.potentials.length);
    expect(result.dunnRecords.forward).toHaveLength(result.alignedGrid.potentials.length);
    expect(result.dunnRecords.reverse).toHaveLength(result.alignedGrid.potentials.length);
  });

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
      { sequenceIndex: 10, branchIndex: 0, status: "belowRSquaredThreshold" },
      { sequenceIndex: 30, branchIndex: 1, status: "valid" }
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
        expect(contribution.g.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
        contribution.capacitiveForward.forEach((value, index) => {
          const lower = Math.min(contribution.originalForward[index]!, contribution.originalReverse[index]!);
          const upper = Math.max(contribution.originalForward[index]!, contribution.originalReverse[index]!);
          expect(value).toBeGreaterThanOrEqual(lower - 1e-10);
          expect(value).toBeLessThanOrEqual(upper + 1e-10);
        });
        contribution.capacitiveReverse.forEach((value, index) => {
          const lower = Math.min(contribution.originalForward[index]!, contribution.originalReverse[index]!);
          const upper = Math.max(contribution.originalForward[index]!, contribution.originalReverse[index]!);
          expect(value).toBeGreaterThanOrEqual(lower - 1e-10);
          expect(value).toBeLessThanOrEqual(upper + 1e-10);
        });
        expect(contribution.capacitiveForward.every(Number.isFinite)).toBe(true);
        expect(contribution.capacitiveReverse.every(Number.isFinite)).toBe(true);
        expect(contribution.diffusionForward.every(Number.isFinite)).toBe(true);
        expect(contribution.diffusionReverse.every(Number.isFinite)).toBe(true);
        expect(contribution.capacitivePercent).toBeGreaterThanOrEqual(0);
        expect(contribution.capacitivePercent).toBeLessThanOrEqual(100);
        expect(contribution.capacitivePercent + contribution.diffusionPercent).toBeCloseTo(100, 10);
        expect(contribution.diagnostics.maximumPositiveOvershoot).toBe(0);
        expect(contribution.diagnostics.maximumNegativeOvershoot).toBe(0);
        expect(contribution.diagnostics.maximumAbsoluteOvershoot).toBe(0);
        for (const record of contribution.plotPath) {
          if (record.originalCurrent >= 0) {
            expect(record.capacitiveCurrent).toBeGreaterThanOrEqual(0);
            expect(record.capacitiveCurrent).toBeLessThanOrEqual(record.originalCurrent);
          } else {
            expect(record.capacitiveCurrent).toBeGreaterThanOrEqual(record.originalCurrent);
            expect(record.capacitiveCurrent).toBeLessThanOrEqual(0);
          }
          expect(record.diffusionCurrent + record.capacitiveCurrent).toBeCloseTo(record.originalCurrent, 12);
        }
      }
    }
  });

  it.each([
    ["NCP", makeNcpRegressionSeries],
    ["BP150", makeBp150RegressionSeries]
  ] as const)("stabilizes sparse threshold evidence for %s before shared-g optimization", (_name, makeSeries) => {
    const result = analyzeCvWorkflow(makeSeries(), settings);

    for (const contribution of result.contributions) {
      const rawTarget = fillLinearGaps(combineContinuousWeightedTarget(makeDunnFractionGrid(
        result.dunnRecords,
        contribution.scanRate,
        "weighted",
        settings.rSquaredThreshold
      )));
      expect(contribution.diagnostics.confidenceBlend).toBeGreaterThan(0);
      expect(contribution.diagnostics.effectiveLambda).toBeCloseTo(
        contribution.diagnostics.baseLambda * contribution.diagnostics.smoothingMultiplier,
        12
      );
      expect(secondDifferenceRoughness(contribution.g, contribution.potentialGrid)).toBeLessThan(
        secondDifferenceRoughness(rawTarget, contribution.potentialGrid)
      );
    }
  });

  it("preserves the BP150 low-fit-quality warning without hard-coded percentages", () => {
    const result = analyzeCvWorkflow(makeBp150RegressionSeries(), settings);
    expect(result.contributions.every((item) => item.diagnostics.lowFitQuality)).toBe(true);
  });

  it("keeps one continuous model stable when only grid density changes tenfold", () => {
    const baseline = analyzeCvWorkflow(makeResolutionStabilitySeries(51), settings);
    const dense = analyzeCvWorkflow(makeResolutionStabilitySeries(501), settings);
    for (const contribution of [...baseline.contributions, ...dense.contributions]) {
      expect(contribution.diagnostics.effectiveAnchorCoverage).toBeLessThan(0.01);
      expect(contribution.diagnostics.confidenceBlend).toBeGreaterThan(0);
      expect(contribution.diagnostics.smoothingMultiplier).toBeGreaterThan(1);
      expect(Math.abs(
        contribution.diagnostics.forwardAnchorCoverage
        - contribution.diagnostics.reverseAnchorCoverage
      )).toBeLessThan(0.02);
    }
    const maximumPercentageDifference = Math.max(...dense.contributions.map((item, index) =>
      Math.abs(item.capacitivePercent - baseline.contributions[index]!.capacitivePercent)));
    const maximumFixedPotentialDifference = Math.max(...dense.contributions.flatMap((item, seriesIndex) => {
      const coarse = baseline.contributions[seriesIndex]!;
      return [0, 0.25, 0.5, 0.75, 1].map((fraction) => {
        const potential = item.potentialGrid[0]!
          + fraction * (item.potentialGrid.at(-1)! - item.potentialGrid[0]!);
        return Math.abs(
          evaluateG(item.potentialGrid, item.g, potential)
          - evaluateG(coarse.potentialGrid, coarse.g, potential)
        );
      });
    }));
    expect(maximumPercentageDifference).toBeLessThan(0.75);
    expect(maximumFixedPotentialDifference).toBeLessThan(0.02);
  });

  it("restores every singly and doubly recorded turning-point sample in the final path", () => {
    for (const recording of ["single", "double"] as const) {
      const result = analyzeCvWorkflow(makeTurningPointRecoverySeries(recording), settings);

      result.alignedGrid.cycles.forEach((cycle, seriesIndex) => {
        const contribution = result.contributions[seriesIndex]!;
        const turningRecords = cycle.originalPoints.flatMap((original, sourceIndex) =>
          cycle.turningPotentials.includes(original.potential) ? [{ original, sourceIndex }] : []);
        const expectedBranches = recording === "single"
          ? ["forward", "forward", "reverse"] as const
          : ["forward", "forward", "reverse", "reverse"] as const;
        expect(turningRecords).toHaveLength(expectedBranches.length);
        turningRecords.forEach(({ original, sourceIndex }, turningIndex) => {
          const reconstructed = contribution.plotPath[sourceIndex]!;
          expect(reconstructed.potential).toBe(original.potential);
          expect(reconstructed.branch).toBe(expectedBranches[turningIndex]);
          expect(reconstructed.targetCapacitiveCurrent).toBeCloseTo(
            original.current * evaluateG(contribution.potentialGrid, contribution.g, original.potential),
            12
          );
          expect(reconstructed.current).toBe(reconstructed.capacitiveCurrent);
          expect(reconstructed.capacitiveCurrent).toBeGreaterThanOrEqual(reconstructed.envelopeLower - 1e-10);
          expect(reconstructed.capacitiveCurrent).toBeLessThanOrEqual(reconstructed.envelopeUpper + 1e-10);
        });
      });
    }
  });

  it.each([
    ["NCP", makeNcpRegressionSeries],
    ["BP150", makeBp150RegressionSeries]
  ] as const)("keeps every %s scan rate inside its local CV envelope", (_name, makeSeries) => {
    for (const dunnConfidenceMode of ["threshold", "weighted"] as const) {
      const result = analyzeCvWorkflow(makeSeries(), { ...settings, dunnConfidenceMode });
      expectEnvelopeContained(result);
      const highest = result.contributions.reduce((best, item) => item.scanRate > best.scanRate ? item : best);
      expect(highest.diagnostics.maximumAbsoluteEnvelopeViolation).toBeLessThanOrEqual(1e-10);
    }
  });
});

function expectEnvelopeContained(result: CvWorkflowResult) {
  for (const contribution of result.contributions) {
    expect(contribution.g.every((value) => value >= 0 && value <= 1)).toBe(true);
    for (const record of contribution.plotPath) {
      const tolerance = 1e-10 * Math.max(1, Math.abs(record.originalCurrent), Math.abs(record.oppositeCurrent));
      expect(record.capacitiveCurrent).toBeGreaterThanOrEqual(record.envelopeLower - tolerance);
      expect(record.capacitiveCurrent).toBeLessThanOrEqual(record.envelopeUpper + tolerance);
      expect(Math.abs(record.capacitiveCurrent)).toBeLessThanOrEqual(Math.abs(record.originalCurrent) + tolerance);
      expect(record.capacitiveCurrent + record.diffusionCurrent).toBeCloseTo(record.originalCurrent, 10);
    }
    expect(contribution.diagnostics.maximumAbsoluteEnvelopeViolation).toBeLessThanOrEqual(1e-10);
  }
}

function combineContinuousWeightedTarget(fractions: DunnFractionGrid): Array<number | null> {
  return fractions.forward.map((forward, index) => {
    const reverse = fractions.reverse[index]!;
    const evidence = [forward, reverse].filter((point) => point.fraction !== null && point.confidence > 0);
    const totalConfidence = evidence.reduce((sum, point) => sum + point.confidence, 0);
    if (totalConfidence === 0) return null;
    return evidence.reduce((sum, point) => sum + point.fraction! * point.confidence, 0) / totalConfidence;
  });
}

function fillLinearGaps(values: Array<number | null>): number[] {
  const anchors = values.flatMap((value, index) => value === null ? [] : [index]);
  if (anchors.length === 0) throw new Error("expected raw Dunn evidence");
  return values.map((value, index) => {
    if (value !== null) return value;
    const left = anchors.filter((anchor) => anchor < index).at(-1);
    const right = anchors.find((anchor) => anchor > index);
    if (left === undefined) return values[right!]!;
    if (right === undefined) return values[left]!;
    const blend = (index - left) / (right - left);
    return values[left]! + blend * (values[right]! - values[left]!);
  });
}

function evaluateG(potentials: number[], g: number[], potential: number): number {
  if (potential <= potentials[0]!) return g[0]!;
  if (potential >= potentials.at(-1)!) return g.at(-1)!;
  return pchipInterpolate(potentials, g, [potential])[0]!;
}
